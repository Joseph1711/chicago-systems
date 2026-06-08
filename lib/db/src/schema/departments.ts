import { pgTable, text, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const departmentsTable = pgTable("departments", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  acronym: text("acronym").notNull(),
  description: text("description"),
  budget: bigint("budget", { mode: "number" }).notNull().default(0),
  roleId: text("role_id"),
  channelId: text("channel_id"),
  logChannelId: text("log_channel_id"),
  emoji: text("emoji").default("🏛️"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const departmentMembersTable = pgTable("department_members", {
  id: text("id").primaryKey(),
  departmentId: text("department_id").notNull(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  rank: text("rank").notNull().default("Recruit"),
  salary: bigint("salary", { mode: "number" }).notNull().default(500),
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const departmentInventoryTable = pgTable("department_inventory", {
  id: text("id").primaryKey(),
  departmentId: text("department_id").notNull(),
  guildId: text("guild_id").notNull(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const departmentAuditsTable = pgTable("department_audits", {
  id: text("id").primaryKey(),
  departmentId: text("department_id").notNull(),
  guildId: text("guild_id").notNull(),
  performedBy: text("performed_by").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  amount: bigint("amount", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDepartmentSchema = createInsertSchema(departmentsTable).omit({ createdAt: true });
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departmentsTable.$inferSelect;

export const insertDepartmentMemberSchema = createInsertSchema(departmentMembersTable).omit({ joinedAt: true });
export type InsertDepartmentMember = z.infer<typeof insertDepartmentMemberSchema>;
export type DepartmentMember = typeof departmentMembersTable.$inferSelect;
