import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import {
  departmentsTable,
  departmentMembersTable,
  departmentAuditsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateId, formatCurrency, getOrCreateUser } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { addCash, logTransaction } from "../../services/economyService.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("departamento")
    .setDescription("Gestión de departamentos")
    .addSubcommand((s) => s.setName("lista").setDescription("Ver todos los departamentos"))
    .addSubcommand((s) =>
      s.setName("info").setDescription("Ver información de un departamento")
        .addStringOption((o) => o.setName("nombre").setDescription("Nombre o siglas del departamento").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("unirse").setDescription("Solicitar unirse a un departamento")
        .addStringOption((o) => o.setName("nombre").setDescription("Nombre o siglas del departamento").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("contratar").setDescription("Contratar a un usuario en el departamento")
        .addStringOption((o) => o.setName("departamento").setDescription("Siglas del departamento").setRequired(true))
        .addUserOption((o) => o.setName("usuario").setDescription("Usuario a contratar").setRequired(true))
        .addStringOption((o) => o.setName("rango").setDescription("Rango").setRequired(false))
        .addIntegerOption((o) => o.setName("salario").setDescription("Salario").setRequired(false).setMinValue(0))
    )
    .addSubcommand((s) =>
      s.setName("despedir").setDescription("Despedir a un usuario del departamento")
        .addStringOption((o) => o.setName("departamento").setDescription("Siglas del departamento").setRequired(true))
        .addUserOption((o) => o.setName("usuario").setDescription("Usuario a despedir").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("presupuesto").setDescription("Ver o modificar el presupuesto del departamento")
        .addStringOption((o) => o.setName("departamento").setDescription("Siglas del departamento").setRequired(true))
        .addIntegerOption((o) => o.setName("agregar").setDescription("Cantidad a agregar").setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName("miembros").setDescription("Ver miembros del departamento")
        .addStringOption((o) => o.setName("nombre").setDescription("Nombre o siglas del departamento").setRequired(true))
    ),
  cooldown: 3,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === "lista") {
      const depts = await db.select().from(departmentsTable)
        .where(and(eq(departmentsTable.guildId, interaction.guildId!), eq(departmentsTable.isActive, true)));

      if (depts.length === 0) {
        await interaction.reply({ embeds: [errorEmbed("Sin Departamentos", "No hay departamentos configurados. Usa `/admin departamento crear`.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.Department)
        .setTitle("🏛️ Departamentos Gubernamentales")
        .setDescription(depts.map((d) => `${d.emoji ?? "🏛️"} **${d.name}** (\`${d.acronym}\`) — Presupuesto: ${formatCurrency(d.budget)}`).join("\n"))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "info") {
      const name = interaction.options.getString("nombre", true);
      const dept = await findDepartment(interaction.guildId!, name);
      if (!dept) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Departamento **${name}** no encontrado.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      const members = await db.select().from(departmentMembersTable)
        .where(and(eq(departmentMembersTable.departmentId, dept.id), eq(departmentMembersTable.isActive, true)));

      const embed = new EmbedBuilder()
        .setColor(Colors.Department)
        .setTitle(`${dept.emoji ?? "🏛️"} ${dept.name}`)
        .setDescription(dept.description ?? "Sin descripción.")
        .addFields(
          { name: "Siglas", value: dept.acronym, inline: true },
          { name: "Presupuesto", value: formatCurrency(dept.budget), inline: true },
          { name: "Miembros", value: `${members.length}`, inline: true },
          { name: "Rol", value: dept.roleId ? `<@&${dept.roleId}>` : "No configurado", inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "miembros") {
      const name = interaction.options.getString("nombre", true);
      const dept = await findDepartment(interaction.guildId!, name);
      if (!dept) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Departamento **${name}** no encontrado.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      const members = await db.select({
        userId: departmentMembersTable.userId,
        rank: departmentMembersTable.rank,
        salary: departmentMembersTable.salary,
        joinedAt: departmentMembersTable.joinedAt,
      }).from(departmentMembersTable)
        .where(and(eq(departmentMembersTable.departmentId, dept.id), eq(departmentMembersTable.isActive, true)));

      const embed = new EmbedBuilder()
        .setColor(Colors.Department)
        .setTitle(`👮 ${dept.name} — Miembros (${members.length})`)
        .setDescription(members.length > 0
          ? members.map((m) => `<@${m.userId}> — **${m.rank}** | ${formatCurrency(m.salary)}/día`).join("\n")
          : "Sin miembros activos.")
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "contratar") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ embeds: [errorEmbed("Sin Permiso", "Necesitas el permiso de Gestionar Roles.")], flags: MessageFlags.Ephemeral });
        return;
      }
      const deptName = interaction.options.getString("departamento", true);
      const target = interaction.options.getUser("usuario", true);
      const rank = interaction.options.getString("rango") ?? "Recluta";
      const salary = interaction.options.getInteger("salario") ?? 500;
      const dept = await findDepartment(interaction.guildId!, deptName);
      if (!dept) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Departamento **${deptName}** no encontrado.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      const existing = await db.select().from(departmentMembersTable)
        .where(and(
          eq(departmentMembersTable.departmentId, dept.id),
          eq(departmentMembersTable.userId, target.id),
          eq(departmentMembersTable.isActive, true)
        )).limit(1);

      if (existing[0]) {
        await interaction.reply({ embeds: [errorEmbed("Ya es Miembro", `${target} ya pertenece a este departamento.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      await getOrCreateUser(target.id, interaction.guildId!, target.username);
      await db.insert(departmentMembersTable).values({
        id: generateId(),
        departmentId: dept.id,
        userId: target.id,
        guildId: interaction.guildId!,
        rank,
        salary,
        isActive: true,
      });

      if (dept.roleId) {
        const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
        if (member) await member.roles.add(dept.roleId).catch(() => null);
      }

      await logAudit(dept.id, interaction.guildId!, interaction.user.id, "hire", `Contrató a ${target.username} como ${rank}`);
      await interaction.reply({ embeds: [successEmbed("Miembro Contratado", `${target} ha sido contratado en **${dept.name}** como **${rank}**.`)] });

    } else if (sub === "despedir") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ embeds: [errorEmbed("Sin Permiso", "Necesitas el permiso de Gestionar Roles.")], flags: MessageFlags.Ephemeral });
        return;
      }
      const deptName = interaction.options.getString("departamento", true);
      const target = interaction.options.getUser("usuario", true);
      const dept = await findDepartment(interaction.guildId!, deptName);
      if (!dept) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Departamento **${deptName}** no encontrado.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      const [member] = await db.select().from(departmentMembersTable)
        .where(and(
          eq(departmentMembersTable.departmentId, dept.id),
          eq(departmentMembersTable.userId, target.id),
          eq(departmentMembersTable.isActive, true)
        )).limit(1);

      if (!member) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `${target} no pertenece a este departamento.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      await db.update(departmentMembersTable).set({ isActive: false }).where(eq(departmentMembersTable.id, member.id));

      if (dept.roleId) {
        const guildMember = await interaction.guild?.members.fetch(target.id).catch(() => null);
        if (guildMember) await guildMember.roles.remove(dept.roleId).catch(() => null);
      }

      await logAudit(dept.id, interaction.guildId!, interaction.user.id, "fire", `Despidió a ${target.username}`);
      await interaction.reply({ embeds: [successEmbed("Miembro Despedido", `${target} ha sido removido de **${dept.name}**.`)] });

    } else if (sub === "presupuesto") {
      const deptName = interaction.options.getString("departamento", true);
      const add = interaction.options.getInteger("agregar");
      const dept = await findDepartment(interaction.guildId!, deptName);
      if (!dept) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Departamento **${deptName}** no encontrado.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      if (add !== null) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({ embeds: [errorEmbed("Sin Permiso", "Solo los administradores pueden modificar presupuestos.")], flags: MessageFlags.Ephemeral });
          return;
        }
        await db.update(departmentsTable)
          .set({ budget: sql`${departmentsTable.budget} + ${add}` })
          .where(eq(departmentsTable.id, dept.id));
        await logAudit(dept.id, interaction.guildId!, interaction.user.id, "budget_add", `Agregó ${formatCurrency(add)} al presupuesto`, add);
        await interaction.reply({ embeds: [successEmbed("Presupuesto Actualizado", `Se agregaron **${formatCurrency(add)}** al presupuesto de **${dept.name}**.`)] });
      } else {
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(Colors.Department)
            .setTitle(`💰 Presupuesto de ${dept.name}`)
            .addFields({ name: "Presupuesto Actual", value: formatCurrency(dept.budget) })
            .setTimestamp()],
        });
      }
    }
  },
};

async function findDepartment(guildId: string, nameOrAcronym: string) {
  const depts = await db.select().from(departmentsTable)
    .where(and(eq(departmentsTable.guildId, guildId), eq(departmentsTable.isActive, true)));
  return depts.find((d) =>
    d.name.toLowerCase() === nameOrAcronym.toLowerCase() ||
    d.acronym.toLowerCase() === nameOrAcronym.toLowerCase()
  ) ?? null;
}

async function logAudit(departmentId: string, guildId: string, performedBy: string, action: string, details?: string, amount?: number) {
  await db.insert(departmentAuditsTable).values({
    id: generateId(),
    departmentId,
    guildId,
    performedBy,
    action,
    details: details ?? null,
    amount: amount ?? null,
  });
}

export default command;
