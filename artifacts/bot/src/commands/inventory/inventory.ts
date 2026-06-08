import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { Command } from "../../types/index.js";
import { getOrCreateUser } from "../../utils/helpers.js";
import { getUserInventory } from "../../services/inventoryService.js";
import { Colors, errorEmbed } from "../../utils/embeds.js";

const rarityColors: Record<string, string> = {
  common: "⚪",
  uncommon: "🟢",
  rare: "🔵",
  epic: "🟣",
  legendary: "🟠",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("inventario")
    .setDescription("Ver tu inventario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario a ver").setRequired(false)),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const target = interaction.options.getUser("usuario") ?? interaction.user;
    await getOrCreateUser(target.id, interaction.guildId!, target.username);
    const items = await getUserInventory(target.id, interaction.guildId!);

    if (items.length === 0) {
      await interaction.reply({
        embeds: [errorEmbed("Inventario Vacío", `${target.displayName} no tiene objetos.`)],
        ephemeral: target.id !== interaction.user.id,
      });
      return;
    }

    type InventoryItem = (typeof items)[number];
    const grouped = items.reduce((acc, item) => {
      const cat = item.category ?? "Sin Categoría";
      if (!acc[cat]) acc[cat] = [];
      acc[cat]!.push(item);
      return acc;
    }, {} as Record<string, InventoryItem[]>);

    const embed = new EmbedBuilder()
      .setColor(Colors.Primary)
      .setTitle(`🎒 Inventario de ${target.displayName}`)
      .setThumbnail(target.displayAvatarURL())
      .setTimestamp();

    for (const [category, categoryItems] of Object.entries(grouped)) {
      const value = (categoryItems as InventoryItem[])
        .map((i) => `${rarityColors[i.rarity] ?? "⚪"} ${i.emoji ?? "📦"} **${i.name}** × ${i.quantity}`)
        .join("\n");
      embed.addFields({ name: `📁 ${category}`, value, inline: false });
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
