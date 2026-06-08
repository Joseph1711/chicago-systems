import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ticketConfigTable = pgTable("ticket_config", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  panelChannelId: text("panel_channel_id"),
  logChannelId: text("log_channel_id"),
  categoryId: text("category_id"),
  supportRoleId: text("support_role_id"),
  transcriptChannelId: text("transcript_channel_id"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const ticketsTable = pgTable("tickets", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id").notNull(),
  category: text("category").notNull().default("general"),
  subject: text("subject"),
  status: text("status").notNull().default("open"),
  assignedTo: text("assigned_to"),
  number: integer("number").notNull(),
  closedBy: text("closed_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ createdAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;
