import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { getOrCreateUser, formatCurrency, generateId } from "../../utils/helpers.js";
import { removeCash, logTransaction } from "../../services/economyService.js";
import { db } from "@workspace/db";
import { investmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";

const INVESTMENT_TYPES = {
  conservative: { label: "🟢 Conservador", returnRate: 5, risk: "Bajo", durationDays: 3 },
  moderate: { label: "🟡 Moderado", returnRate: 12, risk: "Medio", durationDays: 5 },
  aggressive: { label: "🔴 Agresivo", returnRate: 25, risk: "Alto", durationDays: 7 },
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("invertir")
    .setDescription("Invierte tu dinero")
    .addSubcommand((s) =>
      s.setName("crear")
        .setDescription("Crear una nueva inversión")
        .addStringOption((o) =>
          o.setName("tipo")
            .setDescription("Tipo de inversión")
            .setRequired(true)
            .addChoices(
              { name: "Conservador (5% retorno, 3 días)", value: "conservative" },
              { name: "Moderado (12% retorno, 5 días)", value: "moderate" },
              { name: "Agresivo (25% retorno, 7 días)", value: "aggressive" }
            )
        )
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad a invertir").setRequired(true).setMinValue(100))
    )
    .addSubcommand((s) => s.setName("portafolio").setDescription("Ver tu portafolio de inversiones")),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === "crear") {
      const type = interaction.options.getString("tipo", true) as keyof typeof INVESTMENT_TYPES;
      const amount = interaction.options.getInteger("cantidad", true);
      const inv = INVESTMENT_TYPES[type];

      const user = await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);
      if (user.cash < amount) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `Necesitas **${formatCurrency(amount)}** en efectivo.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      const matureAt = new Date(Date.now() + inv.durationDays * 24 * 60 * 60 * 1000);
      await removeCash(interaction.user.id, interaction.guildId!, amount);
      await db.insert(investmentsTable).values({
        id: generateId(),
        userId: interaction.user.id,
        guildId: interaction.guildId!,
        type: inv.label,
        amount,
        returnRate: inv.returnRate,
        riskLevel: inv.risk,
        status: "active",
        matureAt,
      });
      await logTransaction(interaction.guildId!, interaction.user.id, null, amount, "purchase", `${inv.label} inversión`);

      const expected = Math.floor(amount * (1 + inv.returnRate / 100));
      await interaction.reply({
        embeds: [successEmbed("Inversión Creada", `Invertiste **${formatCurrency(amount)}** en un portafolio ${inv.label}.\n\n**Retorno esperado:** ${formatCurrency(expected)}\n**Madura:** <t:${Math.floor(matureAt.getTime() / 1000)}:R>`)],
      });

    } else {
      const investments = await db.select().from(investmentsTable)
        .where(and(eq(investmentsTable.userId, interaction.user.id), eq(investmentsTable.guildId, interaction.guildId!)));

      const active = investments.filter((i) => i.status === "active");
      const completed = investments.filter((i) => i.status === "completed");

      const embed = new EmbedBuilder()
        .setColor(Colors.Economy)
        .setTitle("📈 Portafolio de Inversiones")
        .addFields(
          {
            name: `🟢 Activas (${active.length})`,
            value: active.length > 0
              ? active.map((i) => `${i.type}: **${formatCurrency(i.amount)}** → Madura <t:${Math.floor(new Date(i.matureAt).getTime() / 1000)}:R>`).join("\n")
              : "Sin inversiones activas",
          },
          {
            name: `✅ Completadas (${completed.length})`,
            value: completed.length > 0
              ? `Total completadas: ${completed.length} inversiones`
              : "Ninguna aún",
            inline: true,
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};

export default command;
