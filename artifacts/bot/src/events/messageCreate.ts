import { Client, Events, Message } from "discord.js";
import { db } from "@workspace/db";
import { usersTable, guildConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { addXp } from "../services/levelService.js";
import { getOrCreateUser, getOrCreateGuildConfig } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";
import { Collection } from "discord.js";

const xpCooldowns = new Collection<string, number>();

export function registerMessageCreate(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const discordId = message.author.id;
    const key = `${discordId}-${guildId}`;

    try {
      const cfg = await getOrCreateGuildConfig(guildId);
      const cooldownMs = (cfg.xpCooldownSeconds ?? 60) * 1000;
      const lastXp = xpCooldowns.get(key) ?? 0;
      const now = Date.now();

      if (now - lastXp < cooldownMs) return;
      xpCooldowns.set(key, now);

      await getOrCreateUser(discordId, guildId, message.author.username);
      const { leveledUp, newLevel } = await addXp(discordId, guildId, cfg.xpPerMessage ?? 15, client);

      if (leveledUp && message.channel.isTextBased() && "send" in message.channel) {
        await (message.channel as any).send({
          content: `🎉 ${message.author} has reached **Level ${newLevel}**!`,
        }).catch(() => null);
      }
    } catch (err) {
      logger.error("XP processing error", { error: err instanceof Error ? err.message : String(err) });
    }
  });
}
