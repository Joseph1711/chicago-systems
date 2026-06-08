import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { Command } from "../../types/index.js";
import { getOrCreateUser, xpForLevel } from "../../utils/helpers.js";
import { Colors } from "../../utils/embeds.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("nivel")
    .setDescription("Ver tu nivel y XP")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario a consultar").setRequired(false)),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const target = interaction.options.getUser("usuario") ?? interaction.user;
    const user = await getOrCreateUser(target.id, interaction.guildId!, target.username);

    const xpNeeded = xpForLevel(user.level);
    const xpInCurrentLevel = user.xp - [...Array(user.level - 1)].reduce((acc, _, i) => acc + xpForLevel(i + 1), 0);
    const progress = Math.min(Math.floor((xpInCurrentLevel / xpNeeded) * 20), 20);
    const bar = "█".repeat(progress) + "░".repeat(20 - progress);

    const embed = new EmbedBuilder()
      .setColor(Colors.Primary)
      .setTitle(`⭐ Nivel de ${target.displayName}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "Nivel", value: `**${user.level}**`, inline: true },
        { name: "XP Total", value: `${user.xp.toLocaleString()} XP`, inline: true },
        { name: "Progreso", value: `\`${bar}\` ${xpInCurrentLevel}/${xpNeeded} XP`, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
