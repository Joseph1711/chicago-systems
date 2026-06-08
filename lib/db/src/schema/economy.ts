import { pgTable, text, integer, bigint, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  fromUserId: text("from_user_id"),
  toUserId: text("to_user_id"),
  amount: bigint("amount", { mode: "number" }).notNull(),
  type: text("type").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobsTable = pgTable("jobs", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  minPay: bigint("min_pay", { mode: "number" }).notNull(),
  maxPay: bigint("max_pay", { mode: "number" }).notNull(),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(60),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxConfigTable = pgTable("tax_config", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  commercialRate: integer("commercial_rate").notNull().default(10),
  businessRate: integer("business_rate").notNull().default(15),
  propertyRate: integer("property_rate").notNull().default(5),
  departmentRate: integer("department_rate").notNull().default(8),
  taxInterval: integer("tax_interval").notNull().default(24),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;

export const insertJobSchema = createInsertSchema(jobsTable).omit({ createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
