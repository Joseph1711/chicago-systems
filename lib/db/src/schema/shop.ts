import { pgTable, text, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shopTable = pgTable("shop", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  itemId: text("item_id").notNull(),
  price: bigint("price", { mode: "number" }).notNull(),
  stock: integer("stock").notNull().default(-1),
  isActive: boolean("is_active").notNull().default(true),
  addedBy: text("added_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertShopSchema = createInsertSchema(shopTable).omit({ createdAt: true, updatedAt: true });
export type InsertShop = z.infer<typeof insertShopSchema>;
export type Shop = typeof shopTable.$inferSelect;
