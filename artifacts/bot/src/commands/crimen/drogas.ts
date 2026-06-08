import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { usersTable, drugOperationsTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { generateId, formatCurrency, formatTime, getOrCreateUser, randomBetween } from "../../utils/helpers.js";
import { Colors, errorEmbed, successEmbed } from "../../utils/embeds.js";
import { removeCash, logTransaction } from "../../services/economyService.js";

const DRUGS: Record<string, { emoji: string; cost: number; growMinutes: number; minYield: number; maxYield: number }> = {
  marihuana: { emoji: "🌿", cost: 500, growMinutes: 30, minYield: 800, maxYield: 1200 },
  cocaina: { emoji: "❄️", cost: 1500, growMinutes: 60, minYield: 2500, maxYield: 4000 },
  meta: { emoji: "💎", cost: 2500, growMinutes: 90, minYield: 4000, maxYield: 7000 },
  heroina: { emoji: "💉", cost: 4000, growMinutes: 120, minYield: 6000, maxYield: 12000 },
};

const MAX_ACTIVE_PLOTS = 3;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("drogas")
    .setDescription("Operaciones de narcotráfico ilegales")
    .addSubcommand((s) =>
      s.setName("sembrar")
        .setDescription("Sembrar un cultivo ilegal")
        .addStringOption((o) =>
          o.setName("tipo")
            .setDescription("Tipo de droga a sembrar")
            .setRequired(true)
            .addChoices(
              { name: "🌿 Marihuana — $500 · listo en 30m", value: "marihuana" },
              { name: "❄️ Cocaína — $1,500 · listo en 1h", value: "cocaina" },
              { name: "💎 Meta — $2,500 · listo en 1.5h", value: "meta" },
              { name: "💉 Heroína — $4,000 · listo en 2h", value: "heroina" },
            )
        )
    )
    .addSubcommand((s) => s.setName("cosechar").setDescription("Cosechar cultivos listos y cobrar dinero sucio"))
    .addSubcommand((s) => s.setName("info").setDescription("Ver estado de tus cultivos activos")),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const user = await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);

    if (sub === "sembrar") {
      const tipo = interaction.options.getString("tipo", true);
      const drug = DRUGS[tipo]!;

      const activePlots = await db
        .select()
        .from(drugOperationsTable)
        .where(and(
          eq(drugOperationsTable.userId, interaction.user.id),
          eq(drugOperationsTable.guildId, interaction.guildId!),
          eq(drugOperationsTable.status, "growing"),
        ));

      if (activePlots.length >= MAX_ACTIVE_PLOTS) {
        await interaction.reply({
          embeds: [errorEmbed("Cultivos Llenos", `Solo puedes tener **${MAX_ACTIVE_PLOTS}** cultivos activos a la vez. Cosecha primero.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const paid = await removeCash(interaction.user.id, interaction.guildId!, drug.cost);
      if (!paid) {
        await interaction.reply({
          embeds: [errorEmbed("Sin Fondos", `Necesitas **${formatCurrency(drug.cost)}** en efectivo para sembrar.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const readyAt = new Date(Date.now() + drug.growMinutes * 60 * 1000);
      await db.insert(drugOperationsTable).values({
        id: generateId(),
        guildId: interaction.guildId!,
        userId: interaction.user.id,
        drugType: tipo,
        quantity: 1,
        status: "growing",
        readyAt,
      });

      await logTransaction(interaction.guildId!, interaction.user.id, null, drug.cost, "drug_sale", `Sembró ${tipo}`);

      const embed = new EmbedBuilder()
        .setColor(Colors.Criminal)
        .setTitle(`${drug.emoji} Cultivo Sembrado`)
        .setDescription(`Sembraste **${tipo}** con **${formatCurrency(drug.cost)}** invertidos.\n\nEstarán listos para cosechar <t:${Math.floor(readyAt.getTime() / 1000)}:R>.`)
        .addFields({ name: "💰 Ganancia estimada", value: `${formatCurrency(drug.minYield)} – ${formatCurrency(drug.maxYield)} dinero sucio`, inline: true })
        .setFooter({ text: "Usa /drogas cosechar cuando estén listos • Máx. 3 cultivos activos" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } else if (sub === "cosechar") {
      const now = new Date();
      const readyOps = await db
        .select()
        .from(drugOperationsTable)
        .where(and(
          eq(drugOperationsTable.userId, interaction.user.id),
          eq(drugOperationsTable.guildId, interaction.guildId!),
          eq(drugOperationsTable.status, "growing"),
          lte(drugOperationsTable.readyAt, now),
        ));

      if (readyOps.length === 0) {
        const growingOps = await db
          .select()
          .from(drugOperationsTable)
          .where(and(
            eq(drugOperationsTable.userId, interaction.user.id),
            eq(drugOperationsTable.guildId, interaction.guildId!),
            eq(drugOperationsTable.status, "growing"),
          ));

        if (growingOps.length === 0) {
          await interaction.reply({
            embeds: [errorEmbed("Sin Cultivos", "No tienes cultivos activos. Usa `/drogas sembrar` para empezar.")],
            flags: MessageFlags.Ephemeral,
          });
        } else {
          const nextReady = growingOps.sort((a, b) => new Date(a.readyAt).getTime() - new Date(b.readyAt).getTime())[0]!;
          const timeLeft = new Date(nextReady.readyAt).getTime() - Date.now();
          await interaction.reply({
            embeds: [errorEmbed("Aún No Listos", `Tus cultivos no están listos. El próximo estará listo en **${formatTime(timeLeft)}**.`)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      let totalDirty = 0;
      const harvested: string[] = [];

      for (const op of readyOps) {
        const drug = DRUGS[op.drugType];
        if (!drug) continue;
        const yield_ = randomBetween(drug.minYield, drug.maxYield);
        totalDirty += yield_;
        harvested.push(`${drug.emoji} **${op.drugType}** → ${formatCurrency(yield_)} sucio`);

        await db.update(drugOperationsTable)
          .set({ status: "harvested", harvestedAt: now })
          .where(eq(drugOperationsTable.id, op.id));
      }

      await db.update(usersTable)
        .set({ dirtyMoney: sql`${usersTable.dirtyMoney} + ${totalDirty}` })
        .where(and(eq(usersTable.discordId, interaction.user.id), eq(usersTable.guildId, interaction.guildId!)));

      await logTransaction(interaction.guildId!, null, interaction.user.id, totalDirty, "drug_sale", `Cosechó ${readyOps.length} cultivo(s)`);

      const embed = new EmbedBuilder()
        .setColor(Colors.DirtyMoney)
        .setTitle("💰 Cosecha Completada")
        .setDescription(harvested.join("\n"))
        .addFields(
          { name: "🤑 Total Dinero Sucio", value: `**${formatCurrency(totalDirty)}**`, inline: true },
          { name: "🧼 Para limpiar", value: "Usa `/lavar` para convertirlo en efectivo legal", inline: true },
        )
        .setFooter({ text: "Recuerda lavar el dinero o las autoridades pueden confiscarlo" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } else if (sub === "info") {
      const ops = await db
        .select()
        .from(drugOperationsTable)
        .where(and(
          eq(drugOperationsTable.userId, interaction.user.id),
          eq(drugOperationsTable.guildId, interaction.guildId!),
          eq(drugOperationsTable.status, "growing"),
        ));

      const now = Date.now();

      const embed = new EmbedBuilder()
        .setColor(Colors.Criminal)
        .setTitle("🌱 Tus Cultivos Activos")
        .setTimestamp();

      if (ops.length === 0) {
        embed.setDescription("No tienes cultivos activos.\nUsa `/drogas sembrar` para empezar.");
      } else {
        const lines = ops.map((op) => {
          const drug = DRUGS[op.drugType];
          const readyTs = Math.floor(new Date(op.readyAt).getTime() / 1000);
          const isReady = new Date(op.readyAt).getTime() <= now;
          const status = isReady ? "✅ **LISTO para cosechar**" : `⏳ Listo <t:${readyTs}:R>`;
          return `${drug?.emoji ?? "🌱"} **${op.drugType}** — ${status}`;
        });
        embed.setDescription(lines.join("\n\n"));
        embed.addFields({
          name: "💵 Dinero sucio acumulado",
          value: `**${formatCurrency(user.dirtyMoney)}**`,
          inline: true,
        });
      }

      embed.setFooter({ text: `Parcelas: ${ops.length}/${MAX_ACTIVE_PLOTS} en uso` });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

export default command;
