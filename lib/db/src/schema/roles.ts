import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const autoRolesTable = pgTable("auto_roles", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  roleId: text("role_id").notNull(),
  trigger: text("trigger").notNull(),
  triggerValue: text("trigger_value"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const temporaryRolesTable = pgTable("temporary_roles", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  roleId: text("role_id").notNull(),
  reason: text("reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  assignedBy: text("assigned_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const levelRewardsTable = pgTable("level_rewards", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  level: integer("level").notNull(),
  roleId: text("role_id"),
  cashReward: integer("cash_reward").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAutoRoleSchema = createInsertSchema(autoRolesTable).omit({ createdAt: true });
export type InsertAutoRole = z.infer<typeof insertAutoRoleSchema>;
export type AutoRole = typeof autoRolesTable.$inferSelect;
