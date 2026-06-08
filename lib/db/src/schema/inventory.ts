import { pgTable, text, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const itemsTable = pgTable("items", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  rarity: text("rarity").notNull().default("common"),
  basePrice: bigint("base_price", { mode: "number" }).notNull().default(0),
  isConsumable: boolean("is_consumable").notNull().default(false),
  isStackable: boolean("is_stackable").notNull().default(true),
  emoji: text("emoji").default("📦"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userInventoryTable = pgTable("user_inventory", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertItemSchema = createInsertSchema(itemsTable).omit({ createdAt: true });
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof itemsTable.$inferSelect;

export const insertUserInventorySchema = createInsertSchema(userInventoryTable).omit({ updatedAt: true });
export type InsertUserInventory = z.infer<typeof insertUserInventorySchema>;
export type UserInventory = typeof userInventoryTable.$inferSelect;
