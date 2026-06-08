import { pgTable, text, integer, bigint, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const drugOperationsTable = pgTable("drug_operations", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  drugType: text("drug_type").notNull(),
  quantity: integer("quantity").notNull().default(1),
  status: text("status").notNull().default("growing"),
  plantedAt: timestamp("planted_at", { withTimezone: true }).notNull().defaultNow(),
  readyAt: timestamp("ready_at", { withTimezone: true }).notNull(),
  harvestedAt: timestamp("harvested_at", { withTimezone: true }),
});

export const criminalMissionsTable = pgTable("criminal_missions", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  missionType: text("mission_type").notNull(),
  status: text("status").notNull().default("active"),
  reward: bigint("reward", { mode: "number" }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completableAt: timestamp("completable_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const moneyLaunderingTable = pgTable("money_laundering", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  dirtyAmount: bigint("dirty_amount", { mode: "number" }).notNull(),
  cleanAmount: bigint("clean_amount", { mode: "number" }).notNull(),
  fee: bigint("fee", { mode: "number" }).notNull(),
  method: text("method").notNull().default("basico"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDrugOperationSchema = createInsertSchema(drugOperationsTable);
export type InsertDrugOperation = z.infer<typeof insertDrugOperationSchema>;
export type DrugOperation = typeof drugOperationsTable.$inferSelect;

export const insertCriminalMissionSchema = createInsertSchema(criminalMissionsTable);
export type InsertCriminalMission = z.infer<typeof insertCriminalMissionSchema>;
export type CriminalMission = typeof criminalMissionsTable.$inferSelect;

export const insertMoneyLaunderingSchema = createInsertSchema(moneyLaunderingTable);
export type InsertMoneyLaundering = z.infer<typeof insertMoneyLaunderingSchema>;
export type MoneyLaundering = typeof moneyLaunderingTable.$inferSelect;
