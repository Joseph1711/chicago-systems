import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { fleetTypesTable, fleetVehiclesTable, departmentsTable, departmentAuditsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateId, formatCurrency } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";

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
    ),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const deptAcronym = interaction.options.getString("departamento", true);

    const [dept] = await db.select().from(departmentsTable)
      .where(and(eq(departmentsTable.guildId, interaction.guildId!), eq(departmentsTable.isActive, true)))
      .then((d) => d.filter((x) => x.acronym.toLowerCase() === deptAcronym.toLowerCase()));

    if (!dept) {
      await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Departamento **${deptAcronym}** no encontrado.`)], ephemeral: true });
      return;
    }

    if (sub === "ver") {
      const vehicles = await db.select().from(fleetVehiclesTable)
        .where(eq(fleetVehiclesTable.departmentId, dept.id));

      if (vehicles.length === 0) {
        await interaction.reply({
          embeds: [errorEmbed("Sin Flota", `**${dept.name}** no tiene vehículos. Usa \`/flota comprar\` para adquirir.`)],
          ephemeral: true,
        });
        return;
      }

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
          value: group.map((v: VehicleRow) => `${v.quantity}x ${v.make} ${v.model} — ${formatCurrency(v.unitCost)}/u`).join("\n") +
            `\n💰 Total: ${formatCurrency(totalCost)}`,
        });
      }

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "comprar") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ embeds: [errorEmbed("Sin Permiso", "Necesitas el permiso de Gestionar Roles.")], ephemeral: true });
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
          ephemeral: true,
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
    }
  },
};

export default command;
