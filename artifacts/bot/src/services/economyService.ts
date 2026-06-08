import { db } from "@workspace/db";
import { usersTable, transactionsTable, guildConfigTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateId } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

export type TransactionType =
  | "transfer"
  | "deposit"
  | "withdraw"
  | "daily"
  | "weekly"
  | "work"
  | "purchase"
  | "sale"
  | "salary"
  | "tax"
  | "investment_return"
  | "loan"
  | "loan_repayment"
  | "property_purchase"
  | "property_rent"
  | "contract_reward"
  | "treasury_grant"
  | "admin_set"
  | "marketplace_sale"
  | "auction_win"
  | "black_market"
  | "drug_sale"
  | "criminal_mission"
  | "money_laundering";

export async function addCash(userId: string, guildId: string, amount: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ cash: sql`${usersTable.cash} + ${amount}` })
    .where(and(eq(usersTable.discordId, userId), eq(usersTable.guildId, guildId)));
}

export async function removeCash(userId: string, guildId: string, amount: number): Promise<boolean> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.discordId, userId), eq(usersTable.guildId, guildId)));
  if (!user || user.cash < amount) return false;

  await db
    .update(usersTable)
    .set({ cash: sql`${usersTable.cash} - ${amount}` })
    .where(and(eq(usersTable.discordId, userId), eq(usersTable.guildId, guildId)));
  return true;
}

export async function addBank(userId: string, guildId: string, amount: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ bank: sql`${usersTable.bank} + ${amount}` })
    .where(and(eq(usersTable.discordId, userId), eq(usersTable.guildId, guildId)));
}

export async function removeBank(userId: string, guildId: string, amount: number): Promise<boolean> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.discordId, userId), eq(usersTable.guildId, guildId)));
  if (!user || user.bank < amount) return false;

  await db
    .update(usersTable)
    .set({ bank: sql`${usersTable.bank} - ${amount}` })
    .where(and(eq(usersTable.discordId, userId), eq(usersTable.guildId, guildId)));
  return true;
}

export async function transfer(
  fromId: string,
  toId: string,
  guildId: string,
  amount: number,
  type: TransactionType = "transfer",
  description?: string
): Promise<{ success: boolean; reason?: string }> {
  const [from] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.discordId, fromId), eq(usersTable.guildId, guildId)));

  if (!from || from.cash < amount) {
    return { success: false, reason: "Insufficient funds" };
  }

  await db
    .update(usersTable)
    .set({ cash: sql`${usersTable.cash} - ${amount}` })
    .where(and(eq(usersTable.discordId, fromId), eq(usersTable.guildId, guildId)));

  await db
    .update(usersTable)
    .set({ cash: sql`${usersTable.cash} + ${amount}` })
    .where(and(eq(usersTable.discordId, toId), eq(usersTable.guildId, guildId)));

  await logTransaction(guildId, fromId, toId, amount, type, description);
  return { success: true };
}

export async function logTransaction(
  guildId: string,
  fromUserId: string | null | undefined,
  toUserId: string | null | undefined,
  amount: number,
  type: TransactionType,
  description?: string
): Promise<void> {
  try {
    await db.insert(transactionsTable).values({
      id: generateId(),
      guildId,
      fromUserId: fromUserId ?? null,
      toUserId: toUserId ?? null,
      amount,
      type,
      description: description ?? null,
    });
  } catch (err) {
    logger.error("Failed to log transaction err");
  }
}

export async function getBalance(userId: string, guildId: string): Promise<{ cash: number; bank: number } | null> {
  const [user] = await db
    .select({ cash: usersTable.cash, bank: usersTable.bank })
    .from(usersTable)
    .where(and(eq(usersTable.discordId, userId), eq(usersTable.guildId, guildId)));
  return user ?? null;
}
