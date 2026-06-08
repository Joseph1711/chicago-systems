import { pgTable, text, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const propertiesTable = pgTable("properties", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  price: bigint("price", { mode: "number" }).notNull(),
  rentPrice: bigint("rent_price", { mode: "number" }),
  ownerId: text("owner_id"),
  renterId: text("renter_id"),
  status: text("status").notNull().default("available"),
  address: text("address"),
  emoji: text("emoji").default("🏠"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const propertyTransactionsTable = pgTable("property_transactions", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  propertyId: text("property_id").notNull(),
  fromUserId: text("from_user_id"),
  toUserId: text("to_user_id").notNull(),
  transactionType: text("transaction_type").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPropertySchema = createInsertSchema(propertiesTable).omit({ createdAt: true, updatedAt: true });
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof propertiesTable.$inferSelect;
