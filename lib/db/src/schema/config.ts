import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guildConfigTable = pgTable("guild_config", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  economyEnabled: boolean("economy_enabled").notNull().default(true),
  marketplaceEnabled: boolean("marketplace_enabled").notNull().default(true),
  marketplaceChannelId: text("marketplace_channel_id"),
  marketplaceMentionRoleId: text("marketplace_mention_role_id"),
  logChannelId: text("log_channel_id"),
  adminRoleId: text("admin_role_id"),
  modRoleId: text("mod_role_id"),
  dailyAmount: integer("daily_amount").notNull().default(500),
  weeklyAmount: integer("weekly_amount").notNull().default(2500),
  currency: text("currency").notNull().default("$"),
  currencyName: text("currency_name").notNull().default("dollars"),
  xpPerMessage: integer("xp_per_message").notNull().default(15),
  xpCooldownSeconds: integer("xp_cooldown_seconds").notNull().default(60),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGuildConfigSchema = createInsertSchema(guildConfigTable).omit({ updatedAt: true });
export type InsertGuildConfig = z.infer<typeof insertGuildConfigSchema>;
export type GuildConfig = typeof guildConfigTable.$inferSelect;
