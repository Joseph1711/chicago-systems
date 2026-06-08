import { pgTable, text, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const blackMarketStockTable = pgTable("black_market_stock", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
  price: bigint("price", { mode: "number" }).notNull(),
  priceModifier: integer("price_modifier").notNull().default(100),
  isAvailable: boolean("is_available").notNull().default(true),
  rotatesAt: timestamp("rotates_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const blackMarketTransactionsTable = pgTable("black_market_transactions", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  buyerId: text("buyer_id").notNull(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull(),
  price: bigint("price", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBlackMarketStockSchema = createInsertSchema(blackMarketStockTable).omit({ updatedAt: true });
export type InsertBlackMarketStock = z.infer<typeof insertBlackMarketStockSchema>;
export type BlackMarketStock = typeof blackMarketStockTable.$inferSelect;
