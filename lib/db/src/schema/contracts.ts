import { pgTable, text, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contractsTable = pgTable("contracts", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull().default("public"),
  issuedBy: text("issued_by").notNull(),
  assignedTo: text("assigned_to"),
  reward: bigint("reward", { mode: "number" }).notNull(),
  status: text("status").notNull().default("open"),
  deadline: timestamp("deadline", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContractSchema = createInsertSchema(contractsTable).omit({ createdAt: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;
