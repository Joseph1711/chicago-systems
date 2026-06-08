import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { usersTable, criminalMissionsTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { generateId, formatCurrency, formatTime, getOrCreateUser, randomBetween } from "../../utils/helpers.js";
import { Colors, errorEmbed, successEmbed } from "../../utils/embeds.js";
import { logTransaction } from "../../services/economyService.js";

interface MissionDef {
  emoji: string;
  name: string;
  desc: string;
  durationMinutes: number;
  minReward: number;
  maxReward: number;
  riskMsg: string;
}

const MISSIONS: Record<string, MissionDef> = {
  robo_auto: {
    emoji: "🚗",
    name: "Robo de Auto",
    desc: "Roba un vehículo del estacionamiento y véndeselo a un chatarrería sin preguntas.",
    durationMinutes: 15,
    minReward: 800,
    maxReward: 1800,
    riskMsg: "Asegúrate de que no haya testigos...",
  },
  robo_casa: {
    emoji: "🏠",
    name: "Robo de Casa",
    desc: "Entra a una residencia mientras los dueños están fuera y llévate objetos de valor.",
    durationMinutes: 30,
    minReward: 2500,
    maxReward: 5000,
    riskMsg: "Las alarmas son tu mayor enemigo.",
  },
  atraco_tienda: {
    emoji: "🏪",
    name: "Atraco a Tienda",
    desc: "Atraca una tienda de conveniencia armado. Rápido, sucio y directo.",
    durationMinutes: 45,
    minReward: 5000,
    maxReward: 10000,
    riskMsg: "Las cámaras de seguridad no perdonan.",
  },
  atraco_banco: {
    emoji: "🏦",
    name: "Atraco al Banco",
    desc: "La operación más peligrosa: atracar una sucursal bancaria con un equipo. El botín vale el riesgo.",
    durationMinutes: 90,
    minReward: 12000,
    maxReward: 30000,
    riskMsg: "Solo los más temerarios se atreven. ¿Eres uno de ellos?",
  },
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("misiones")
    .setDescription("Misiones criminales para ganar dinero sucio")
    .addSubcommand((s) => s.setName("lista").setDescription("Ver misiones disponibles y sus recompensas"))
    .addSubcommand((s) =>
      s.setName("iniciar")
        .setDescription("Iniciar una misión criminal")
        .addStringOption((o) =>
          o.setName("tipo")
            .setDescription("Tipo de misión")
            .setRequired(true)
            .addChoices(
              { name: "🚗 Robo de Auto — 15m · $800–$1,800", value: "robo_auto" },
              { name: "🏠 Robo de Casa — 30m · $2,500–$5,000", value: "robo_casa" },
              { name: "🏪 Atraco a Tienda — 45m · $5,000–$10,000", value: "atraco_tienda" },
              { name: "🏦 Atraco al Banco — 90m · $12,000–$30,000", value: "atraco_banco" },
            )
        )
    )
    .addSubcommand((s) => s.setName("completar").setDescription("Reclamar recompensa de misiones terminadas"))
    .addSubcommand((s) => s.setName("activas").setDescription("Ver tus misiones en curso")),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const user = await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);

    if (sub === "lista") {
      const embed = new EmbedBuilder()
        .setColor(Colors.Criminal)
        .setTitle("🔫 Misiones Criminales")
        .setDescription("Completa misiones para ganar **dinero sucio**. Solo puedes tener 1 misión activa a la vez.\n\nUsa `/lavar` para convertir el dinero sucio en efectivo limpio.")
        .setTimestamp();

      for (const [key, m] of Object.entries(MISSIONS)) {
        embed.addFields({
          name: `${m.emoji} ${m.name} · \`${key}\``,
          value: `${m.desc}\n⏳ Duración: **${m.durationMinutes} min** · 💰 Recompensa: **${formatCurrency(m.minReward)}–${formatCurrency(m.maxReward)} sucio**\n*${m.riskMsg}*`,
        });
      }

      embed.setFooter({ text: "Usa /misiones iniciar <tipo> para comenzar" });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } else if (sub === "iniciar") {
      const tipo = interaction.options.getString("tipo", true);
      const mDef = MISSIONS[tipo]!;

      const existing = await db
        .select()
        .from(criminalMissionsTable)
        .where(and(
          eq(criminalMissionsTable.userId, interaction.user.id),
          eq(criminalMissionsTable.guildId, interaction.guildId!),
          eq(criminalMissionsTable.status, "active"),
        ))
        .limit(1);

      if (existing.length > 0) {
        const ex = existing[0]!;
        const completable = new Date(ex.completableAt).getTime();
        const isReady = completable <= Date.now();
        const msg = isReady
          ? "Tienes una misión lista. Usa `/misiones completar` para reclamar tu recompensa primero."
          : `Ya tienes una misión activa (**${MISSIONS[ex.missionType]?.name ?? ex.missionType}**). Termina en <t:${Math.floor(completable / 1000)}:R>.`;

        await interaction.reply({ embeds: [errorEmbed("Misión en Curso", msg)], flags: MessageFlags.Ephemeral });
        return;
      }

      const completableAt = new Date(Date.now() + mDef.durationMinutes * 60 * 1000);
      const reward = randomBetween(mDef.minReward, mDef.maxReward);

      await db.insert(criminalMissionsTable).values({
        id: generateId(),
        guildId: interaction.guildId!,
        userId: interaction.user.id,
        missionType: tipo,
        status: "active",
        reward,
        completableAt,
      });

      const embed = new EmbedBuilder()
        .setColor(Colors.Criminal)
        .setTitle(`${mDef.emoji} Misión Iniciada: ${mDef.name}`)
        .setDescription(`*${mDef.desc}*\n\n${mDef.riskMsg}`)
        .addFields(
          { name: "⏰ Lista para cobrar", value: `<t:${Math.floor(completableAt.getTime() / 1000)}:R>`, inline: true },
          { name: "💰 Recompensa", value: `**${formatCurrency(reward)}** sucio (al completar)`, inline: true },
        )
        .setFooter({ text: "Usa /misiones completar cuando el tiempo termine" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } else if (sub === "completar") {
      const now = new Date();

      const ready = await db
        .select()
        .from(criminalMissionsTable)
        .where(and(
          eq(criminalMissionsTable.userId, interaction.user.id),
          eq(criminalMissionsTable.guildId, interaction.guildId!),
          eq(criminalMissionsTable.status, "active"),
          lte(criminalMissionsTable.completableAt, now),
        ))
        .limit(1);

      if (ready.length === 0) {
        const active = await db
          .select()
          .from(criminalMissionsTable)
          .where(and(
            eq(criminalMissionsTable.userId, interaction.user.id),
            eq(criminalMissionsTable.guildId, interaction.guildId!),
            eq(criminalMissionsTable.status, "active"),
          ))
          .limit(1);

        if (active.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed("Sin Misión", "No tienes misiones activas. Usa `/misiones iniciar` para empezar.")],
            flags: MessageFlags.Ephemeral,
          });
        } else {
          const m = active[0]!;
          const timeLeft = new Date(m.completableAt).getTime() - Date.now();
          await interaction.reply({
            embeds: [errorEmbed("Aún No Terminada", `Tu misión **${MISSIONS[m.missionType]?.name}** termina en **${formatTime(timeLeft)}**.`)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      const mission = ready[0]!;
      const mDef = MISSIONS[mission.missionType]!;

      await db.update(criminalMissionsTable)
        .set({ status: "completed", completedAt: now })
        .where(eq(criminalMissionsTable.id, mission.id));

      await db.update(usersTable)
        .set({ dirtyMoney: sql`${usersTable.dirtyMoney} + ${mission.reward}` })
        .where(and(eq(usersTable.discordId, interaction.user.id), eq(usersTable.guildId, interaction.guildId!)));

      await logTransaction(interaction.guildId!, null, interaction.user.id, mission.reward, "criminal_mission", `Completó: ${mission.missionType}`);

      const embed = new EmbedBuilder()
        .setColor(Colors.DirtyMoney)
        .setTitle(`${mDef.emoji} Misión Completada`)
        .setDescription(`¡Completaste **${mDef.name}** exitosamente!`)
        .addFields(
          { name: "💰 Dinero sucio ganado", value: `**${formatCurrency(mission.reward)}**`, inline: true },
          { name: "💵 Total dinero sucio", value: `**${formatCurrency(user.dirtyMoney + mission.reward)}**`, inline: true },
        )
        .addFields({ name: "🧼 Siguiente paso", value: "Usa `/lavar` para convertirlo en efectivo limpio y gastarlo." })
        .setFooter({ text: "El crimen paga, pero el lavado también cuesta" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } else if (sub === "activas") {
      const missions = await db
        .select()
        .from(criminalMissionsTable)
        .where(and(
          eq(criminalMissionsTable.userId, interaction.user.id),
          eq(criminalMissionsTable.guildId, interaction.guildId!),
          eq(criminalMissionsTable.status, "active"),
        ));

      const embed = new EmbedBuilder()
        .setColor(Colors.Criminal)
        .setTitle("🔫 Tus Misiones Activas")
        .setTimestamp();

      if (missions.length === 0) {
        embed.setDescription("No tienes misiones activas.\nUsa `/misiones iniciar` para comenzar una.");
      } else {
        const now = Date.now();
        const lines = missions.map((m) => {
          const def = MISSIONS[m.missionType];
          const ts = Math.floor(new Date(m.completableAt).getTime() / 1000);
          const isReady = new Date(m.completableAt).getTime() <= now;
          const status = isReady ? "✅ **LISTA — usa `/misiones completar`**" : `⏳ Lista <t:${ts}:R>`;
          return `${def?.emoji ?? "🔫"} **${def?.name ?? m.missionType}** — ${status}\n💰 Recompensa: **${formatCurrency(m.reward)}** sucio`;
        });
        embed.setDescription(lines.join("\n\n"));
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

export default command;
