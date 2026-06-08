import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const verificationConfigTable = pgTable("verification_config", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  channelId: text("channel_id"),
  logChannelId: text("log_channel_id"),
  verifiedRoleId: text("verified_role_id"),
  unverifiedRoleId: text("unverified_role_id"),
  panelMessageId: text("panel_message_id"),
  antiAltDays: integer("anti_alt_days").notNull().default(7),
  isEnabled: boolean("is_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const verificationLogsTable = pgTable("verification_logs", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  moderatorId: text("moderator_id"),
  action: text("action").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVerificationConfigSchema = createInsertSchema(verificationConfigTable).omit({ updatedAt: true });
export type InsertVerificationConfig = z.infer<typeof insertVerificationConfigSchema>;
export type VerificationConfig = typeof verificationConfigTable.$inferSelect;
