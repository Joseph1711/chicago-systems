import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { getOrCreateUser, formatCurrency } from "../../utils/helpers.js";
import { transfer } from "../../services/economyService.js";
import { successEmbed, errorEmbed } from "../../utils/embeds.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("pagar")
    .setDescription("Paga a otro usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario a pagar").setRequired(true))
    .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad a pagar").setRequired(true).setMinValue(1)),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const target = interaction.options.getUser("usuario", true);
    const amount = interaction.options.getInteger("cantidad", true);

    if (target.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed("Inválido", "No puedes pagarte a ti mismo.")], flags: MessageFlags.Ephemeral });
      return;
    }
    if (target.bot) {
      await interaction.reply({ embeds: [errorEmbed("Inválido", "No puedes pagarle a un bot.")], flags: MessageFlags.Ephemeral });
      return;
    }

    await getOrCreateUser(target.id, interaction.guildId!, target.username);
    const result = await transfer(interaction.user.id, target.id, interaction.guildId!, amount, "transfer");

    if (!result.success) {
      await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `No tienes **${formatCurrency(amount)}** en efectivo.`)], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({
      embeds: [successEmbed("Pago Enviado", `Pagaste **${formatCurrency(amount)}** a ${target}. 💸`)],
    });
  },
};

export default command;
