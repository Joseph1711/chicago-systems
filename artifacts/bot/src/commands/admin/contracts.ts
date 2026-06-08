import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { contractsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId, formatCurrency, getOrCreateUser } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { addCash, logTransaction } from "../../services/economyService.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("contrato")
    .setDescription("Sistema de contratos")
    .addSubcommand((s) => s.setName("lista").setDescription("Ver contratos disponibles"))
    .addSubcommand((s) =>
      s.setName("crear").setDescription("Crear un contrato")
        .addStringOption((o) => o.setName("titulo").setDescription("Título del contrato").setRequired(true))
        .addStringOption((o) => o.setName("descripcion").setDescription("Descripción del contrato").setRequired(true))
        .addIntegerOption((o) => o.setName("recompensa").setDescription("Monto de la recompensa").setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName("tipo").setDescription("Tipo de contrato").setRequired(false).addChoices({ name: "Público", value: "public" }, { name: "Privado", value: "private" }, { name: "Recompensa", value: "bounty" }))
    )
    .addSubcommand((s) =>
      s.setName("aceptar").setDescription("Aceptar un contrato")
        .addStringOption((o) => o.setName("id").setDescription("ID del contrato").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("completar").setDescription("Marcar un contrato como completado")
        .addStringOption((o) => o.setName("id").setDescription("ID del contrato").setRequired(true))
    ),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === "lista") {
      const contracts = await db.select().from(contractsTable)
        .where(and(eq(contractsTable.guildId, interaction.guildId!), eq(contractsTable.status, "open")));

      if (contracts.length === 0) {
        await interaction.reply({ embeds: [errorEmbed("Sin Contratos", "No hay contratos disponibles.")], ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle("📋 Contratos Disponibles")
        .setDescription(contracts.map((c) =>
          `\`${c.id.slice(0, 8)}\` **${c.title}** [${c.type}]\n💰 Recompensa: ${formatCurrency(c.reward)}\n📝 ${c.description.slice(0, 80)}${c.description.length > 80 ? "..." : ""}`
        ).join("\n\n"))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "crear") {
      const title = interaction.options.getString("titulo", true);
      const description = interaction.options.getString("descripcion", true);
      const reward = interaction.options.getInteger("recompensa", true);
      const type = interaction.options.getString("tipo") ?? "public";

      const contractId = generateId();
      await db.insert(contractsTable).values({
        id: contractId,
        guildId: interaction.guildId!,
        title,
        description,
        reward,
        type,
        issuedBy: interaction.user.id,
        status: "open",
      });

      await interaction.reply({
        embeds: [successEmbed("Contrato Creado", `📋 ¡**${title}** ya está disponible!\nRecompensa: **${formatCurrency(reward)}**\nID: \`${contractId.slice(0, 8)}\``)],
      });

    } else if (sub === "aceptar") {
      const contractIdPrefix = interaction.options.getString("id", true);
      const all = await db.select().from(contractsTable)
        .where(and(eq(contractsTable.guildId, interaction.guildId!), eq(contractsTable.status, "open")));
      const contract = all.find((c) => c.id.startsWith(contractIdPrefix));

      if (!contract) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", "Contrato no encontrado o ya tomado.")], ephemeral: true });
        return;
      }

      await db.update(contractsTable).set({ assignedTo: interaction.user.id, status: "in_progress" }).where(eq(contractsTable.id, contract.id));
      await interaction.reply({ embeds: [successEmbed("Contrato Aceptado", `¡Aceptaste **${contract.title}**!\nComplétalo para ganar **${formatCurrency(contract.reward)}**.`)] });

    } else if (sub === "completar") {
      const contractIdPrefix = interaction.options.getString("id", true);
      const all = await db.select().from(contractsTable).where(eq(contractsTable.guildId, interaction.guildId!));
      const contract = all.find((c) => c.id.startsWith(contractIdPrefix));

      if (!contract || !contract.assignedTo) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", "Contrato no encontrado o sin asignar.")], ephemeral: true });
        return;
      }

      await db.update(contractsTable).set({ status: "completed", completedAt: new Date() }).where(eq(contractsTable.id, contract.id));
      await addCash(contract.assignedTo, interaction.guildId!, contract.reward);
      await logTransaction(interaction.guildId!, null, contract.assignedTo, contract.reward, "contract_reward", contract.title);

      await interaction.reply({ embeds: [successEmbed("Contrato Completado", `¡**${contract.title}** completado! <@${contract.assignedTo}> ganó **${formatCurrency(contract.reward)}**.`)] });
    }
  },
};

export default command;
