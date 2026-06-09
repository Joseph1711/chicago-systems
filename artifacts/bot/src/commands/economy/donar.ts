import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { departmentsTable, companiesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { formatCurrency, getOrCreateUser } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { removeCash, logTransaction } from "../../services/economyService.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("donar")
    .setDescription("Donar dinero a un jugador, departamento o empresa")
    .addSubcommand((s) =>
      s.setName("jugador").setDescription("Donar dinero a otro jugador")
        .addUserOption((o) => o.setName("usuario").setDescription("Jugador a quien donar").setRequired(true))
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad a donar").setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName("mensaje").setDescription("Mensaje opcional").setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName("departamento").setDescription("Donar dinero al presupuesto de un departamento")
        .addStringOption((o) => o.setName("nombre").setDescription("Siglas del departamento (ej. CPD)").setRequired(true))
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad a donar").setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName("mensaje").setDescription("Mensaje opcional").setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName("empresa").setDescription("Donar dinero a los fondos de una empresa")
        .addStringOption((o) => o.setName("nombre").setDescription("Nombre de la empresa").setRequired(true))
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad a donar").setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName("mensaje").setDescription("Mensaje opcional").setRequired(false))
    ),
  cooldown: 10,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const amount = interaction.options.getInteger("cantidad", true);
    const mensaje = interaction.options.getString("mensaje");
    const guildId = interaction.guildId!;

    const donor = await getOrCreateUser(interaction.user.id, guildId, interaction.user.username);

    if (donor.cash < amount) {
      await interaction.reply({
        embeds: [errorEmbed("Fondos Insuficientes", `No tienes **${formatCurrency(amount)}** en efectivo para donar.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "jugador") {
      const target = interaction.options.getUser("usuario", true);

      if (target.id === interaction.user.id) {
        await interaction.reply({ embeds: [errorEmbed("Inválido", "No puedes donarte dinero a ti mismo.")], flags: MessageFlags.Ephemeral });
        return;
      }
      if (target.bot) {
        await interaction.reply({ embeds: [errorEmbed("Inválido", "No puedes donarle a un bot.")], flags: MessageFlags.Ephemeral });
        return;
      }

      await getOrCreateUser(target.id, guildId, target.username);
      await removeCash(interaction.user.id, guildId, amount);
      await db.execute(
        sql`UPDATE users SET cash = cash + ${amount} WHERE discord_id = ${target.id} AND guild_id = ${guildId}`
      );
      await logTransaction(guildId, interaction.user.id, target.id, amount, "transfer", `Donación${mensaje ? `: ${mensaje}` : ""}`);

      const embed = new EmbedBuilder()
        .setColor(Colors.Success)
        .setTitle("💝 Donación Enviada")
        .setDescription(`Donaste **${formatCurrency(amount)}** a ${target}.`)
        .setTimestamp();
      if (mensaje) embed.addFields({ name: "💬 Mensaje", value: mensaje });

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "departamento") {
      const acronym = interaction.options.getString("nombre", true);

      const [dept] = await db.select().from(departmentsTable)
        .where(and(eq(departmentsTable.guildId, guildId), eq(departmentsTable.isActive, true)))
        .then((d) => d.filter((x) => x.acronym.toLowerCase() === acronym.toLowerCase()));

      if (!dept) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Departamento **${acronym}** no encontrado.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      await removeCash(interaction.user.id, guildId, amount);
      await db.update(departmentsTable)
        .set({ budget: sql`${departmentsTable.budget} + ${amount}` })
        .where(eq(departmentsTable.id, dept.id));
      await logTransaction(guildId, interaction.user.id, null, amount, "transfer", `Donación a ${dept.name}${mensaje ? `: ${mensaje}` : ""}`);

      const embed = new EmbedBuilder()
        .setColor(Colors.Success)
        .setTitle("💝 Donación al Departamento")
        .setDescription(`Donaste **${formatCurrency(amount)}** al presupuesto de **${dept.emoji} ${dept.name}**.`)
        .setTimestamp();
      if (mensaje) embed.addFields({ name: "💬 Mensaje", value: mensaje });

      await interaction.reply({ embeds: [embed] });

    } else if (sub === "empresa") {
      const nombre = interaction.options.getString("nombre", true);

      const [company] = await db.select().from(companiesTable)
        .where(and(eq(companiesTable.guildId, guildId), eq(companiesTable.isActive, true)))
        .then((c) => c.filter((x) => x.name.toLowerCase().includes(nombre.toLowerCase())));

      if (!company) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Empresa **${nombre}** no encontrada.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      await removeCash(interaction.user.id, guildId, amount);
      await db.update(companiesTable)
        .set({ funds: sql`${companiesTable.funds} + ${amount}` })
        .where(eq(companiesTable.id, company.id));
      await logTransaction(guildId, interaction.user.id, null, amount, "transfer", `Donación a ${company.name}${mensaje ? `: ${mensaje}` : ""}`);

      const embed = new EmbedBuilder()
        .setColor(Colors.Success)
        .setTitle("💝 Donación a Empresa")
        .setDescription(`Donaste **${formatCurrency(amount)}** a los fondos de **🏢 ${company.name}**.`)
        .setTimestamp();
      if (mensaje) embed.addFields({ name: "💬 Mensaje", value: mensaje });

      await interaction.reply({ embeds: [embed] });
    }
  },
};

export default command;
