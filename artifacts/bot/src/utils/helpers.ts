import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { usersTable, guildConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export function generateId(): string {
  return randomUUID();
}

export function formatCurrency(amount: number, symbol = "$"): string {
  return `${symbol}${amount.toLocaleString("en-US")}`;
}

export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export async function getOrCreateUser(discordId: string, guildId: string, username: string) {
  const existing = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.discordId, discordId), eq(usersTable.guildId, guildId)))
    .limit(1);

  if (existing[0]) return existing[0];

  const [user] = await db
    .insert(usersTable)
    .values({
      id: generateId(),
      discordId,
      guildId,
      username,
      displayName: username,
    })
    .returning();

  if (!user) throw new Error(`Failed to create user for discordId=${discordId} guildId=${guildId}`);
  return user;
}

export async function getOrCreateGuildConfig(guildId: string) {
  const existing = await db
    .select()
    .from(guildConfigTable)
    .where(eq(guildConfigTable.guildId, guildId))
    .limit(1);

  if (existing[0]) return existing[0];

  const [cfg] = await db
    .insert(guildConfigTable)
    .values({ id: generateId(), guildId })
    .returning();

  if (!cfg) throw new Error(`Failed to create guild config for guildId=${guildId}`);
  return cfg;
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

export function calculateLevel(xp: number): number {
  let level = 1;
  let totalXp = 0;
  while (totalXp + xpForLevel(level) <= xp) {
    totalXp += xpForLevel(level);
    level++;
  }
  return level;
}
