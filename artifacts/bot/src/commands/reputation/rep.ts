import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getOrCreateUser } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";

const REP_COOLDOWN = 24 * 60 * 60 * 1000;
const repCooldowns = new Map<string, number>();

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("reputacion")
    .setDescription("Sistema de reputación")
    .addSubcommand((s) =>
      s.setName("dar").setDescription("Dar reputación a un usuario")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuario a quien dar rep").setRequired(true))
        .addStringOption((o) => o.setName("tipo").setDescription("Tipo de reputación").setRequired(true).addChoices({ name: "👍 Positiva", value: "positive" }, { name: "👎 Negativa", value: "negative" }))
    )
    .addSubcommand((s) =>
      s.setName("perfil").setDescription("Ver perfil de reputación")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuario a ver").setRequired(false))
    ),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === "dar") {
      const target = interaction.options.getUser("usuario", true);
      const type = interaction.options.getString("tipo", true);

      if (target.id === interaction.user.id) {
        await interaction.reply({ embeds: [errorEmbed("Inválido", "No puedes darte reputación a ti mismo.")], ephemeral: true });
        return;
      }
      if (target.bot) {
        await interaction.reply({ embeds: [errorEmbed("Inválido", "No puedes darle reputación a un bot.")], ephemeral: true });
        return;
      }

      const cooldownKey = `${interaction.user.id}-${target.id}`;
      const lastRep = repCooldowns.get(cooldownKey) ?? 0;
      if (Date.now() - lastRep < REP_COOLDOWN) {
        await interaction.reply({ embeds: [errorEmbed("Espera", "Solo puedes dar reputación al mismo usuario una vez cada 24 horas.")], ephemeral: true });
        return;
      }

      await getOrCreateUser(target.id, interaction.guildId!, target.username);
      const change = type === "positive" ? 1 : -1;
      await db.update(usersTable)
        .set({ reputation: sql`${usersTable.reputation} + ${change}` })
        .where(and(eq(usersTable.discordId, target.id), eq(usersTable.guildId, interaction.guildId!)));

      repCooldowns.set(cooldownKey, Date.now());
      const emoji = type === "positive" ? "👍" : "👎";
      await interaction.reply({
        embeds: [successEmbed("Reputación Otorgada", `¡Le diste ${emoji} reputación **${type === "positive" ? "positiva" : "negativa"}** a ${target}!`)],
      });

    } else {
      const target = interaction.options.getUser("usuario") ?? interaction.user;
      const user = await getOrCreateUser(target.id, interaction.guildId!, target.username);

      let rank = "Neutral";
      if (user.reputation >= 100) rank = "🌟 Leyenda";
      else if (user.reputation >= 50) rank = "⭐ Respetado";
      else if (user.reputation >= 20) rank = "👍 Confiable";
      else if (user.reputation >= 0) rank = "😐 Neutral";
      else if (user.reputation >= -20) rank = "👎 Impopular";
      else rank = "⛔ Notorio";

      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle(`⭐ Reputación de ${target.displayName}`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: "Puntuación", value: `${user.reputation > 0 ? "+" : ""}${user.reputation}`, inline: true },
          { name: "Rango", value: rank, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};

export default command;
