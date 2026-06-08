import { pgTable, text, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fleetTypesTable = pgTable("fleet_types", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  departmentId: text("department_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("patrol"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fleetVehiclesTable = pgTable("fleet_vehicles", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  fleetTypeId: text("fleet_type_id").notNull(),
  departmentId: text("department_id").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitCost: bigint("unit_cost", { mode: "number" }).notNull(),
  isSpecial: boolean("is_special").notNull().default(false),
  purchasedBy: text("purchased_by"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFleetTypeSchema = createInsertSchema(fleetTypesTable).omit({ createdAt: true });
export type InsertFleetType = z.infer<typeof insertFleetTypeSchema>;
export type FleetType = typeof fleetTypesTable.$inferSelect;

export const insertFleetVehicleSchema = createInsertSchema(fleetVehiclesTable).omit({ purchasedAt: true });
export type InsertFleetVehicle = z.infer<typeof insertFleetVehicleSchema>;
export type FleetVehicle = typeof fleetVehiclesTable.$inferSelect;
