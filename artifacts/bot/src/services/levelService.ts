import { db } from "@workspace/db";
import { usersTable, levelRewardsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { xpForLevel, calculateLevel } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";
import type { Client, Guild } from "discord.js";

export async function addXp(
  discordId: string,
  guildId: string,
  amount: number,
  client?: Client
): Promise<{ leveledUp: boolean; newLevel: number }> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.discordId, discordId), eq(usersTable.guildId, guildId)));

  if (!user) return { leveledUp: false, newLevel: 1 };

  const oldLevel = user.level;
  const newXp = user.xp + amount;
  const newLevel = calculateLevel(newXp);

  await db
    .update(usersTable)
    .set({ xp: newXp, level: newLevel })
    .where(and(eq(usersTable.discordId, discordId), eq(usersTable.guildId, guildId)));

  if (newLevel > oldLevel && client) {
    await applyLevelRewards(discordId, guildId, newLevel, client);
  }

  return { leveledUp: newLevel > oldLevel, newLevel };
}

async function applyLevelRewards(discordId: string, guildId: string, level: number, client: Client): Promise<void> {
  try {
    const rewards = await db
      .select()
      .from(levelRewardsTable)
      .where(and(eq(levelRewardsTable.guildId, guildId), eq(levelRewardsTable.level, level)));

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;

    for (const reward of rewards) {
      if (reward.roleId) {
        await member.roles.add(reward.roleId).catch(() => null);
      }
    }
  } catch (err) {
    logger.error("Failed to apply level rewards err");
  }
}
