import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { propertiesTable, propertyTransactionsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { generateId, formatCurrency, getOrCreateUser } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { removeCash, addCash, logTransaction } from "../../services/economyService.js";

const PROPERTY_EMOJIS: Record<string, string> = {
  house: "🏠",
  apartment: "🏢",
  business: "🏪",
  garage: "🚗",
  warehouse: "🏭",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("propiedad")
    .setDescription("Gestión de propiedades")
    .addSubcommand((s) => s.setName("lista").setDescription("Ver propiedades disponibles").addStringOption((o) => o.setName("tipo").setDescription("Filtrar por tipo").setRequired(false).addChoices({ name: "Casa", value: "house" }, { name: "Apartamento", value: "apartment" }, { name: "Negocio", value: "business" }, { name: "Garaje", value: "garage" }, { name: "Almacén", value: "warehouse" })))
    .addSubcommand((s) => s.setName("comprar").setDescription("Comprar una propiedad").addStringOption((o) => o.setName("id").setDescription("ID de la propiedad").setRequired(true)))
    .addSubcommand((s) => s.setName("vender").setDescription("Vender una propiedad tuya").addStringOption((o) => o.setName("id").setDescription("ID de la propiedad").setRequired(true)))
    .addSubcommand((s) => s.setName("rentar").setDescription("Rentar una propiedad").addStringOption((o) => o.setName("id").setDescription("ID de la propiedad").setRequired(true)))
    .addSubcommand((s) => s.setName("mias").setDescription("Ver tus propiedades")),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === "lista") {
      const type = interaction.options.getString("tipo");
      const query = db.select().from(propertiesTable)
        .where(and(eq(propertiesTable.guildId, interaction.guildId!), eq(propertiesTable.status, "available")));

      const props = await query;
      const filtered = type ? props.filter((p) => p.type === type) : props;

      if (filtered.length === 0) {
        await interaction.reply({ embeds: [errorEmbed("Sin Propiedades", "No hay propiedades disponibles para venta/renta.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle("🏘️ Propiedades Disponibles")
        .setDescription(filtered.slice(0, 20).map((p) =>
          `${PROPERTY_EMOJIS[p.type] ?? "🏠"} **${p.name}** (\`${p.id.slice(0, 8)}\`)\n💰 Compra: ${formatCurrency(p.price)}${p.rentPrice ? ` | 🔑 Renta: ${formatCurrency(p.rentPrice)}/día` : ""}\n📍 ${p.address ?? "Sin dirección"}`
        ).join("\n\n"))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "comprar") {
      const propId = interaction.options.getString("id", true);
      const [prop] = await db.select().from(propertiesTable)
        .where(and(eq(propertiesTable.guildId, interaction.guildId!), eq(propertiesTable.id, propId))).limit(1);

      if (!prop) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", "Propiedad no encontrada.")], flags: MessageFlags.Ephemeral });
        return;
      }
      if (prop.status !== "available") {
        await interaction.reply({ embeds: [errorEmbed("No Disponible", "Esta propiedad no está disponible para compra.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const success = await removeCash(interaction.user.id, interaction.guildId!, prop.price);
      if (!success) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `Necesitas **${formatCurrency(prop.price)}** para comprar esta propiedad.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      await db.update(propertiesTable).set({ ownerId: interaction.user.id, status: "owned" }).where(eq(propertiesTable.id, prop.id));
      await db.insert(propertyTransactionsTable).values({
        id: generateId(), guildId: interaction.guildId!, propertyId: prop.id,
        fromUserId: prop.ownerId, toUserId: interaction.user.id,
        transactionType: "purchase", amount: prop.price,
      });
      await logTransaction(interaction.guildId!, interaction.user.id, null, prop.price, "property_purchase", `Compró ${prop.name}`);

      await interaction.reply({ embeds: [successEmbed("Propiedad Comprada", `🏠 ¡Ahora eres dueño de **${prop.name}**!`)] });

    } else if (sub === "vender") {
      const propId = interaction.options.getString("id", true);
      const [prop] = await db.select().from(propertiesTable)
        .where(and(eq(propertiesTable.id, propId), eq(propertiesTable.ownerId, interaction.user.id))).limit(1);

      if (!prop) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", "No eres dueño de esta propiedad.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const sellPrice = Math.floor(prop.price * 0.75);
      await addCash(interaction.user.id, interaction.guildId!, sellPrice);
      await db.update(propertiesTable).set({ ownerId: null, status: "available" }).where(eq(propertiesTable.id, prop.id));
      await logTransaction(interaction.guildId!, null, interaction.user.id, sellPrice, "sale", `Vendió ${prop.name}`);

      await interaction.reply({ embeds: [successEmbed("Propiedad Vendida", `Vendiste **${prop.name}** por **${formatCurrency(sellPrice)}** (75% del precio de compra).`)] });

    } else if (sub === "rentar") {
      const propId = interaction.options.getString("id", true);
      const [prop] = await db.select().from(propertiesTable)
        .where(and(eq(propertiesTable.guildId, interaction.guildId!), eq(propertiesTable.id, propId), eq(propertiesTable.status, "available"))).limit(1);

      if (!prop || !prop.rentPrice) {
        await interaction.reply({ embeds: [errorEmbed("No Disponible", "Esta propiedad no está disponible para renta.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const success = await removeCash(interaction.user.id, interaction.guildId!, prop.rentPrice);
      if (!success) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `Necesitas **${formatCurrency(prop.rentPrice)}** para la primera renta del día.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      await db.update(propertiesTable).set({ renterId: interaction.user.id, status: "rented" }).where(eq(propertiesTable.id, prop.id));
      await logTransaction(interaction.guildId!, interaction.user.id, null, prop.rentPrice, "property_rent", `Rentó ${prop.name}`);

      await interaction.reply({ embeds: [successEmbed("Propiedad Rentada", `🔑 Ahora rentas **${prop.name}** por **${formatCurrency(prop.rentPrice)}/día**.`)] });

    } else if (sub === "mias") {
      const owned = await db.select().from(propertiesTable)
        .where(and(eq(propertiesTable.guildId, interaction.guildId!), eq(propertiesTable.ownerId, interaction.user.id)));
      const rented = await db.select().from(propertiesTable)
        .where(and(eq(propertiesTable.guildId, interaction.guildId!), eq(propertiesTable.renterId, interaction.user.id)));

      if (owned.length === 0 && rented.length === 0) {
        await interaction.reply({ embeds: [errorEmbed("Sin Propiedades", "No tienes ni posees ni rentas ninguna propiedad.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle("🏡 Tus Propiedades")
        .addFields(
          { name: "🏠 Propias", value: owned.length > 0 ? owned.map((p) => `${PROPERTY_EMOJIS[p.type] ?? "🏠"} **${p.name}** — ${formatCurrency(p.price)}`).join("\n") : "Ninguna" },
          { name: "🔑 Rentadas", value: rented.length > 0 ? rented.map((p) => `${PROPERTY_EMOJIS[p.type] ?? "🏠"} **${p.name}** — ${formatCurrency(p.rentPrice ?? 0)}/día`).join("\n") : "Ninguna" }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};

export default command;
