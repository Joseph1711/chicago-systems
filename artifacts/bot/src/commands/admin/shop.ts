import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { shopTable, itemsTable, blackMarketStockTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateId, formatCurrency } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("adminshop")
    .setDescription("Admin: gestionar tiendas")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // ── Tienda normal ──────────────────────────────────────────────
    .addSubcommandGroup((g) =>
      g.setName("shop").setDescription("Tienda normal")
        .addSubcommand((s) =>
          s.setName("add").setDescription("Añadir objeto a la tienda")
            .addStringOption((o) => o.setName("objeto").setDescription("Nombre del objeto").setRequired(true))
            .addIntegerOption((o) => o.setName("precio").setDescription("Precio de venta").setRequired(true).setMinValue(1))
            .addIntegerOption((o) => o.setName("stock").setDescription("Stock disponible (-1 = ilimitado)").setRequired(false).setMinValue(-1))
        )
        .addSubcommand((s) =>
          s.setName("remove").setDescription("Eliminar objeto de la tienda")
            .addStringOption((o) => o.setName("objeto").setDescription("Nombre del objeto").setRequired(true))
        )
        .addSubcommand((s) =>
          s.setName("stock").setDescription("Editar stock de un objeto")
            .addStringOption((o) => o.setName("objeto").setDescription("Nombre del objeto").setRequired(true))
            .addIntegerOption((o) => o.setName("cantidad").setDescription("Nuevo stock (-1 = ilimitado)").setRequired(true).setMinValue(-1))
        )
        .addSubcommand((s) =>
          s.setName("list").setDescription("Ver todos los objetos en la tienda")
        )
    )
    // ── Mercado negro ──────────────────────────────────────────────
    .addSubcommandGroup((g) =>
      g.setName("blackmarket").setDescription("Mercado negro")
        .addSubcommand((s) =>
          s.setName("add").setDescription("Añadir objeto al mercado negro")
            .addStringOption((o) => o.setName("objeto").setDescription("Nombre del objeto").setRequired(true))
            .addIntegerOption((o) => o.setName("precio").setDescription("Precio").setRequired(true).setMinValue(1))
            .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad disponible").setRequired(true).setMinValue(1))
            .addIntegerOption((o) => o.setName("horas").setDescription("Horas hasta que rote (por defecto 6)").setRequired(false).setMinValue(1).setMaxValue(168))
        )
        .addSubcommand((s) =>
          s.setName("remove").setDescription("Eliminar objeto del mercado negro")
            .addStringOption((o) => o.setName("objeto").setDescription("Nombre del objeto").setRequired(true))
        )
        .addSubcommand((s) =>
          s.setName("list").setDescription("Ver stock actual del mercado negro")
        )
    ),
  cooldown: 2,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    // ────────────────────────────────────────────────────────────────
    // TIENDA NORMAL
    // ────────────────────────────────────────────────────────────────
    if (group === "shop") {
      if (sub === "add") {
        const nombreObj = interaction.options.getString("objeto", true);
        const precio = interaction.options.getInteger("precio", true);
        const stock = interaction.options.getInteger("stock") ?? -1;

        // Buscar el item en la BD
        const items = await db.select().from(itemsTable)
          .where(and(eq(itemsTable.guildId, guildId), eq(itemsTable.isActive, true)));
        const item = items.find(
          (i) => i.name.toLowerCase() === nombreObj.toLowerCase()
        );

        if (!item) {
          await interaction.reply({
            embeds: [errorEmbed(
              "Objeto no encontrado",
              `No existe ningún objeto llamado **${nombreObj}**.\nCrea el objeto primero con \`/admin items create\`.`
            )],
            ephemeral: true,
          });
          return;
        }

        // Comprobar si ya está en la tienda
        const existing = await db.select().from(shopTable)
          .where(and(
            eq(shopTable.guildId, guildId),
            eq(shopTable.itemId, item.id),
            eq(shopTable.isActive, true)
          )).limit(1);

        if (existing[0]) {
          // Actualizar precio y stock
          await db.update(shopTable)
            .set({ price: precio, stock })
            .where(eq(shopTable.id, existing[0].id));
          await interaction.reply({
            embeds: [successEmbed(
              "Tienda actualizada",
              `${item.emoji ?? "📦"} **${item.name}** actualizado:\n💰 Precio: **${formatCurrency(precio)}** | 📦 Stock: ${stock === -1 ? "Ilimitado" : stock}`
            )],
          });
          return;
        }

        await db.insert(shopTable).values({
          id: generateId(),
          guildId,
          itemId: item.id,
          price: precio,
          stock,
          isActive: true,
          addedBy: interaction.user.id,
        });

        await interaction.reply({
          embeds: [successEmbed(
            "Objeto añadido a la tienda",
            `${item.emoji ?? "📦"} **${item.name}** ya está en la tienda.\n💰 Precio: **${formatCurrency(precio)}** | 📦 Stock: ${stock === -1 ? "Ilimitado" : stock}`
          )],
        });

      } else if (sub === "remove") {
        const nombreObj = interaction.options.getString("objeto", true);

        const items = await db.select().from(itemsTable)
          .where(and(eq(itemsTable.guildId, guildId), eq(itemsTable.isActive, true)));
        const item = items.find(
          (i) => i.name.toLowerCase() === nombreObj.toLowerCase()
        );

        if (!item) {
          await interaction.reply({ embeds: [errorEmbed("No encontrado", `Objeto **${nombreObj}** no existe.`)], ephemeral: true });
          return;
        }

        const [entry] = await db.select().from(shopTable)
          .where(and(eq(shopTable.guildId, guildId), eq(shopTable.itemId, item.id), eq(shopTable.isActive, true)))
          .limit(1);

        if (!entry) {
          await interaction.reply({ embeds: [errorEmbed("No está en la tienda", `**${item.name}** no está en la tienda.`)], ephemeral: true });
          return;
        }

        await db.update(shopTable).set({ isActive: false }).where(eq(shopTable.id, entry.id));
        await interaction.reply({
          embeds: [successEmbed("Objeto eliminado", `${item.emoji ?? "📦"} **${item.name}** eliminado de la tienda.`)],
        });

      } else if (sub === "stock") {
        const nombreObj = interaction.options.getString("objeto", true);
        const cantidad = interaction.options.getInteger("cantidad", true);

        const items = await db.select().from(itemsTable)
          .where(and(eq(itemsTable.guildId, guildId), eq(itemsTable.isActive, true)));
        const item = items.find(
          (i) => i.name.toLowerCase() === nombreObj.toLowerCase()
        );

        if (!item) {
          await interaction.reply({ embeds: [errorEmbed("No encontrado", `Objeto **${nombreObj}** no existe.`)], ephemeral: true });
          return;
        }

        const [entry] = await db.select().from(shopTable)
          .where(and(eq(shopTable.guildId, guildId), eq(shopTable.itemId, item.id), eq(shopTable.isActive, true)))
          .limit(1);

        if (!entry) {
          await interaction.reply({ embeds: [errorEmbed("No está en la tienda", `**${item.name}** no está en la tienda.`)], ephemeral: true });
          return;
        }

        await db.update(shopTable).set({ stock: cantidad }).where(eq(shopTable.id, entry.id));
        await interaction.reply({
          embeds: [successEmbed(
            "Stock actualizado",
            `${item.emoji ?? "📦"} **${item.name}**: stock → ${cantidad === -1 ? "Ilimitado" : cantidad}`
          )],
        });

      } else if (sub === "list") {
        const entries = await db
          .select({
            id: shopTable.id,
            price: shopTable.price,
            stock: shopTable.stock,
            name: itemsTable.name,
            emoji: itemsTable.emoji,
            rarity: itemsTable.rarity,
            category: itemsTable.category,
          })
          .from(shopTable)
          .innerJoin(itemsTable, eq(shopTable.itemId, itemsTable.id))
          .where(and(eq(shopTable.guildId, guildId), eq(shopTable.isActive, true)));

        if (entries.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed("Tienda vacía", "No hay ningún objeto en la tienda. Usa `/adminshop shop add` para añadir.")],
            ephemeral: true,
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(Colors.Primary)
          .setTitle("🛒 Tienda — Catálogo admin")
          .setDescription(
            entries.map((e) =>
              `${e.emoji ?? "📦"} **${e.name}** [${e.rarity}]\n💰 ${formatCurrency(e.price)} | 📦 ${e.stock === -1 ? "Ilimitado" : e.stock} en stock`
            ).join("\n\n")
          )
          .setFooter({ text: `${entries.length} objetos en la tienda` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }

    // ────────────────────────────────────────────────────────────────
    // MERCADO NEGRO
    // ────────────────────────────────────────────────────────────────
    } else if (group === "blackmarket") {
      if (sub === "add") {
        const nombreObj = interaction.options.getString("objeto", true);
        const precio = interaction.options.getInteger("precio", true);
        const cantidad = interaction.options.getInteger("cantidad", true);
        const horas = interaction.options.getInteger("horas") ?? 6;

        const items = await db.select().from(itemsTable)
          .where(and(eq(itemsTable.guildId, guildId), eq(itemsTable.isActive, true)));
        const item = items.find(
          (i) => i.name.toLowerCase() === nombreObj.toLowerCase()
        );

        if (!item) {
          await interaction.reply({
            embeds: [errorEmbed(
              "Objeto no encontrado",
              `No existe ningún objeto llamado **${nombreObj}**.\nCrea el objeto primero con \`/admin items create\`.`
            )],
            ephemeral: true,
          });
          return;
        }

        const rotatesAt = new Date(Date.now() + horas * 60 * 60 * 1000);

        // Si ya existe una entrada activa para ese item, actualizar
        const existing = await db.select().from(blackMarketStockTable)
          .where(and(
            eq(blackMarketStockTable.guildId, guildId),
            eq(blackMarketStockTable.itemId, item.id),
            eq(blackMarketStockTable.isAvailable, true)
          )).limit(1);

        if (existing[0]) {
          await db.update(blackMarketStockTable)
            .set({ quantity: cantidad, price: precio, rotatesAt, isAvailable: true })
            .where(eq(blackMarketStockTable.id, existing[0].id));
          await interaction.reply({
            embeds: [successEmbed(
              "Mercado negro actualizado",
              `🕵️ **${item.name}** actualizado en el mercado negro.\n💰 Precio: **${formatCurrency(precio)}** | 📦 Cantidad: **${cantidad}**\n🔄 Rota: <t:${Math.floor(rotatesAt.getTime() / 1000)}:R>`
            )],
          });
          return;
        }

        await db.insert(blackMarketStockTable).values({
          id: generateId(),
          guildId,
          itemId: item.id,
          quantity: cantidad,
          price: precio,
          priceModifier: 100,
          isAvailable: true,
          rotatesAt,
        });

        await interaction.reply({
          embeds: [successEmbed(
            "Objeto añadido al mercado negro",
            `🕵️ **${item.name}** añadido al mercado negro.\n💰 Precio: **${formatCurrency(precio)}** | 📦 Cantidad: **${cantidad}**\n🔄 Rota: <t:${Math.floor(rotatesAt.getTime() / 1000)}:R>`
          )],
        });

      } else if (sub === "remove") {
        const nombreObj = interaction.options.getString("objeto", true);

        const items = await db.select().from(itemsTable)
          .where(and(eq(itemsTable.guildId, guildId), eq(itemsTable.isActive, true)));
        const item = items.find(
          (i) => i.name.toLowerCase() === nombreObj.toLowerCase()
        );

        if (!item) {
          await interaction.reply({ embeds: [errorEmbed("No encontrado", `Objeto **${nombreObj}** no existe.`)], ephemeral: true });
          return;
        }

        const [entry] = await db.select().from(blackMarketStockTable)
          .where(and(
            eq(blackMarketStockTable.guildId, guildId),
            eq(blackMarketStockTable.itemId, item.id),
            eq(blackMarketStockTable.isAvailable, true)
          )).limit(1);

        if (!entry) {
          await interaction.reply({ embeds: [errorEmbed("No está en el mercado", `**${item.name}** no está activo en el mercado negro.`)], ephemeral: true });
          return;
        }

        await db.update(blackMarketStockTable)
          .set({ isAvailable: false, quantity: 0 })
          .where(eq(blackMarketStockTable.id, entry.id));

        await interaction.reply({
          embeds: [successEmbed("Eliminado del mercado negro", `🕵️ **${item.name}** eliminado del mercado negro.`)],
        });

      } else if (sub === "list") {
        const stock = await db
          .select({
            id: blackMarketStockTable.id,
            quantity: blackMarketStockTable.quantity,
            price: blackMarketStockTable.price,
            rotatesAt: blackMarketStockTable.rotatesAt,
            name: itemsTable.name,
            emoji: itemsTable.emoji,
            rarity: itemsTable.rarity,
          })
          .from(blackMarketStockTable)
          .innerJoin(itemsTable, eq(blackMarketStockTable.itemId, itemsTable.id))
          .where(and(eq(blackMarketStockTable.guildId, guildId), eq(blackMarketStockTable.isAvailable, true)));

        if (stock.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed("Mercado negro vacío", "No hay stock activo. Usa `/adminshop blackmarket add` para añadir.")],
            ephemeral: true,
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(Colors.BlackMarket)
          .setTitle("🕵️ Mercado Negro — Stock actual")
          .setDescription(
            stock.map((s) =>
              `${s.emoji ?? "📦"} **${s.name}** [${s.rarity}]\n💰 ${formatCurrency(s.price)} | 📦 ${s.quantity} uds | 🔄 Rota <t:${Math.floor(new Date(s.rotatesAt).getTime() / 1000)}:R>`
            ).join("\n\n")
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    }
  },
};

export default command;
