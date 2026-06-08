import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { usersTable, moneyLaunderingTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateId, formatCurrency, getOrCreateUser } from "../../utils/helpers.js";
import { Colors, errorEmbed } from "../../utils/embeds.js";
import { addCash, logTransaction } from "../../services/economyService.js";

const METHODS: Record<string, { emoji: string; name: string; desc: string; fee: number; cooldownMinutes: number; min: number }> = {
  basico: {
    emoji: "🧺",
    name: "Lavandería",
    desc: "Lavar ropa con billetes adentro. Lento y con mucha pérdida.",
    fee: 35,
    cooldownMinutes: 30,
    min: 500,
  },
  negocio: {
    emoji: "🍕",
    name: "Negocio de Fachada",
    desc: "Metes el dinero como ingresos de tu negocio fantasma. Más eficiente.",
    fee: 20,
    cooldownMinutes: 60,
    min: 2000,
  },
  casino: {
    emoji: "🎰",
    name: "Casino",
    desc: "Juegas hasta que el dinero 'gana'. La mejor tasa pero el más lento.",
    fee: 12,
    cooldownMinutes: 120,
    min: 5000,
  },
};

const COOLDOWN_KEY_PREFIX = "launder_";

const userCooldowns = new Map<string, number>();

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("lavar")
    .setDescription("Lavar dinero sucio y convertirlo en efectivo limpio")
    .addSubcommand((s) =>
      s.setName("dinero")
        .setDescription("Lavar una cantidad de dinero sucio")
        .addIntegerOption((o) =>
          o.setName("cantidad").setDescription("Cantidad de dinero sucio a lavar").setRequired(true).setMinValue(100)
        )
        .addStringOption((o) =>
          o.setName("metodo")
            .setDescription("Método de lavado (afecta el % de comisión)")
            .setRequired(false)
            .addChoices(
              { name: "🧺 Lavandería — 35% comisión · $500 mín · cada 30m", value: "basico" },
              { name: "🍕 Negocio de Fachada — 20% comisión · $2,000 mín · cada 1h", value: "negocio" },
              { name: "🎰 Casino — 12% comisión · $5,000 mín · cada 2h", value: "casino" },
            )
        )
    )
    .addSubcommand((s) => s.setName("info").setDescription("Ver tus métodos de lavado y cooldowns")),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const user = await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);

    if (sub === "info") {
      const embed = new EmbedBuilder()
        .setColor(Colors.DirtyMoney)
        .setTitle("🧼 Centro de Lavado de Dinero")
        .setDescription(`**Tu dinero sucio:** ${formatCurrency(user.dirtyMoney)}\n\nElige el método de lavado según tu necesidad. Mayor comisión = más rápido.`)
        .setTimestamp();

      for (const [key, m] of Object.entries(METHODS)) {
        const cdKey = `${COOLDOWN_KEY_PREFIX}${interaction.user.id}_${interaction.guildId}_${key}`;
        const lastUsed = userCooldowns.get(cdKey) ?? 0;
        const cooldownMs = m.cooldownMinutes * 60 * 1000;
        const remaining = cooldownMs - (Date.now() - lastUsed);
        const cdStatus = remaining > 0
          ? `⏳ Disponible <t:${Math.floor((lastUsed + cooldownMs) / 1000)}:R>`
          : "✅ Disponible ahora";

        embed.addFields({
          name: `${m.emoji} ${m.name}`,
          value: `${m.desc}\n💸 Comisión: **${m.fee}%** | Mínimo: **${formatCurrency(m.min)}** | Cooldown: **${m.cooldownMinutes}m**\n${cdStatus}`,
        });
      }

      embed.setFooter({ text: "Usa /lavar dinero <cantidad> [metodo] para lavar" });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } else if (sub === "dinero") {
      const cantidad = interaction.options.getInteger("cantidad", true);
      const metodoClave = interaction.options.getString("metodo") ?? "basico";
      const metodo = METHODS[metodoClave]!;

      if (user.dirtyMoney < cantidad) {
        await interaction.reply({
          embeds: [errorEmbed("Fondos Insuficientes", `Solo tienes **${formatCurrency(user.dirtyMoney)}** en dinero sucio.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (cantidad < metodo.min) {
        await interaction.reply({
          embeds: [errorEmbed("Monto Muy Bajo", `El método **${metodo.name}** requiere un mínimo de **${formatCurrency(metodo.min)}**.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const cdKey = `${COOLDOWN_KEY_PREFIX}${interaction.user.id}_${interaction.guildId}_${metodoClave}`;
      const lastUsed = userCooldowns.get(cdKey) ?? 0;
      const cooldownMs = metodo.cooldownMinutes * 60 * 1000;
      const remaining = cooldownMs - (Date.now() - lastUsed);

      if (remaining > 0) {
        const availableAt = Math.floor((lastUsed + cooldownMs) / 1000);
        await interaction.reply({
          embeds: [errorEmbed("En Enfriamiento", `**${metodo.name}** estará disponible <t:${availableAt}:R>.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const fee = Math.floor(cantidad * metodo.fee / 100);
      const cleanAmount = cantidad - fee;

      await db.update(usersTable)
        .set({ dirtyMoney: sql`${usersTable.dirtyMoney} - ${cantidad}` })
        .where(and(eq(usersTable.discordId, interaction.user.id), eq(usersTable.guildId, interaction.guildId!)));

      await addCash(interaction.user.id, interaction.guildId!, cleanAmount);

      await db.insert(moneyLaunderingTable).values({
        id: generateId(),
        guildId: interaction.guildId!,
        userId: interaction.user.id,
        dirtyAmount: cantidad,
        cleanAmount,
        fee,
        method: metodoClave,
      });

      await logTransaction(interaction.guildId!, null, interaction.user.id, cleanAmount, "money_laundering", `Lavó ${formatCurrency(cantidad)} vía ${metodo.name}`);

      userCooldowns.set(cdKey, Date.now());

      const embed = new EmbedBuilder()
        .setColor(Colors.DirtyMoney)
        .setTitle(`${metodo.emoji} Lavado Completado`)
        .setDescription(`Usaste **${metodo.name}** para lavar tu dinero.`)
        .addFields(
          { name: "🤑 Dinero sucio lavado", value: `**${formatCurrency(cantidad)}**`, inline: true },
          { name: "💸 Comisión (${metodo.fee}%)", value: `**-${formatCurrency(fee)}**`, inline: true },
          { name: "💵 Efectivo limpio recibido", value: `**${formatCurrency(cleanAmount)}**`, inline: true },
        )
        .setFooter({ text: `Saldo restante de dinero sucio: ${formatCurrency(user.dirtyMoney - cantidad)}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

export default command;
