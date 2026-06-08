import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { Command } from "../../types/index.js";
import { getOrCreateUser, formatCurrency } from "../../utils/helpers.js";
import { Colors } from "../../utils/embeds.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Consulta tu saldo o el de otro usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario a consultar").setRequired(false)),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const target = interaction.options.getUser("usuario") ?? interaction.user;
    const user = await getOrCreateUser(target.id, interaction.guildId!, target.username);

    const embed = new EmbedBuilder()
      .setColor(Colors.Economy)
      .setTitle(`💰 Saldo de ${target.displayName}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "💵 Efectivo", value: formatCurrency(user.cash), inline: true },
        { name: "🏦 Banco", value: formatCurrency(user.bank), inline: true },
        { name: "💎 Patrimonio Neto", value: formatCurrency(user.cash + user.bank), inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
