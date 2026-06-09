import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { fleetTypesTable, fleetVehiclesTable, departmentsTable, departmentAuditsTable, vehicleDamageReportsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { generateId, formatCurrency } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";

const DAMAGE_LEVELS: Record<string, { label: string; emoji: string; totalLossChance: number; days: [number, number] }> = {
  minor:    { label: "Menor",    emoji: "🟡", totalLossChance: 0,    days: [2, 2] },
  moderate: { label: "Moderado", emoji: "🟠", totalLossChance: 0.10, days: [2, 3] },
  severe:   { label: "Grave",    emoji: "🔴", totalLossChance: 0.35, days: [3, 3] },
  critical: { label: "Crítico",  emoji: "💀", totalLossChance: 0.60, days: [3, 3] },
};

const STATUS_LABEL: Record<string, string> = {
  repairing:  "🔧 En Reparación",
  returned:   "✅ Devuelto a Flota",
  total_loss: "💥 Pérdida Total",
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("flota")
    .setDescription("Gestión de flota vehicular")
    .addSubcommand((s) =>
      s.setName("ver").setDescription("Ver la flota de un departamento")
        .addStringOption((o) => o.setName("departamento").setDescription("Siglas del departamento").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("comprar").setDescription("Adquirir vehículos para un departamento")
        .addStringOption((o) => o.setName("departamento").setDescription("Siglas del departamento").setRequired(true))
        .addStringOption((o) => o.setName("marca").setDescription("Marca del vehículo (ej. Ford)").setRequired(true))
        .addStringOption((o) => o.setName("modelo").setDescription("Modelo del vehículo (ej. Explorer)").setRequired(true))
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Número de vehículos").setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName("costo_unitario").setDescription("Costo por vehículo").setRequired(true).setMinValue(1))
        .addStringOption((o) =>
          o.setName("categoria")
            .setDescription("Categoría de la flota")
            .setRequired(false)
            .addChoices(
              { name: "Patrulla", value: "patrol" },
              { name: "EMS", value: "ems" },
              { name: "Administrativa", value: "administrative" },
              { name: "Transporte", value: "transport" },
              { name: "Táctica", value: "tactical" },
              { name: "Especial", value: "special" }
            )
        )
    )
    .addSubcommand((s) =>
      s.setName("daño").setDescription("Reportar daño a una unidad de la flota")
        .addStringOption((o) => o.setName("departamento").setDescription("Siglas del departamento").setRequired(true))
        .addStringOption((o) => o.setName("marca").setDescription("Marca del vehículo dañado").setRequired(true))
        .addStringOption((o) => o.setName("modelo").setDescription("Modelo del vehículo dañado").setRequired(true))
        .addStringOption((o) =>
          o.setName("nivel").setDescription("Nivel de daño").setRequired(true)
            .addChoices(
              { name: "🟡 Menor — Rasguños / leves", value: "minor" },
              { name: "🟠 Moderado — Impacto / reparable", value: "moderate" },
              { name: "🔴 Grave — Daño estructural", value: "severe" },
              { name: "💀 Crítico — Incendio / volcadura", value: "critical" },
            )
        )
        .addIntegerOption((o) => o.setName("unidades").setDescription("Número de unidades dañadas").setRequired(false).setMinValue(1))
        .addStringOption((o) => o.setName("descripcion").setDescription("Descripción del incidente").setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName("reparaciones").setDescription("Ver reportes de daño y estado de reparaciones")
        .addStringOption((o) => o.setName("departamento").setDescription("Siglas del departamento").setRequired(true))
    ),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const deptAcronym = interaction.options.getString("departamento", true);

    const [dept] = await db.select().from(departmentsTable)
      .where(and(eq(departmentsTable.guildId, interaction.guildId!), eq(departmentsTable.isActive, true)))
      .then((d) => d.filter((x) => x.acronym.toLowerCase() === deptAcronym.toLowerCase()));

    if (!dept) {
      await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Departamento **${deptAcronym}** no encontrado.`)], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "ver") {
      const vehicles = await db.select().from(fleetVehiclesTable)
        .where(eq(fleetVehiclesTable.departmentId, dept.id));

      if (vehicles.length === 0) {
        await interaction.reply({
          embeds: [errorEmbed("Sin Flota", `**${dept.name}** no tiene vehículos. Usa \`/flota comprar\` para adquirir.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const activeRepairs = await db.select().from(vehicleDamageReportsTable)
        .where(and(
          eq(vehicleDamageReportsTable.departmentId, dept.id),
          eq(vehicleDamageReportsTable.status, "repairing")
        ));

      const repairedUnits = activeRepairs.reduce((acc, r) => {
        acc[r.fleetVehicleId] = (acc[r.fleetVehicleId] ?? 0) + r.units;
        return acc;
      }, {} as Record<string, number>);

      type VehicleRow = (typeof vehicles)[number];
      const grouped = vehicles.reduce((acc, v) => {
        const cat = v.fleetTypeId;
        if (!acc[cat]) acc[cat] = [];
        acc[cat]!.push(v);
        return acc;
      }, {} as Record<string, VehicleRow[]>);

      const embed = new EmbedBuilder()
        .setColor(Colors.Department)
        .setTitle(`🚔 Flota de ${dept.name}`)
        .setTimestamp();

      for (const group of Object.values(grouped) as VehicleRow[][]) {
        const first = group[0]!;
        const totalCost = group.reduce((s: number, v: VehicleRow) => s + v.unitCost * v.quantity, 0);
        embed.addFields({
          name: `${first.make} Flota`,
          value: group.map((v: VehicleRow) => {
            const damaged = repairedUnits[v.id] ?? 0;
            const available = v.quantity - damaged;
            const dmgNote = damaged > 0 ? ` *(${damaged} en reparación — ${available} disponibles)*` : "";
            return `${v.quantity}x ${v.make} ${v.model} — ${formatCurrency(v.unitCost)}/u${dmgNote}`;
          }).join("\n") +
            `\n💰 Total: ${formatCurrency(totalCost)}`,
        });
      }

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "comprar") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ embeds: [errorEmbed("Sin Permiso", "Necesitas el permiso de Gestionar Roles.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const make = interaction.options.getString("marca", true);
      const model = interaction.options.getString("modelo", true);
      const quantity = interaction.options.getInteger("cantidad", true);
      const unitCost = interaction.options.getInteger("costo_unitario", true);
      const category = interaction.options.getString("categoria") ?? "patrol";
      const totalCost = quantity * unitCost;

      if (dept.budget < totalCost) {
        await interaction.reply({
          embeds: [errorEmbed("Presupuesto Insuficiente", `${dept.name} necesita **${formatCurrency(totalCost)}** pero solo tiene **${formatCurrency(dept.budget)}**.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      let [fleetType] = await db.select().from(fleetTypesTable)
        .where(and(eq(fleetTypesTable.departmentId, dept.id), eq(fleetTypesTable.category, category)));

      if (!fleetType) {
        [fleetType] = await db.insert(fleetTypesTable).values({
          id: generateId(),
          guildId: interaction.guildId!,
          departmentId: dept.id,
          name: `${dept.acronym} ${category.charAt(0).toUpperCase() + category.slice(1)} Flota`,
          category,
        }).returning();
      }

      await db.insert(fleetVehiclesTable).values({
        id: generateId(),
        guildId: interaction.guildId!,
        fleetTypeId: fleetType!.id,
        departmentId: dept.id,
        make,
        model,
        quantity,
        unitCost,
        isSpecial: category === "special",
        purchasedBy: interaction.user.id,
      });

      await db.update(departmentsTable)
        .set({ budget: sql`${departmentsTable.budget} - ${totalCost}` })
        .where(eq(departmentsTable.id, dept.id));

      await db.insert(departmentAuditsTable).values({
        id: generateId(),
        departmentId: dept.id,
        guildId: interaction.guildId!,
        performedBy: interaction.user.id,
        action: "fleet_purchase",
        details: `Compró ${quantity}x ${make} ${model} (${category})`,
        amount: totalCost,
      });

      await interaction.reply({
        embeds: [successEmbed("Flota Adquirida",
          `✅ **${dept.name}** adquirió:\n**${quantity}x ${make} ${model}**\n\n💰 Costo: **${formatCurrency(totalCost)}**\n📊 Presupuesto Restante: **${formatCurrency(dept.budget - totalCost)}**`)],
      });

    } else if (sub === "daño") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ embeds: [errorEmbed("Sin Permiso", "Necesitas el permiso de Gestionar Roles para reportar daños.")], flags: MessageFlags.Ephemeral });
        return;
      }

      const make = interaction.options.getString("marca", true);
      const model = interaction.options.getString("modelo", true);
      const level = interaction.options.getString("nivel", true);
      const units = interaction.options.getInteger("unidades") ?? 1;
      const description = interaction.options.getString("descripcion");

      const [vehicle] = await db.select().from(fleetVehiclesTable)
        .where(and(
          eq(fleetVehiclesTable.departmentId, dept.id),
          eq(fleetVehiclesTable.make, make),
          eq(fleetVehiclesTable.model, model),
        ));

      if (!vehicle) {
        await interaction.reply({ embeds: [errorEmbed("Vehículo No Encontrado", `No se encontró **${make} ${model}** en la flota de **${dept.name}**.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      if (units > vehicle.quantity) {
        await interaction.reply({ embeds: [errorEmbed("Cantidad Inválida", `La flota solo tiene **${vehicle.quantity}** unidades de ${make} ${model}.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      const dmgInfo = DAMAGE_LEVELS[level]!;
      const roll = Math.random();
      const isTotal = roll < dmgInfo.totalLossChance;

      let status: string;
      let repairDays: number | null = null;
      let repairCompletesAt: Date | null = null;
      let compensation: number | null = null;
      let resultText: string;

      if (isTotal) {
        status = "total_loss";
        compensation = Math.floor(vehicle.unitCost * 0.75) * units;

        await db.update(fleetVehiclesTable)
          .set({ quantity: sql`${fleetVehiclesTable.quantity} - ${units}` })
          .where(eq(fleetVehiclesTable.id, vehicle.id));

        await db.update(departmentsTable)
          .set({ budget: sql`${departmentsTable.budget} + ${compensation}` })
          .where(eq(departmentsTable.id, dept.id));

        resultText =
          `💥 **PÉRDIDA TOTAL** — ${units}x ${make} ${model}\n\n` +
          `Las unidades no pudieron recuperarse.\n` +
          `Se eliminaron **${units} unidad(es)** de la flota.\n` +
          `💰 El departamento recibió **${formatCurrency(compensation)}** de compensación.`;
      } else {
        const [minDays, maxDays] = dmgInfo.days;
        repairDays = minDays === maxDays ? minDays : (Math.random() < 0.5 ? minDays : maxDays);
        repairCompletesAt = new Date(Date.now() + repairDays * 24 * 60 * 60 * 1000);
        status = "repairing";

        const finishDate = repairCompletesAt.toLocaleDateString("es-MX", { weekday: "long", month: "long", day: "numeric" });
        resultText =
          `🔧 **SE PUEDE REPARAR** — ${units}x ${make} ${model}\n\n` +
          `Daño: **${dmgInfo.emoji} ${dmgInfo.label}**\n` +
          `Tiempo de reparación: **${repairDays} día(s)**\n` +
          `Listo el: **${finishDate}**\n\n` +
          `Las unidades serán devueltas a la flota automáticamente.`;
      }

      await db.insert(vehicleDamageReportsTable).values({
        id: generateId(),
        guildId: interaction.guildId!,
        departmentId: dept.id,
        fleetVehicleId: vehicle.id,
        make,
        model,
        units,
        damageLevel: level,
        description: description ?? null,
        isTotal,
        repairDays,
        repairCompletesAt,
        compensation,
        status,
        reportedBy: interaction.user.id,
      });

      await db.insert(departmentAuditsTable).values({
        id: generateId(),
        departmentId: dept.id,
        guildId: interaction.guildId!,
        performedBy: interaction.user.id,
        action: "vehicle_damage",
        details: `${make} ${model} x${units} — Daño ${dmgInfo.label} — ${isTotal ? "Pérdida total" : `Reparación ${repairDays}d`}`,
        amount: compensation ?? 0,
      });

      const embed = new EmbedBuilder()
        .setColor(isTotal ? Colors.Error : Colors.Warning ?? "#FFA500")
        .setTitle(`${dmgInfo.emoji} Reporte de Daño — ${dept.name}`)
        .setDescription(resultText)
        .setFooter({ text: `Reportado por ${interaction.user.tag}` })
        .setTimestamp();

      if (description) embed.addFields({ name: "Descripción del incidente", value: description });

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "reparaciones") {
      const reports = await db.select().from(vehicleDamageReportsTable)
        .where(and(
          eq(vehicleDamageReportsTable.departmentId, dept.id),
          eq(vehicleDamageReportsTable.guildId, interaction.guildId!),
        ))
        .orderBy(vehicleDamageReportsTable.createdAt);

      if (reports.length === 0) {
        await interaction.reply({ embeds: [successEmbed("Sin Reportes", `**${dept.name}** no tiene reportes de daño.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      const active = reports.filter((r) => r.status === "repairing");
      const history = reports.filter((r) => r.status !== "repairing").slice(-5);

      const embed = new EmbedBuilder()
        .setColor(Colors.Department)
        .setTitle(`🔧 Reparaciones — ${dept.name}`)
        .setTimestamp();

      if (active.length > 0) {
        const activeLines = active.map((r) => {
          const dmg = DAMAGE_LEVELS[r.damageLevel];
          const readyDate = r.repairCompletesAt
            ? r.repairCompletesAt.toLocaleDateString("es-MX", { weekday: "short", month: "short", day: "numeric" })
            : "—";
          return `${dmg?.emoji ?? "🔧"} **${r.units}x ${r.make} ${r.model}** (${dmg?.label ?? r.damageLevel}) — Listo: **${readyDate}**`;
        });
        embed.addFields({ name: `🔧 En Reparación (${active.length})`, value: activeLines.join("\n") });
      } else {
        embed.addFields({ name: "🔧 En Reparación", value: "Ninguna unidad en reparación actualmente." });
      }

      if (history.length > 0) {
        const histLines = history.map((r) => {
          const dmg = DAMAGE_LEVELS[r.damageLevel];
          const date = r.createdAt.toLocaleDateString("es-MX", { month: "short", day: "numeric" });
          return `${STATUS_LABEL[r.status] ?? r.status} — ${r.units}x ${r.make} ${r.model} (${dmg?.emoji ?? ""} ${dmg?.label ?? r.damageLevel}) — ${date}`;
        });
        embed.addFields({ name: "📋 Historial Reciente", value: histLines.join("\n") });
      }

      await interaction.reply({ embeds: [embed] });
    }
  },
};

export default command;
