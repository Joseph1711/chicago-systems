import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { shopTable, itemsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { formatCurrency, getOrCreateUser } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { removeCash, logTransaction } from "../../services/economyService.js";
import { addItem } from "../../services/inventoryService.js";

const RARITY_EMOJI: Record<string, string> = {
  common: "⚪",
  uncommon: "🟢",
  rare: "🔵",
  epic: "🟣",
  legendary: "🟠",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("tienda")
    .setDescription("Tienda del servidor")
    .addSubcommand((s) =>
      s.setName("explorar").setDescription("Ver los objetos disponibles en la tienda")
        .addStringOption((o) =>
          o.setName("categoria")
            .setDescription("Filtrar por categoría")
            .setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s.setName("comprar").setDescription("Comprar un objeto de la tienda")
        .addStringOption((o) => o.setName("objeto").setDescription("Nombre del objeto").setRequired(true))
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad a comprar").setRequired(false).setMinValue(1).setMaxValue(99))
    )
    .addSubcommand((s) =>
      s.setName("info").setDescription("Ver detalles de un objeto")
        .addStringOption((o) => o.setName("objeto").setDescription("Nombre del objeto").setRequired(true))
    ),
  cooldown: 3,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === "explorar") {
      const catFilter = interaction.options.getString("categoria");

      const entries = await db
        .select({
          price: shopTable.price,
          stock: shopTable.stock,
          name: itemsTable.name,
          emoji: itemsTable.emoji,
          rarity: itemsTable.rarity,
          category: itemsTable.category,
          description: itemsTable.description,
        })
        .from(shopTable)
        .innerJoin(itemsTable, eq(shopTable.itemId, itemsTable.id))
        .where(and(eq(shopTable.guildId, guildId), eq(shopTable.isActive, true)));

      const filtered = catFilter
        ? entries.filter((e) => e.category.toLowerCase().includes(catFilter.toLowerCase()))
        : entries;

      if (filtered.length === 0) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Primary)
              .setTitle("🛒 Tienda")
              .setDescription(
                catFilter
                  ? `No hay objetos en la categoría **${catFilter}**.`
                  : "La tienda está vacía. Los administradores deben añadir objetos con `/adminshop shop add`."
              )
              .setTimestamp(),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      type Entry = (typeof filtered)[number];
      const grouped = filtered.reduce(
        (acc, e) => {
          const cat = e.category ?? "General";
          if (!acc[cat]) acc[cat] = [];
          acc[cat]!.push(e);
          return acc;
        },
        {} as Record<string, Entry[]>
      );

      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle("🛒 Tienda del Servidor")
        .setFooter({ text: `${filtered.length} objeto(s) disponibles • Usa /tienda comprar <objeto>` })
        .setTimestamp();

      for (const [cat, items] of Object.entries(grouped)) {
        const value = (items as Entry[])
          .map(
            (e) =>
              `${RARITY_EMOJI[e.rarity] ?? "⚪"} ${e.emoji ?? "📦"} **${e.name}** — ${formatCurrency(e.price)} | Stock: ${
                e.stock === -1 ? "∞" : e.stock
              }`
          )
          .join("\n");
        embed.addFields({ name: `📁 ${cat}`, value, inline: false });
      }

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "comprar") {
      const nombreObj = interaction.options.getString("objeto", true);
      const cantidad = interaction.options.getInteger("cantidad") ?? 1;

      const items = await db.select().from(itemsTable)
        .where(and(eq(itemsTable.guildId, guildId), eq(itemsTable.isActive, true)));
      const item = items.find(
        (i) => i.name.toLowerCase() === nombreObj.toLowerCase()
      );

      if (!item) {
        await interaction.reply({
          embeds: [errorEmbed("No encontrado", `No existe ningún objeto llamado **${nombreObj}**.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const [entry] = await db.select().from(shopTable)
        .where(and(eq(shopTable.guildId, guildId), eq(shopTable.itemId, item.id), eq(shopTable.isActive, true)))
        .limit(1);

      if (!entry) {
        await interaction.reply({
          embeds: [errorEmbed("No disponible", `**${item.name}** no está en la tienda.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (entry.stock !== -1 && entry.stock < cantidad) {
        await interaction.reply({
          embeds: [
            errorEmbed(
              "Stock insuficiente",
              `Solo quedan **${entry.stock}** unidades de ${item.emoji ?? "📦"} **${item.name}**.`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const totalCost = entry.price * cantidad;
      await getOrCreateUser(interaction.user.id, guildId, interaction.user.username);

      const paid = await removeCash(interaction.user.id, guildId, totalCost);
      if (!paid) {
        await interaction.reply({
          embeds: [
            errorEmbed(
              "Saldo insuficiente",
              `Necesitas **${formatCurrency(totalCost)}** en efectivo para comprar ${cantidad}x **${item.name}**.`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (entry.stock !== -1) {
        await db.update(shopTable)
          .set({ stock: sql`${shopTable.stock} - ${cantidad}` })
          .where(eq(shopTable.id, entry.id));
      }

      await addItem(interaction.user.id, guildId, item.id, cantidad);
      await logTransaction(guildId, interaction.user.id, null, totalCost, "purchase", `Tienda: ${cantidad}x ${item.name}`);

      await interaction.reply({
        embeds: [
          successEmbed(
            "Compra realizada",
            `Has comprado **${cantidad}x ${item.emoji ?? "📦"} ${item.name}** por **${formatCurrency(totalCost)}**. 🛒`
          ),
        ],
      });

    } else if (sub === "info") {
      const nombreObj = interaction.options.getString("objeto", true);

      const items = await db.select().from(itemsTable)
        .where(and(eq(itemsTable.guildId, guildId), eq(itemsTable.isActive, true)));
      const item = items.find(
        (i) => i.name.toLowerCase() === nombreObj.toLowerCase()
      );

      if (!item) {
        await interaction.reply({
          embeds: [errorEmbed("No encontrado", `No existe ningún objeto llamado **${nombreObj}**.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const [entry] = await db.select().from(shopTable)
        .where(and(eq(shopTable.guildId, guildId), eq(shopTable.itemId, item.id), eq(shopTable.isActive, true)))
        .limit(1);

      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle(`${item.emoji ?? "📦"} ${item.name}`)
        .setDescription(item.description ?? "Sin descripción.")
        .addFields(
          { name: "Rareza", value: `${RARITY_EMOJI[item.rarity] ?? "⚪"} ${item.rarity}`, inline: true },
          { name: "Categoría", value: item.category, inline: true },
          {
            name: "Precio en tienda",
            value: entry ? formatCurrency(entry.price) : "No disponible en tienda",
            inline: true,
          },
          {
            name: "Stock",
            value: entry
              ? entry.stock === -1
                ? "Ilimitado"
                : `${entry.stock} uds.`
              : "—",
            inline: true,
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};

export default command;
