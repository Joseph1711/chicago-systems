import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { companiesTable, companyMembersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateId, formatCurrency, getOrCreateUser } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { removeCash, logTransaction } from "../../services/economyService.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("empresa")
    .setDescription("Gestión de empresas")
    .addSubcommand((s) => s.setName("crear").setDescription("Crear una empresa").addStringOption((o) => o.setName("nombre").setDescription("Nombre de la empresa").setRequired(true)).addIntegerOption((o) => o.setName("fondos_iniciales").setDescription("Fondos iniciales").setRequired(false).setMinValue(0)))
    .addSubcommand((s) => s.setName("info").setDescription("Ver información de tu empresa"))
    .addSubcommand((s) => s.setName("contratar").setDescription("Contratar un empleado").addUserOption((o) => o.setName("usuario").setDescription("Usuario a contratar").setRequired(true)).addIntegerOption((o) => o.setName("salario").setDescription("Salario diario").setRequired(false).setMinValue(0)))
    .addSubcommand((s) => s.setName("despedir").setDescription("Despedir a un empleado").addUserOption((o) => o.setName("usuario").setDescription("Usuario a despedir").setRequired(true)))
    .addSubcommand((s) => s.setName("miembros").setDescription("Ver empleados de la empresa"))
    .addSubcommand((s) => s.setName("depositar").setDescription("Depositar fondos a la empresa").addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1))),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === "crear") {
      const existing = await db.select().from(companiesTable)
        .where(and(eq(companiesTable.guildId, interaction.guildId!), eq(companiesTable.ownerId, interaction.user.id), eq(companiesTable.isActive, true)));

      if (existing.length > 0) {
        await interaction.reply({ embeds: [errorEmbed("Ya Tienes Empresa", "Ya eres dueño de una empresa. Solo puedes tener una a la vez.")], ephemeral: true });
        return;
      }

      const name = interaction.options.getString("nombre", true);
      const initialFunds = interaction.options.getInteger("fondos_iniciales") ?? 0;

      const user = await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);
      if (initialFunds > 0 && user.cash < initialFunds) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `Necesitas ${formatCurrency(initialFunds)} para fundar la empresa.`)], ephemeral: true });
        return;
      }

      if (initialFunds > 0) await removeCash(interaction.user.id, interaction.guildId!, initialFunds);

      const [company] = await db.insert(companiesTable).values({
        id: generateId(),
        guildId: interaction.guildId!,
        name,
        ownerId: interaction.user.id,
        funds: initialFunds,
        isActive: true,
      }).returning();

      await db.insert(companyMembersTable).values({
        id: generateId(),
        companyId: company!.id,
        userId: interaction.user.id,
        guildId: interaction.guildId!,
        role: "owner",
        salary: 0,
        isActive: true,
      });

      await interaction.reply({ embeds: [successEmbed("Empresa Creada", `🏢 ¡**${name}** ha sido fundada con **${formatCurrency(initialFunds)}** en fondos!`)] });

    } else if (sub === "info") {
      const [company] = await db.select().from(companiesTable)
        .where(and(eq(companiesTable.guildId, interaction.guildId!), eq(companiesTable.ownerId, interaction.user.id), eq(companiesTable.isActive, true)));

      if (!company) {
        await interaction.reply({ embeds: [errorEmbed("Sin Empresa", "No tienes una empresa. Usa `/empresa crear` para fundar una.")], ephemeral: true });
        return;
      }

      const members = await db.select().from(companyMembersTable)
        .where(and(eq(companyMembersTable.companyId, company.id), eq(companyMembersTable.isActive, true)));

      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle(`🏢 ${company.name}`)
        .addFields(
          { name: "Dueño", value: `<@${company.ownerId}>`, inline: true },
          { name: "Fondos", value: formatCurrency(company.funds), inline: true },
          { name: "Empleados", value: `${members.length}`, inline: true },
          { name: "Tasa de Impuesto", value: `${company.taxRate}%`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "contratar") {
      const [company] = await db.select().from(companiesTable)
        .where(and(eq(companiesTable.guildId, interaction.guildId!), eq(companiesTable.ownerId, interaction.user.id), eq(companiesTable.isActive, true)));

      if (!company) {
        await interaction.reply({ embeds: [errorEmbed("Sin Empresa", "No tienes una empresa.")], ephemeral: true });
        return;
      }

      const target = interaction.options.getUser("usuario", true);
      const salary = interaction.options.getInteger("salario") ?? 500;

      const existing = await db.select().from(companyMembersTable)
        .where(and(eq(companyMembersTable.companyId, company.id), eq(companyMembersTable.userId, target.id), eq(companyMembersTable.isActive, true)));

      if (existing.length > 0) {
        await interaction.reply({ embeds: [errorEmbed("Ya Empleado", `${target} ya es empleado de tu empresa.`)], ephemeral: true });
        return;
      }

      await getOrCreateUser(target.id, interaction.guildId!, target.username);
      await db.insert(companyMembersTable).values({
        id: generateId(),
        companyId: company.id,
        userId: target.id,
        guildId: interaction.guildId!,
        role: "employee",
        salary,
        isActive: true,
      });

      await interaction.reply({ embeds: [successEmbed("Empleado Contratado", `${target} ha sido contratado en **${company.name}** con un salario de **${formatCurrency(salary)}/día**.`)] });

    } else if (sub === "despedir") {
      const [company] = await db.select().from(companiesTable)
        .where(and(eq(companiesTable.guildId, interaction.guildId!), eq(companiesTable.ownerId, interaction.user.id), eq(companiesTable.isActive, true)));

      if (!company) {
        await interaction.reply({ embeds: [errorEmbed("Sin Empresa", "No tienes una empresa.")], ephemeral: true });
        return;
      }

      const target = interaction.options.getUser("usuario", true);
      const [member] = await db.select().from(companyMembersTable)
        .where(and(eq(companyMembersTable.companyId, company.id), eq(companyMembersTable.userId, target.id), eq(companyMembersTable.isActive, true))).limit(1);

      if (!member) {
        await interaction.reply({ embeds: [errorEmbed("No Empleado", `${target} no es empleado de tu empresa.`)], ephemeral: true });
        return;
      }

      await db.update(companyMembersTable).set({ isActive: false }).where(eq(companyMembersTable.id, member.id));
      await interaction.reply({ embeds: [successEmbed("Empleado Despedido", `${target} ha sido removido de **${company.name}**.`)] });

    } else if (sub === "miembros") {
      const [company] = await db.select().from(companiesTable)
        .where(and(eq(companiesTable.guildId, interaction.guildId!), eq(companiesTable.ownerId, interaction.user.id), eq(companiesTable.isActive, true)));

      if (!company) {
        await interaction.reply({ embeds: [errorEmbed("Sin Empresa", "No tienes una empresa.")], ephemeral: true });
        return;
      }

      const members = await db.select().from(companyMembersTable)
        .where(and(eq(companyMembersTable.companyId, company.id), eq(companyMembersTable.isActive, true)));

      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle(`👥 ${company.name} — Empleados`)
        .setDescription(members.map((m) => `<@${m.userId}> — **${m.role}** | ${formatCurrency(m.salary)}/día`).join("\n") || "Sin empleados.")
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "depositar") {
      const [company] = await db.select().from(companiesTable)
        .where(and(eq(companiesTable.guildId, interaction.guildId!), eq(companiesTable.ownerId, interaction.user.id), eq(companiesTable.isActive, true)));

      if (!company) {
        await interaction.reply({ embeds: [errorEmbed("Sin Empresa", "No tienes una empresa.")], ephemeral: true });
        return;
      }

      const amount = interaction.options.getInteger("cantidad", true);
      const success = await removeCash(interaction.user.id, interaction.guildId!, amount);
      if (!success) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `No tienes ${formatCurrency(amount)} en efectivo.`)], ephemeral: true });
        return;
      }

      await db.update(companiesTable).set({ funds: sql`${companiesTable.funds} + ${amount}` }).where(eq(companiesTable.id, company.id));
      await logTransaction(interaction.guildId!, interaction.user.id, null, amount, "purchase", `Depósito a ${company.name}`);
      await interaction.reply({ embeds: [successEmbed("Fondos Depositados", `Depositaste **${formatCurrency(amount)}** a **${company.name}**. Nuevo saldo: **${formatCurrency(company.funds + amount)}**.`)] });
    }
  },
};

export default command;
