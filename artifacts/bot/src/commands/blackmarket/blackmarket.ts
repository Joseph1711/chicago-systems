import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { blackMarketStockTable, blackMarketTransactionsTable, itemsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId, formatCurrency, getOrCreateUser } from "../../utils/helpers.js";
import { Colors, errorEmbed, successEmbed } from "../../utils/embeds.js";
import { removeCash, logTransaction } from "../../services/economyService.js";
import { addItem } from "../../services/inventoryService.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("mercadonegro")
    .setDescription("Acceder al mercado negro")
    .addSubcommand((s) => s.setName("explorar").setDescription("Explorar objetos del mercado negro"))
    .addSubcommand((s) =>
      s.setName("comprar").setDescription("Comprar del mercado negro")
        .addStringOption((o) => o.setName("id").setDescription("ID del stock").setRequired(true))
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(false).setMinValue(1))
    ),
  cooldown: 10,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === "explorar") {
      const stock = await db
        .select({
          id: blackMarketStockTable.id,
          quantity: blackMarketStockTable.quantity,
          price: blackMarketStockTable.price,
          priceModifier: blackMarketStockTable.priceModifier,
          rotatesAt: blackMarketStockTable.rotatesAt,
          name: itemsTable.name,
          emoji: itemsTable.emoji,
          description: itemsTable.description,
          rarity: itemsTable.rarity,
        })
        .from(blackMarketStockTable)
        .innerJoin(itemsTable, eq(blackMarketStockTable.itemId, itemsTable.id))
        .where(and(eq(blackMarketStockTable.guildId, interaction.guildId!), eq(blackMarketStockTable.isAvailable, true)));

      if (stock.length === 0) {
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(Colors.BlackMarket)
            .setTitle("🕵️ Mercado Negro")
            .setDescription("El mercado está vacío por ahora. El stock rota cada 6 horas.\n\n*Vuelve más tarde...*")
            .setTimestamp()],
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.BlackMarket)
        .setTitle("🕵️ Mercado Negro")
        .setDescription("*Estas ofertas no durarán mucho...*\n\n" +
          stock.map((s) =>
            `\`${s.id.slice(0, 8)}\` ${s.emoji ?? "📦"} **${s.name}** × ${s.quantity}\n💰 ${formatCurrency(s.price)} — Rota <t:${Math.floor(new Date(s.rotatesAt).getTime() / 1000)}:R>`
          ).join("\n\n")
        )
        .setFooter({ text: "Usa /mercadonegro comprar <id> para adquirir • El stock rota cada 6 horas" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === "comprar") {
      const stockIdPrefix = interaction.options.getString("id", true);
      const qty = interaction.options.getInteger("cantidad") ?? 1;

      const allStock = await db.select().from(blackMarketStockTable)
        .where(and(eq(blackMarketStockTable.guildId, interaction.guildId!), eq(blackMarketStockTable.isAvailable, true)));
      const stock = allStock.find((s) => s.id.startsWith(stockIdPrefix));

      if (!stock) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", "Stock no encontrado o agotado.")], ephemeral: true });
        return;
      }
      if (stock.quantity < qty) {
        await interaction.reply({ embeds: [errorEmbed("Stock Insuficiente", `Solo hay ${stock.quantity} disponibles.`)], ephemeral: true });
        return;
      }

      const totalCost = stock.price * qty;
      await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);
      const paid = await removeCash(interaction.user.id, interaction.guildId!, totalCost);

      if (!paid) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `Necesitas **${formatCurrency(totalCost)}** en efectivo.`)], ephemeral: true });
        return;
      }

      await addItem(interaction.user.id, interaction.guildId!, stock.itemId, qty);

      const newQty = stock.quantity - qty;
      await db.update(blackMarketStockTable)
        .set({ quantity: newQty, isAvailable: newQty > 0 })
        .where(eq(blackMarketStockTable.id, stock.id));

      await db.insert(blackMarketTransactionsTable).values({
        id: generateId(),
        guildId: interaction.guildId!,
        buyerId: interaction.user.id,
        itemId: stock.itemId,
        quantity: qty,
        price: totalCost,
      });
      await logTransaction(interaction.guildId!, interaction.user.id, null, totalCost, "black_market");

      const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, stock.itemId)).limit(1);
      await interaction.reply({
        embeds: [successEmbed("Compra Completada", `Compraste **${qty}x ${item?.emoji ?? "📦"} ${item?.name ?? "objeto"}** por **${formatCurrency(totalCost)}**. 🕵️`)],
        ephemeral: true,
      });
    }
  },
};

export default command;
