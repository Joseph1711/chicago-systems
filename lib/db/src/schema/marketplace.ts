import { pgTable, text, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const listingsTable = pgTable("listings", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  sellerId: text("seller_id").notNull(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  price: bigint("price", { mode: "number" }).notNull(),
  type: text("type").notNull().default("sale"),
  status: text("status").notNull().default("active"),
  threadId: text("thread_id"),
  messageId: text("message_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auctionsTable = pgTable("auctions", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  sellerId: text("seller_id").notNull(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  startingBid: bigint("starting_bid", { mode: "number" }).notNull(),
  currentBid: bigint("current_bid", { mode: "number" }).notNull(),
  currentBidderId: text("current_bidder_id"),
  status: text("status").notNull().default("active"),
  threadId: text("thread_id"),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRatingsTable = pgTable("user_ratings", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  raterId: text("rater_id").notNull(),
  ratedId: text("rated_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  listingId: text("listing_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({ createdAt: true });
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;

export const insertAuctionSchema = createInsertSchema(auctionsTable).omit({ createdAt: true });
export type InsertAuction = z.infer<typeof insertAuctionSchema>;
export type Auction = typeof auctionsTable.$inferSelect;
