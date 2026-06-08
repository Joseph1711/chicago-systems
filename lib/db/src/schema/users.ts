import { pgTable, text, integer, bigint, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  guildId: text("guild_id").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  cash: bigint("cash", { mode: "number" }).notNull().default(0),
  bank: bigint("bank", { mode: "number" }).notNull().default(0),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  reputation: integer("reputation").notNull().default(0),
  dirtyMoney: bigint("dirty_money", { mode: "number" }).notNull().default(0),
  isVerified: boolean("is_verified").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  lastDaily: timestamp("last_daily", { withTimezone: true }),
  lastWeekly: timestamp("last_weekly", { withTimezone: true }),
  lastWork: timestamp("last_work", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
