import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { shopTable, itemsTable, blackMarketStockTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateId, formatCurrency } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";

// ─── Catálogo predeterminado ──────────────────────────────────────────────────

interface DefaultItem {
  name: string;
  category: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  price: number;
  stock: number;
  emoji: string;
  description: string;
  blackMarket?: { price: number; quantity: number };
}

const DEFAULT_CATALOG: DefaultItem[] = [
  // Herramientas
  { name: "Linterna",             category: "Herramientas", rarity: "common",    price: 50,     stock: -1,   emoji: "🔦", description: "Ilumina la oscuridad." },
  { name: "Caja de Herramientas", category: "Herramientas", rarity: "common",    price: 250,    stock: -1,   emoji: "🧰", description: "Herramientas básicas para reparaciones." },
  { name: "Taladro Eléctrico",    category: "Herramientas", rarity: "uncommon",  price: 500,    stock: 100,  emoji: "🔧", description: "Para trabajos de construcción y reparación." },
  { name: "Generador Portátil",   category: "Herramientas", rarity: "uncommon",  price: 1500,   stock: 50,   emoji: "⚡", description: "Genera electricidad en cualquier lugar.", blackMarket: { price: 2500, quantity: 30 } },
  { name: "Radio Portátil",       category: "Herramientas", rarity: "uncommon",  price: 2000,   stock: 75,   emoji: "📻", description: "Comunicación de corto alcance.", blackMarket: { price: 3500, quantity: 40 } },
  // Tecnología
  { name: "Teléfono Básico",      category: "Tecnología",   rarity: "common",    price: 300,    stock: -1,   emoji: "📱", description: "Llamadas y mensajes básicos." },
  { name: "Smartphone",           category: "Tecnología",   rarity: "uncommon",  price: 1500,   stock: -1,   emoji: "📱", description: "Teléfono inteligente de gama media." },
  { name: "Tablet Profesional",   category: "Tecnología",   rarity: "uncommon",  price: 3000,   stock: 100,  emoji: "💻", description: "Tablet para uso profesional." },
  { name: "Laptop Empresarial",   category: "Tecnología",   rarity: "rare",      price: 5000,   stock: 50,   emoji: "💻", description: "Laptop de alto rendimiento.", blackMarket: { price: 8000, quantity: 20 } },
  { name: "Servidor Empresarial", category: "Tecnología",   rarity: "epic",      price: 25000,  stock: 15,   emoji: "🖥️", description: "Servidor para gestión empresarial avanzada.", blackMarket: { price: 40000, quantity: 8 } },
  // Equipamiento
  { name: "Mochila Pequeña",          category: "Equipamiento", rarity: "common",   price: 500,   stock: -1,   emoji: "🎒", description: "Mochila básica para transporte." },
  { name: "Mochila Grande",           category: "Equipamiento", rarity: "uncommon", price: 2000,  stock: -1,   emoji: "🎒", description: "Mayor capacidad de almacenamiento." },
  { name: "Caja de Almacenamiento",   category: "Equipamiento", rarity: "uncommon", price: 5000,  stock: 50,   emoji: "📦", description: "Almacena objetos en tu propiedad." },
  { name: "Caja Fuerte",              category: "Equipamiento", rarity: "rare",     price: 25000, stock: 25,   emoji: "🔒", description: "Guarda tus objetos más valiosos con seguridad.", blackMarket: { price: 40000, quantity: 12 } },
  { name: "Archivador Empresarial",   category: "Equipamiento", rarity: "common",   price: 1500,  stock: 100,  emoji: "🗃️", description: "Organiza documentos empresariales." },
  // Construcción
  { name: "Cemento",           category: "Construcción", rarity: "common",   price: 50,   stock: -1,    emoji: "🪨", description: "Material de construcción básico." },
  { name: "Ladrillos",         category: "Construcción", rarity: "common",   price: 100,  stock: -1,    emoji: "🧱", description: "Bloques de construcción estándar." },
  { name: "Madera Tratada",    category: "Construcción", rarity: "common",   price: 150,  stock: -1,    emoji: "🪵", description: "Madera procesada para construcción." },
  { name: "Acero Estructural", category: "Construcción", rarity: "uncommon", price: 500,  stock: 1000,  emoji: "🔩", description: "Acero de alta resistencia." },
  { name: "Cristal Reforzado", category: "Construcción", rarity: "uncommon", price: 1000, stock: 500,   emoji: "🪟", description: "Vidrio templado resistente a impactos." },
  // Logística
  { name: "Pallet",                category: "Logística", rarity: "common",   price: 100,    stock: -1,   emoji: "📋", description: "Plataforma para mover mercancía." },
  { name: "Contenedor Pequeño",    category: "Logística", rarity: "uncommon", price: 2500,   stock: 100,  emoji: "📦", description: "Contenedor para transporte de bienes." },
  { name: "Contenedor Industrial", category: "Logística", rarity: "rare",     price: 15000,  stock: 25,   emoji: "🏭", description: "Contenedor de gran capacidad industrial.", blackMarket: { price: 22000, quantity: 10 } },
  { name: "Montacargas",           category: "Logística", rarity: "rare",     price: 30000,  stock: 15,   emoji: "🏗️", description: "Equipo para mover cargas pesadas.", blackMarket: { price: 48000, quantity: 6 } },
  { name: "Camión de Carga",       category: "Logística", rarity: "epic",     price: 120000, stock: 10,   emoji: "🚛", description: "Vehículo para transporte masivo de mercancía.", blackMarket: { price: 180000, quantity: 4 } },
  // Negocios
  { name: "Licencia Comercial Básica",   category: "Negocios", rarity: "uncommon", price: 10000,  stock: -1,  emoji: "📄", description: "Licencia para operar un negocio básico.", blackMarket: { price: 15000, quantity: 20 } },
  { name: "Licencia Comercial Premium",  category: "Negocios", rarity: "rare",     price: 50000,  stock: -1,  emoji: "📄", description: "Licencia para negocios de gran envergadura.", blackMarket: { price: 80000, quantity: 10 } },
  { name: "Registro Empresarial",        category: "Negocios", rarity: "uncommon", price: 15000,  stock: -1,  emoji: "📋", description: "Registro oficial de empresa.", blackMarket: { price: 22000, quantity: 15 } },
  { name: "Caja Registradora",           category: "Negocios", rarity: "common",   price: 2500,   stock: -1,  emoji: "💵", description: "Gestiona ventas en tu negocio." },
  { name: "Terminal de Pagos",           category: "Negocios", rarity: "uncommon", price: 3500,   stock: -1,  emoji: "💳", description: "Acepta pagos electrónicos." },
  // Especiales
  { name: "Cambio de Nombre",            category: "Especiales", rarity: "rare",      price: 25000,  stock: -1, emoji: "✏️", description: "Cambia tu nombre de personaje en el RP.", blackMarket: { price: 35000, quantity: 15 } },
  { name: "Espacio Extra de Inventario", category: "Especiales", rarity: "rare",      price: 15000,  stock: -1, emoji: "📂", description: "Amplía la capacidad de tu inventario." },
  { name: "Certificado Empresarial",     category: "Especiales", rarity: "epic",      price: 100000, stock: -1, emoji: "🏆", description: "Certificación oficial para grandes empresas.", blackMarket: { price: 150000, quantity: 5 } },
  { name: "Licencia de Inversor",        category: "Especiales", rarity: "legendary", price: 250000, stock: -1, emoji: "💎", description: "Acceso a inversiones de alto nivel.", blackMarket: { price: 400000, quantity: 3 } },
  { name: "Membresía VIP (30 días)",     category: "Especiales", rarity: "epic",      price: 50000,  stock: -1, emoji: "⭐", description: "Beneficios exclusivos durante 30 días.", blackMarket: { price: 75000, quantity: 8 } },
];

