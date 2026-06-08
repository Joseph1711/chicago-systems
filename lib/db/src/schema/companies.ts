import { pgTable, text, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id").notNull(),
  funds: bigint("funds", { mode: "number" }).notNull().default(0),
  taxRate: integer("tax_rate").notNull().default(15),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyMembersTable = pgTable("company_members", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  role: text("role").notNull().default("employee"),
  salary: bigint("salary", { mode: "number" }).notNull().default(500),
  isActive: boolean("is_active").notNull().default(true),
  hiredAt: timestamp("hired_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyInventoryTable = pgTable("company_inventory", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  guildId: text("guild_id").notNull(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ createdAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;

export const insertCompanyMemberSchema = createInsertSchema(companyMembersTable).omit({ hiredAt: true });
export type InsertCompanyMember = z.infer<typeof insertCompanyMemberSchema>;
export type CompanyMember = typeof companyMembersTable.$inferSelect;
