import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const applicationConfigTable = pgTable("application_config", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  departmentId: text("department_id"),
  type: text("type").notNull(),
  channelId: text("channel_id"),
  reviewChannelId: text("review_channel_id"),
  reviewRoleId: text("review_role_id"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const applicationsTable = pgTable("applications", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  departmentId: text("department_id"),
  status: text("status").notNull().default("pending"),
  answers: text("answers").notNull().default("{}"),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  messageId: text("message_id"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const insertApplicationSchema = createInsertSchema(applicationsTable).omit({ submittedAt: true });
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
