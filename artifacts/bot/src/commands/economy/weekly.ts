import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { getOrCreateUser, getOrCreateGuildConfig, formatCurrency, formatTime } from "../../utils/helpers.js";
import { addCash, logTransaction } from "../../services/economyService.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { successEmbed, errorEmbed } from "../../utils/embeds.js";

const WEEKLY_COOLDOWN = 7 * 24 * 60 * 60 * 1000;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("semanal")
    .setDescription("Reclama tu recompensa semanal"),
  cooldown: 3,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);
    const cfg = await getOrCreateGuildConfig(interaction.guildId!);
    const now = Date.now();

    if (user.lastWeekly) {
      const diff = now - new Date(user.lastWeekly).getTime();
      if (diff < WEEKLY_COOLDOWN) {
        const remaining = WEEKLY_COOLDOWN - diff;
        await interaction.reply({
          embeds: [errorEmbed("Ya Reclamado", `Puedes volver a reclamar tu semanal en **${formatTime(remaining)}**.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    const amount = cfg.weeklyAmount ?? 2500;
    await addCash(interaction.user.id, interaction.guildId!, amount);
    await db.update(usersTable)
      .set({ lastWeekly: new Date() })
      .where(and(eq(usersTable.discordId, interaction.user.id), eq(usersTable.guildId, interaction.guildId!)));
    await logTransaction(interaction.guildId!, null, interaction.user.id, amount, "weekly", "Recompensa semanal");

    await interaction.reply({
      embeds: [successEmbed("Recompensa Semanal", `¡Reclamaste tu recompensa semanal de **${formatCurrency(amount)}**! 💰`)],
    });
  },
};

export default command;
