import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { Colors } from "../../utils/embeds.js";
import { formatCurrency } from "../../utils/helpers.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("tabla")
    .setDescription("Ver la tabla de clasificación del servidor")
    .addStringOption((o) =>
      o.setName("tipo")
        .setDescription("Tipo de clasificación")
        .setRequired(false)
        .addChoices(
          { name: "💰 Más Ricos", value: "wealth" },
          { name: "⭐ Top Niveles", value: "level" },
          { name: "🌟 Reputación", value: "reputation" }
        )
    ),
  cooldown: 10,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const type = interaction.options.getString("tipo") ?? "wealth";

    let users: any[];
    let title: string;

    if (type === "wealth") {
      users = await db.select().from(usersTable)
        .where(eq(usersTable.guildId, interaction.guildId!))
        .orderBy(desc(sql`${usersTable.cash} + ${usersTable.bank}`))
        .limit(10);
      title = "💰 Miembros Más Ricos";
    } else if (type === "level") {
      users = await db.select().from(usersTable)
        .where(eq(usersTable.guildId, interaction.guildId!))
        .orderBy(desc(usersTable.level), desc(usersTable.xp))
        .limit(10);
      title = "⭐ Top Niveles";
    } else {
      users = await db.select().from(usersTable)
        .where(eq(usersTable.guildId, interaction.guildId!))
        .orderBy(desc(usersTable.reputation))
        .limit(10);
      title = "🌟 Top Reputación";
    }

    const medals = ["🥇", "🥈", "🥉"];
    const description = users.map((u, i) => {
      const medal = medals[i] ?? `**${i + 1}.**`;
      const value = type === "wealth"
        ? formatCurrency(u.cash + u.bank)
        : type === "level"
        ? `Nivel ${u.level} (${u.xp.toLocaleString()} XP)`
        : `${u.reputation} rep`;
      return `${medal} <@${u.discordId}> — ${value}`;
    }).join("\n") || "Sin datos aún.";

    const embed = new EmbedBuilder()
      .setColor(Colors.Economy)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
