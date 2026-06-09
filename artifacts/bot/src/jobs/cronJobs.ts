import cron from "node-cron";
import { Client } from "discord.js";
import { db } from "@workspace/db";
import {
  investmentsTable,
  usersTable,
  blackMarketStockTable,
  itemsTable,
  temporaryRolesTable,
  auctionsTable,
  loansTable,
  treasuryTable,
  taxConfigTable,
  departmentsTable,
  departmentMembersTable,
  companyMembersTable,
  companiesTable,
  savingsAccountsTable,
  vehicleDamageReportsTable,
  fleetVehiclesTable,
} from "@workspace/db";
import { eq, lte, and, sql, gt, ne } from "drizzle-orm";
import { generateId, randomBetween, formatCurrency } from "../utils/helpers.js";
import { addCash, addBank, logTransaction } from "../services/economyService.js";
import { addItem } from "../services/inventoryService.js";
import { logger } from "../utils/logger.js";

export function startCronJobs(client: Client): void {
  // Process mature investments every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    try {
      const now = new Date();
      const matureInvestments = await db
        .select()
        .from(investmentsTable)
        .where(and(eq(investmentsTable.status, "active"), lte(investmentsTable.matureAt, now)));

      for (const inv of matureInvestments) {
        const returns = Math.floor(inv.amount * (1 + inv.returnRate / 100));
        await addBank(inv.userId, inv.guildId, returns);
        await logTransaction(inv.guildId, null, inv.userId, returns, "investment_return", `${inv.type} investment matured`);
        await db.update(investmentsTable).set({ status: "completed" }).where(eq(investmentsTable.id, inv.id));
        logger.debug("Investment matured", { userId: inv.userId, amount: returns });
      }
    } catch (err) {
      logger.error("Investment cron error", { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Rotate black market stock every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    try {
      const now = new Date();
      const expired = await db
        .select()
        .from(blackMarketStockTable)
        .where(lte(blackMarketStockTable.rotatesAt, now));

      for (const stock of expired) {
        const items = await db
          .select()
          .from(itemsTable)
          .where(and(eq(itemsTable.guildId, stock.guildId), eq(itemsTable.isActive, true)));

        if (items.length === 0) continue;

        const randomItem = items[Math.floor(Math.random() * items.length)]!;
        const newPrice = Math.floor(randomItem.basePrice * (randomBetween(80, 150) / 100));
        const newQuantity = randomBetween(1, 10);
        const nextRotation = new Date(Date.now() + 6 * 60 * 60 * 1000);

        await db.update(blackMarketStockTable).set({
          itemId: randomItem.id,
          quantity: newQuantity,
          price: newPrice,
          priceModifier: randomBetween(80, 150),
          isAvailable: true,
          rotatesAt: nextRotation,
        }).where(eq(blackMarketStockTable.id, stock.id));
      }
      logger.debug("Black market stock rotated");
    } catch (err) {
      logger.error("Black market rotation error", { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Remove expired temporary roles every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      const now = new Date();
      const expired = await db
        .select()
        .from(temporaryRolesTable)
        .where(lte(temporaryRolesTable.expiresAt, now));

      for (const tempRole of expired) {
        const guild = client.guilds.cache.get(tempRole.guildId);
        if (guild) {
          const member = await guild.members.fetch(tempRole.userId).catch(() => null);
          if (member) {
            await member.roles.remove(tempRole.roleId).catch(() => null);
          }
        }
        await db.delete(temporaryRolesTable).where(eq(temporaryRolesTable.id, tempRole.id));
      }
    } catch (err) {
      logger.error("Temp roles cron error", { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // End expired auctions every 2 minutes
  cron.schedule("*/2 * * * *", async () => {
    try {
      const now = new Date();
      const expiredAuctions = await db
        .select()
        .from(auctionsTable)
        .where(and(eq(auctionsTable.status, "active"), lte(auctionsTable.endsAt, now)));

      for (const auction of expiredAuctions) {
        await db.update(auctionsTable).set({ status: "ended" }).where(eq(auctionsTable.id, auction.id));

        if (auction.currentBidderId) {
          await addItem(auction.currentBidderId, auction.guildId, auction.itemId, auction.quantity);
          await addCash(auction.sellerId, auction.guildId, auction.currentBid);
          await logTransaction(auction.guildId, auction.currentBidderId, auction.sellerId, auction.currentBid, "auction_win");
        } else {
          // No bids — return item to seller
          await addItem(auction.sellerId, auction.guildId, auction.itemId, auction.quantity);
        }

        const guild = client.guilds.cache.get(auction.guildId);
        if (guild && auction.threadId) {
          const thread = await guild.channels.fetch(auction.threadId).catch(() => null) as any;
          if (thread) {
            const winnerText = auction.currentBidderId
              ? `<@${auction.currentBidderId}> won with a bid of ${formatCurrency(auction.currentBid)}!`
              : "No bids were placed. Auction ended with no winner.";
            await thread.send({ content: `🔨 **Auction Ended!** ${winnerText}` }).catch(() => null);
            await thread.setArchived(true).catch(() => null);
          }
        }
      }
    } catch (err) {
      logger.error("Auction cron error", { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Pay salaries every 24 hours (midnight)
  cron.schedule("0 0 * * *", async () => {
    try {
      // Department salaries
      const deptMembers = await db
        .select()
        .from(departmentMembersTable)
        .where(eq(departmentMembersTable.isActive, true));

      for (const member of deptMembers) {
        if (member.salary > 0) {
          await addCash(member.userId, member.guildId, member.salary);
          await logTransaction(member.guildId, null, member.userId, member.salary, "salary", "Department salary");

          // Deduct from department budget
          await db.update(departmentsTable)
            .set({ budget: sql`${departmentsTable.budget} - ${member.salary}` })
            .where(eq(departmentsTable.id, member.departmentId));
        }
      }

      // Company salaries
      const companyMembers = await db
        .select()
        .from(companyMembersTable)
        .where(eq(companyMembersTable.isActive, true));

      for (const member of companyMembers) {
        if (member.salary > 0) {
          const [company] = await db
            .select()
            .from(companiesTable)
            .where(eq(companiesTable.id, member.companyId));

          if (company && company.funds >= member.salary) {
            await addCash(member.userId, member.guildId, member.salary);
            await db.update(companiesTable)
              .set({ funds: sql`${companiesTable.funds} - ${member.salary}` })
              .where(eq(companiesTable.id, member.companyId));
            await logTransaction(member.guildId, null, member.userId, member.salary, "salary", `${company.name} salary`);
          }
        }
      }

      logger.info("Salary payouts processed");
    } catch (err) {
      logger.error("Salary cron error", { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Apply savings interest every 24 hours
  cron.schedule("0 6 * * *", async () => {
    try {
      const accounts = await db.select().from(savingsAccountsTable).where(gt(savingsAccountsTable.balance, 0));
      for (const acc of accounts) {
        const interest = Math.floor(acc.balance * (acc.interestRate / 100));
        if (interest > 0) {
          await db.update(savingsAccountsTable)
            .set({ balance: sql`${savingsAccountsTable.balance} + ${interest}` })
            .where(eq(savingsAccountsTable.id, acc.id));
          await logTransaction(acc.guildId, null, acc.userId, interest, "investment_return", "Savings interest");
        }
      }
      logger.info("Savings interest applied");
    } catch (err) {
      logger.error("Savings interest cron error", { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Process completed vehicle repairs every hour
  cron.schedule("0 * * * *", async () => {
    try {
      const now = new Date();
      const completed = await db.select().from(vehicleDamageReportsTable)
        .where(and(
          eq(vehicleDamageReportsTable.status, "repairing"),
          lte(vehicleDamageReportsTable.repairCompletesAt, now)
        ));

      for (const report of completed) {
        await db.update(vehicleDamageReportsTable)
          .set({ status: "returned" })
          .where(eq(vehicleDamageReportsTable.id, report.id));

        logger.info("Vehicle repair completed", {
          departmentId: report.departmentId,
          vehicle: `${report.make} ${report.model}`,
          units: report.units,
        });
      }

      if (completed.length > 0) {
        logger.info("Vehicle repairs processed", { count: completed.length });
      }
    } catch (err) {
      logger.error("Vehicle repair cron error", { error: err instanceof Error ? err.message : String(err) });
    }
  });

  logger.info("Cron jobs started");
}
