import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { getOrCreateUser } from "../../utils/helpers.js";
import { addItem, removeItem } from "../../services/inventoryService.js";
import { db } from "@workspace/db";
import { userInventoryTable, itemsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { successEmbed, errorEmbed } from "../../utils/embeds.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("dar")
    .setDescription("Darle un objeto a otro usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario destinatario").setRequired(true))
    .addStringOption((o) => o.setName("objeto").setDescription("Nombre del objeto").setRequired(true))
    .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(false).setMinValue(1).setMaxValue(100)),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const target = interaction.options.getUser("usuario", true);
    const itemName = interaction.options.getString("objeto", true);
    const qty = interaction.options.getInteger("cantidad") ?? 1;

    if (target.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed("Inválido", "No puedes darte objetos a ti mismo.")], flags: MessageFlags.Ephemeral });
      return;
    }

    const items = await db.select().from(itemsTable)
      .where(and(eq(itemsTable.guildId, interaction.guildId!), eq(itemsTable.isActive, true)));
    const item = items.find((i) => i.name.toLowerCase() === itemName.toLowerCase());

    if (!item) {
      await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Objeto **${itemName}** no encontrado.`)], flags: MessageFlags.Ephemeral });
      return;
    }

    const removed = await removeItem(interaction.user.id, interaction.guildId!, item.id, qty);
    if (!removed) {
      await interaction.reply({ embeds: [errorEmbed("Cantidad Insuficiente", `No tienes ${qty}x **${item.name}**.`)], flags: MessageFlags.Ephemeral });
      return;
    }

    await getOrCreateUser(target.id, interaction.guildId!, target.username);
    await addItem(target.id, interaction.guildId!, item.id, qty);

    await interaction.reply({
      embeds: [successEmbed("Objeto Entregado", `Le diste **${qty}x ${item.emoji ?? "📦"} ${item.name}** a ${target}. 🎁`)],
    });
  },
};

export default command;
