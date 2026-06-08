import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { listingsTable, auctionsTable, itemsTable, userInventoryTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId, formatCurrency, getOrCreateUser, getOrCreateGuildConfig } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { removeCash, addCash, logTransaction } from "../../services/economyService.js";
import { addItem, removeItem } from "../../services/inventoryService.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("mercado")
    .setDescription("Comandos del mercado")
    .addSubcommand((s) =>
      s.setName("lista").setDescription("Ver listados activos del mercado")
    )
    .addSubcommand((s) =>
      s.setName("vender").setDescription("Publicar un objeto en venta")
        .addStringOption((o) => o.setName("objeto").setDescription("Nombre del objeto").setRequired(true))
        .addIntegerOption((o) => o.setName("precio").setDescription("Precio de venta").setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad a vender").setRequired(false).setMinValue(1))
    )
    .addSubcommand((s) =>
      s.setName("comprar").setDescription("Comprar un listado")
        .addStringOption((o) => o.setName("id").setDescription("ID del listado").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("subasta").setDescription("Publicar un objeto en subasta")
        .addStringOption((o) => o.setName("objeto").setDescription("Nombre del objeto").setRequired(true))
        .addIntegerOption((o) => o.setName("oferta_inicial").setDescription("Oferta inicial").setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName("horas").setDescription("Duración de la subasta en horas").setRequired(true).setMinValue(1).setMaxValue(72))
    )
    .addSubcommand((s) =>
      s.setName("pujar").setDescription("Hacer una oferta en una subasta")
        .addStringOption((o) => o.setName("id").setDescription("ID de la subasta").setRequired(true))
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Monto de la oferta").setRequired(true).setMinValue(1))
    )
    .addSubcommand((s) =>
      s.setName("cancelar").setDescription("Cancelar tu listado")
        .addStringOption((o) => o.setName("id").setDescription("ID del listado").setRequired(true))
    ),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === "lista") {
      const listings = await db
        .select({
          id: listingsTable.id,
          sellerId: listingsTable.sellerId,
          price: listingsTable.price,
          quantity: listingsTable.quantity,
          type: listingsTable.type,
          name: itemsTable.name,
          emoji: itemsTable.emoji,
          rarity: itemsTable.rarity,
        })
        .from(listingsTable)
        .innerJoin(itemsTable, eq(listingsTable.itemId, itemsTable.id))
        .where(and(eq(listingsTable.guildId, interaction.guildId!), eq(listingsTable.status, "active")))
        .limit(15);

      if (listings.length === 0) {
        await interaction.reply({ embeds: [errorEmbed("Mercado Vacío", "Sin listados activos. Usa `/mercado vender` para publicar un objeto.")], ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.Economy)
        .setTitle("🛒 Mercado")
        .setDescription(listings.map((l) =>
          `\`${l.id.slice(0, 8)}\` ${l.emoji ?? "📦"} **${l.name}** × ${l.quantity}\n💰 ${formatCurrency(l.price)} — <@${l.sellerId}>`
        ).join("\n\n"))
        .setFooter({ text: "Usa /mercado comprar <id> para adquirir" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "vender") {
      const itemName = interaction.options.getString("objeto", true);
      const price = interaction.options.getInteger("precio", true);
      const qty = interaction.options.getInteger("cantidad") ?? 1;
      const cfg = await getOrCreateGuildConfig(interaction.guildId!);

      const items = await db.select().from(itemsTable)
        .where(and(eq(itemsTable.guildId, interaction.guildId!), eq(itemsTable.isActive, true)));
      const item = items.find((i) => i.name.toLowerCase() === itemName.toLowerCase());

      if (!item) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Objeto **${itemName}** no encontrado.`)], ephemeral: true });
        return;
      }

      const removed = await removeItem(interaction.user.id, interaction.guildId!, item.id, qty);
      if (!removed) {
        await interaction.reply({ embeds: [errorEmbed("Objetos Insuficientes", `No tienes ${qty}x **${item.name}** en tu inventario.`)], ephemeral: true });
        return;
      }

      const listingId = generateId();
      await db.insert(listingsTable).values({
        id: listingId,
        guildId: interaction.guildId!,
        sellerId: interaction.user.id,
        itemId: item.id,
        quantity: qty,
        price,
        type: "sale",
        status: "active",
      });

      if (cfg.marketplaceChannelId) {
        const channel = interaction.guild?.channels.cache.get(cfg.marketplaceChannelId) as any;
        if (channel?.isTextBased()) {
          const mentionText = cfg.marketplaceMentionRoleId ? `<@&${cfg.marketplaceMentionRoleId}> ` : "";
          const postEmbed = new EmbedBuilder()
            .setColor(Colors.Economy)
            .setTitle(`🛒 ${item.emoji ?? "📦"} ${item.name} En Venta`)
            .addFields(
              { name: "Cantidad", value: `${qty}`, inline: true },
              { name: "Precio", value: formatCurrency(price), inline: true },
              { name: "Vendedor", value: `<@${interaction.user.id}>`, inline: true },
              { name: "ID del Listado", value: `\`${listingId.slice(0, 8)}\``, inline: true }
            )
            .setTimestamp();

          const msg = await channel.send({ content: mentionText, embeds: [postEmbed] }).catch(() => null);
          if (msg?.hasThread === false) {
            const thread = await msg?.startThread({ name: `${item.name} — ${interaction.user.username}`, autoArchiveDuration: ThreadAutoArchiveDuration.OneDay }).catch(() => null);
            if (thread) {
              await db.update(listingsTable).set({ threadId: thread.id, messageId: msg.id }).where(eq(listingsTable.id, listingId));
            }
          }
        }
      }

      await interaction.reply({
        embeds: [successEmbed("Publicado en Venta", `Publicaste **${qty}x ${item.emoji ?? "📦"} ${item.name}** por **${formatCurrency(price)}**.\nID: \`${listingId.slice(0, 8)}\``)],
        ephemeral: true,
      });

    } else if (sub === "comprar") {
      const listingIdPrefix = interaction.options.getString("id", true);

      const allListings = await db.select().from(listingsTable)
        .where(and(eq(listingsTable.guildId, interaction.guildId!), eq(listingsTable.status, "active")));
      const listing = allListings.find((l) => l.id.startsWith(listingIdPrefix));

      if (!listing) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", "Listado no encontrado o ya vendido.")], ephemeral: true });
        return;
      }
      if (listing.sellerId === interaction.user.id) {
        await interaction.reply({ embeds: [errorEmbed("Inválido", "No puedes comprar tu propio listado.")], ephemeral: true });
        return;
      }

      await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);
      const paid = await removeCash(interaction.user.id, interaction.guildId!, listing.price);
      if (!paid) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `Necesitas **${formatCurrency(listing.price)}** para comprar esto.`)], ephemeral: true });
        return;
      }

      await addCash(listing.sellerId, interaction.guildId!, listing.price);
      await addItem(interaction.user.id, interaction.guildId!, listing.itemId, listing.quantity);
      await db.update(listingsTable).set({ status: "sold" }).where(eq(listingsTable.id, listing.id));
      await logTransaction(interaction.guildId!, interaction.user.id, listing.sellerId, listing.price, "marketplace_sale");

      const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, listing.itemId)).limit(1);
      await interaction.reply({
        embeds: [successEmbed("Compra Completada", `Compraste **${listing.quantity}x ${item?.emoji ?? "📦"} ${item?.name ?? "objeto"}** por **${formatCurrency(listing.price)}**!`)],
      });

    } else if (sub === "subasta") {
      const itemName = interaction.options.getString("objeto", true);
      const startingBid = interaction.options.getInteger("oferta_inicial", true);
      const hours = interaction.options.getInteger("horas", true);

      const items = await db.select().from(itemsTable)
        .where(and(eq(itemsTable.guildId, interaction.guildId!), eq(itemsTable.isActive, true)));
      const item = items.find((i) => i.name.toLowerCase() === itemName.toLowerCase());

      if (!item) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Objeto **${itemName}** no encontrado.`)], ephemeral: true });
        return;
      }

      const removed = await removeItem(interaction.user.id, interaction.guildId!, item.id, 1);
      if (!removed) {
        await interaction.reply({ embeds: [errorEmbed("Sin Objeto", `No tienes **${item.name}** en tu inventario.`)], ephemeral: true });
        return;
      }

      const endsAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      const auctionId = generateId();

      await db.insert(auctionsTable).values({
        id: auctionId,
        guildId: interaction.guildId!,
        sellerId: interaction.user.id,
        itemId: item.id,
        quantity: 1,
        startingBid,
        currentBid: startingBid,
        status: "active",
        endsAt,
      });

      await interaction.reply({
        embeds: [successEmbed("Subasta Iniciada",
          `🔨 ¡Subasta iniciada para **${item.emoji ?? "📦"} ${item.name}**!\n\n**Oferta Inicial:** ${formatCurrency(startingBid)}\n**Finaliza:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n**ID:** \`${auctionId.slice(0, 8)}\``)],
      });

    } else if (sub === "pujar") {
      const auctionIdPrefix = interaction.options.getString("id", true);
      const amount = interaction.options.getInteger("cantidad", true);

      const allAuctions = await db.select().from(auctionsTable)
        .where(and(eq(auctionsTable.guildId, interaction.guildId!), eq(auctionsTable.status, "active")));
      const auction = allAuctions.find((a) => a.id.startsWith(auctionIdPrefix));

      if (!auction) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", "Subasta no encontrada o ya finalizada.")], ephemeral: true });
        return;
      }
      if (auction.sellerId === interaction.user.id) {
        await interaction.reply({ embeds: [errorEmbed("Inválido", "No puedes pujar en tu propia subasta.")], ephemeral: true });
        return;
      }
      if (amount <= auction.currentBid) {
        await interaction.reply({ embeds: [errorEmbed("Oferta Muy Baja", `La oferta mínima es **${formatCurrency(auction.currentBid + 1)}**.`)], ephemeral: true });
        return;
      }

      await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);

      if (auction.currentBidderId) {
        await addCash(auction.currentBidderId, interaction.guildId!, auction.currentBid);
      }

      const paid = await removeCash(interaction.user.id, interaction.guildId!, amount);
      if (!paid) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `Necesitas **${formatCurrency(amount)}** en efectivo.`)], ephemeral: true });
        return;
      }

      await db.update(auctionsTable).set({ currentBid: amount, currentBidderId: interaction.user.id }).where(eq(auctionsTable.id, auction.id));

      const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, auction.itemId)).limit(1);
      await interaction.reply({
        embeds: [successEmbed("Oferta Realizada", `Ofertaste **${formatCurrency(amount)}** por **${item?.emoji ?? "📦"} ${item?.name ?? "objeto"}**!\n**Finaliza:** <t:${Math.floor(new Date(auction.endsAt).getTime() / 1000)}:R>`)],
      });

    } else if (sub === "cancelar") {
      const listingIdPrefix = interaction.options.getString("id", true);
      const allListings = await db.select().from(listingsTable)
        .where(and(eq(listingsTable.guildId, interaction.guildId!), eq(listingsTable.status, "active"), eq(listingsTable.sellerId, interaction.user.id)));
      const listing = allListings.find((l) => l.id.startsWith(listingIdPrefix));

      if (!listing) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", "Listado no encontrado o no te pertenece.")], ephemeral: true });
        return;
      }

      await addItem(interaction.user.id, interaction.guildId!, listing.itemId, listing.quantity);
      await db.update(listingsTable).set({ status: "cancelled" }).where(eq(listingsTable.id, listing.id));
      await interaction.reply({ embeds: [successEmbed("Listado Cancelado", "Tu objeto ha sido devuelto a tu inventario.")] });
    }
  },
};

export default command;
