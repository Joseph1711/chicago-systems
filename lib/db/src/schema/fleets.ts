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

export const vehicleDamageReportsTable = pgTable("vehicle_damage_reports", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  departmentId: text("department_id").notNull(),
  fleetVehicleId: text("fleet_vehicle_id").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  units: integer("units").notNull().default(1),
  damageLevel: text("damage_level").notNull(),
  description: text("description"),
  isTotal: boolean("is_total").notNull().default(false),
  repairDays: integer("repair_days"),
  repairCompletesAt: timestamp("repair_completes_at", { withTimezone: true }),
  compensation: bigint("compensation", { mode: "number" }),
  status: text("status").notNull().default("repairing"),
  reportedBy: text("reported_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVehicleDamageReportSchema = createInsertSchema(vehicleDamageReportsTable).omit({ createdAt: true });
export type InsertVehicleDamageReport = z.infer<typeof insertVehicleDamageReportSchema>;
export type VehicleDamageReport = typeof vehicleDamageReportsTable.$inferSelect;

export const insertFleetTypeSchema = createInsertSchema(fleetTypesTable).omit({ createdAt: true });
export type InsertFleetType = z.infer<typeof insertFleetTypeSchema>;
export type FleetType = typeof fleetTypesTable.$inferSelect;

export const insertFleetVehicleSchema = createInsertSchema(fleetVehiclesTable).omit({ purchasedAt: true });
export type InsertFleetVehicle = z.infer<typeof insertFleetVehicleSchema>;
export type FleetVehicle = typeof fleetVehiclesTable.$inferSelect;
