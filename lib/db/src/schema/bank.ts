import { pgTable, text, integer, bigint, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savingsAccountsTable = pgTable("savings_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  interestRate: integer("interest_rate").notNull().default(2),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const investmentsTable = pgTable("investments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  type: text("type").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  returnRate: integer("return_rate").notNull(),
  riskLevel: text("risk_level").notNull(),
  status: text("status").notNull().default("active"),
  matureAt: timestamp("mature_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loansTable = pgTable("loans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  principal: bigint("principal", { mode: "number" }).notNull(),
  balance: bigint("balance", { mode: "number" }).notNull(),
  interestRate: integer("interest_rate").notNull().default(5),
  status: text("status").notNull().default("active"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const treasuryTable = pgTable("treasury", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInvestmentSchema = createInsertSchema(investmentsTable).omit({ createdAt: true });
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Investment = typeof investmentsTable.$inferSelect;

export const insertLoanSchema = createInsertSchema(loansTable).omit({ createdAt: true });
export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type Loan = typeof loansTable.$inferSelect;
