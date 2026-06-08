import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../types/index.js";
import { getOrCreateUser, formatCurrency, formatTime, randomBetween } from "../../utils/helpers.js";
import { addCash, logTransaction } from "../../services/economyService.js";
import { db } from "@workspace/db";
import { usersTable, jobsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { successEmbed, errorEmbed } from "../../utils/embeds.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("trabajar")
    .setDescription("Trabaja para ganar dinero"),
  cooldown: 3,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);

    const jobs = await db.select().from(jobsTable)
      .where(and(eq(jobsTable.guildId, interaction.guildId!), eq(jobsTable.isActive, true)));

    const defaultJobs = [
      { name: "Oficial de Policía", minPay: 300, maxPay: 600, cooldownMinutes: 60 },
      { name: "Bombero", minPay: 250, maxPay: 500, cooldownMinutes: 60 },
      { name: "Paramédico", minPay: 200, maxPay: 450, cooldownMinutes: 60 },
      { name: "Mecánico", minPay: 150, maxPay: 350, cooldownMinutes: 60 },
      { name: "Conductor", minPay: 100, maxPay: 300, cooldownMinutes: 60 },
    ];

    const allJobs = jobs.length > 0 ? jobs : defaultJobs;
    const job = allJobs[Math.floor(Math.random() * allJobs.length)]!;
    const cooldownMs = (job.cooldownMinutes ?? 60) * 60 * 1000;

    if (user.lastWork) {
      const diff = Date.now() - new Date(user.lastWork).getTime();
      if (diff < cooldownMs) {
        const remaining = cooldownMs - diff;
        await interaction.reply({
          embeds: [errorEmbed("En Descanso", `Puedes trabajar de nuevo en **${formatTime(remaining)}**.`)],
          ephemeral: true,
        });
        return;
      }
    }

    const pay = randomBetween(job.minPay, job.maxPay);
    await addCash(interaction.user.id, interaction.guildId!, pay);
    await db.update(usersTable)
      .set({ lastWork: new Date() })
      .where(and(eq(usersTable.discordId, interaction.user.id), eq(usersTable.guildId, interaction.guildId!)));
    await logTransaction(interaction.guildId!, null, interaction.user.id, pay, "work", `Trabajó como ${job.name}`);

    await interaction.reply({
      embeds: [successEmbed("Trabajo Completado", `Trabajaste como **${job.name}** y ganaste **${formatCurrency(pay)}**! 💼`)],
    });
  },
};

export default command;
