import { db } from "@workspace/db";
import { userInventoryTable, itemsTable, departmentInventoryTable, companyInventoryTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateId } from "../utils/helpers.js";

export async function addItem(userId: string, guildId: string, itemId: string, qty = 1): Promise<void> {
  const existing = await db
    .select()
    .from(userInventoryTable)
    .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.guildId, guildId), eq(userInventoryTable.itemId, itemId)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(userInventoryTable)
      .set({ quantity: sql`${userInventoryTable.quantity} + ${qty}` })
      .where(eq(userInventoryTable.id, existing[0].id));
  } else {
    await db.insert(userInventoryTable).values({
      id: generateId(),
      userId,
      guildId,
      itemId,
      quantity: qty,
    });
  }
}

export async function removeItem(userId: string, guildId: string, itemId: string, qty = 1): Promise<boolean> {
  const existing = await db
    .select()
    .from(userInventoryTable)
    .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.guildId, guildId), eq(userInventoryTable.itemId, itemId)))
    .limit(1);

  if (!existing[0] || existing[0].quantity < qty) return false;

  if (existing[0].quantity === qty) {
    await db.delete(userInventoryTable).where(eq(userInventoryTable.id, existing[0].id));
  } else {
    await db
      .update(userInventoryTable)
      .set({ quantity: sql`${userInventoryTable.quantity} - ${qty}` })
      .where(eq(userInventoryTable.id, existing[0].id));
  }
  return true;
}

export async function getUserInventory(userId: string, guildId: string) {
  return db
    .select({
      id: userInventoryTable.id,
      itemId: userInventoryTable.itemId,
      quantity: userInventoryTable.quantity,
      name: itemsTable.name,
      description: itemsTable.description,
      category: itemsTable.category,
      rarity: itemsTable.rarity,
      emoji: itemsTable.emoji,
      basePrice: itemsTable.basePrice,
    })
    .from(userInventoryTable)
    .innerJoin(itemsTable, eq(userInventoryTable.itemId, itemsTable.id))
    .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.guildId, guildId)));
}