// ─── Command ──────────────────────────────────────────────────────────────────

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("adminshop")
    .setDescription("Admin: gestionar tiendas")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // ── Setup ──────────────────────────────────────────────────────
    .addSubcommandGroup((g) =>
      g.setName("setup").setDescription("Configuración inicial")
        .addSubcommand((s) =>
          s.setName("predeterminados")
            .setDescription("Cargar catálogo predeterminado en tienda y mercado negro (35 objetos)")
            .addBooleanOption((o) =>
              o.setName("reemplazar")
                .setDescription("¿Actualizar precios de objetos que ya existen? (default: no)")
                .setRequired(false)
            )
        )
    )
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
    // SETUP
    // ────────────────────────────────────────────────────────────────
    if (group === "setup") {
      if (sub === "predeterminados") {
        await interaction.deferReply();
        const reemplazar = interaction.options.getBoolean("reemplazar") ?? false;

        let createdItems = 0;
        let skippedItems = 0;
        let shopAdded = 0;
        let bmAdded = 0;

        const rotatesAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

        for (const def of DEFAULT_CATALOG) {
          // Buscar si ya existe el item para este guild
          const existing = await db.select().from(itemsTable)
            .where(and(eq(itemsTable.guildId, guildId), eq(itemsTable.name, def.name)))
            .limit(1);

          let itemId: string;

          if (existing[0]) {
            itemId = existing[0].id;
            if (reemplazar) {
              await db.update(itemsTable)
                .set({ category: def.category, rarity: def.rarity, basePrice: def.price, description: def.description, emoji: def.emoji })
                .where(eq(itemsTable.id, itemId));
            }
            skippedItems++;
          } else {
            itemId = generateId();
            await db.insert(itemsTable).values({
              id: itemId,
              guildId,
              name: def.name,
              category: def.category,
              rarity: def.rarity,
              basePrice: def.price,
              description: def.description,
              emoji: def.emoji,
              isActive: true,
            });
            createdItems++;
          }

          // Tienda normal
          const existingShop = await db.select().from(shopTable)
            .where(and(eq(shopTable.guildId, guildId), eq(shopTable.itemId, itemId)))
            .limit(1);

          if (existingShop[0]) {
            if (reemplazar) {
              await db.update(shopTable)
                .set({ price: def.price, stock: def.stock, isActive: true })
                .where(eq(shopTable.id, existingShop[0].id));
            }
          } else {
            await db.insert(shopTable).values({
              id: generateId(),
              guildId,
              itemId,
              price: def.price,
              stock: def.stock,
              isActive: true,
              addedBy: interaction.user.id,
            });
            shopAdded++;
          }

          // Mercado negro (solo items marcados)
          if (def.blackMarket) {
            const existingBm = await db.select().from(blackMarketStockTable)
              .where(and(
                eq(blackMarketStockTable.guildId, guildId),
                eq(blackMarketStockTable.itemId, itemId),
                eq(blackMarketStockTable.isAvailable, true),
              ))
              .limit(1);

            if (existingBm[0]) {
              if (reemplazar) {
                await db.update(blackMarketStockTable)
                  .set({ price: def.blackMarket.price, quantity: def.blackMarket.quantity, rotatesAt })
                  .where(eq(blackMarketStockTable.id, existingBm[0].id));
              }
            } else {
              await db.insert(blackMarketStockTable).values({
                id: generateId(),
                guildId,
                itemId,
                quantity: def.blackMarket.quantity,
                price: def.blackMarket.price,
                priceModifier: 100,
                isAvailable: true,
                rotatesAt,
              });
              bmAdded++;
            }
          }
        }

        const bmItems = DEFAULT_CATALOG.filter((d) => d.blackMarket).length;

        const embed = new EmbedBuilder()
          .setColor(Colors.Success)
          .setTitle("✅ Catálogo Predeterminado Cargado")
          .setDescription(
            `Se procesaron **${DEFAULT_CATALOG.length} objetos** del catálogo estándar de Chicago Systems.`
          )
          .addFields(
            { name: "📦 Objetos creados", value: `${createdItems}`, inline: true },
            { name: "⏭️ Ya existían",      value: `${skippedItems}`, inline: true },
            { name: "🛒 Añadidos a tienda",       value: `${shopAdded}/${DEFAULT_CATALOG.length}`, inline: true },
            { name: "🕵️ Añadidos al mercado negro", value: `${bmAdded}/${bmItems}`, inline: true },
            { name: "🔄 Modo",            value: reemplazar ? "Reemplazar precios existentes" : "Solo añadir nuevos", inline: true },
          )
          .addFields({
            name: "📁 Categorías incluidas",
            value: "Herramientas · Tecnología · Equipamiento · Construcción · Logística · Negocios · Especiales",
          })
          .setFooter({ text: `Usa /tienda explorar y /mercadonegro explorar para ver el resultado` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

    // ────────────────────────────────────────────────────────────────
    // TIENDA NORMAL
    // ────────────────────────────────────────────────────────────────
    } else if (group === "shop") {
      if (sub === "add") {
        const nombreObj = interaction.options.getString("objeto", true);
        const precio = interaction.options.getInteger("precio", true);
        const stock = interaction.options.getInteger("stock") ?? -1;

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
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const existing = await db.select().from(shopTable)
          .where(and(
            eq(shopTable.guildId, guildId),
            eq(shopTable.itemId, item.id),
            eq(shopTable.isActive, true)
          )).limit(1);

        if (existing[0]) {
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
        const item = items.find((i) => i.name.toLowerCase() === nombreObj.toLowerCase());

        if (!item) {
          await interaction.reply({ embeds: [errorEmbed("No encontrado", `Objeto **${nombreObj}** no existe.`)], flags: MessageFlags.Ephemeral });
          return;
        }

        const [entry] = await db.select().from(shopTable)
          .where(and(eq(shopTable.guildId, guildId), eq(shopTable.itemId, item.id), eq(shopTable.isActive, true)))
          .limit(1);

        if (!entry) {
          await interaction.reply({ embeds: [errorEmbed("No está en la tienda", `**${item.name}** no está en la tienda.`)], flags: MessageFlags.Ephemeral });
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
        const item = items.find((i) => i.name.toLowerCase() === nombreObj.toLowerCase());

        if (!item) {
          await interaction.reply({ embeds: [errorEmbed("No encontrado", `Objeto **${nombreObj}** no existe.`)], flags: MessageFlags.Ephemeral });
          return;
        }

        const [entry] = await db.select().from(shopTable)
          .where(and(eq(shopTable.guildId, guildId), eq(shopTable.itemId, item.id), eq(shopTable.isActive, true)))
          .limit(1);

        if (!entry) {
          await interaction.reply({ embeds: [errorEmbed("No está en la tienda", `**${item.name}** no está en la tienda.`)], flags: MessageFlags.Ephemeral });
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
            embeds: [errorEmbed("Tienda vacía", "No hay ningún objeto en la tienda. Usa `/adminshop shop add` o `/adminshop setup predeterminados`.")],
            flags: MessageFlags.Ephemeral,
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
        const item = items.find((i) => i.name.toLowerCase() === nombreObj.toLowerCase());

        if (!item) {
          await interaction.reply({
            embeds: [errorEmbed(
              "Objeto no encontrado",
              `No existe ningún objeto llamado **${nombreObj}**.\nCrea el objeto primero con \`/admin items create\`.`
            )],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const rotatesAt = new Date(Date.now() + horas * 60 * 60 * 1000);

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
        const item = items.find((i) => i.name.toLowerCase() === nombreObj.toLowerCase());

        if (!item) {
          await interaction.reply({ embeds: [errorEmbed("No encontrado", `Objeto **${nombreObj}** no existe.`)], flags: MessageFlags.Ephemeral });
          return;
        }

        const [entry] = await db.select().from(blackMarketStockTable)
          .where(and(
            eq(blackMarketStockTable.guildId, guildId),
            eq(blackMarketStockTable.itemId, item.id),
            eq(blackMarketStockTable.isAvailable, true)
          )).limit(1);

        if (!entry) {
          await interaction.reply({ embeds: [errorEmbed("No está en el mercado", `**${item.name}** no está activo en el mercado negro.`)], flags: MessageFlags.Ephemeral });
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
            embeds: [errorEmbed("Mercado negro vacío", "No hay stock activo. Usa `/adminshop blackmarket add` o `/adminshop setup predeterminados`.")],
            flags: MessageFlags.Ephemeral,
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
