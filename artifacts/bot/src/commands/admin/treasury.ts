import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { treasuryTable, departmentsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateId, formatCurrency } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { addCash, logTransaction } from "../../services/economyService.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("tesoro")
    .setDescription("Gestión del tesoro público")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("ver").setDescription("Ver el saldo del tesoro"))
    .addSubcommand((s) => s.setName("agregar").setDescription("Agregar fondos al tesoro").addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1)))
    .addSubcommand((s) =>
      s.setName("financiar-dpto").setDescription("Financiar un departamento desde el tesoro")
        .addStringOption((o) => o.setName("departamento").setDescription("Siglas del departamento").setRequired(true))
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1))
    )
    .addSubcommand((s) =>
      s.setName("otorgar").setDescription("Otorgar fondos a un usuario")
        .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true))
        .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName("razon").setDescription("Motivo").setRequired(true))
    ),
  cooldown: 3,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    let [treasury] = await db.select().from(treasuryTable).where(eq(treasuryTable.guildId, guildId)).limit(1);
    if (!treasury) {
      [treasury] = await db.insert(treasuryTable).values({ id: generateId(), guildId, balance: 0 }).returning();
    }

    if (sub === "ver") {
      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle("🏛️ Tesoro Público")
        .addFields({ name: "Saldo Actual", value: formatCurrency(treasury.balance) })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });

    } else if (sub === "agregar") {
      const amount = interaction.options.getInteger("cantidad", true);
      await db.update(treasuryTable).set({ balance: sql`${treasuryTable.balance} + ${amount}` }).where(eq(treasuryTable.guildId, guildId));
      await interaction.reply({ embeds: [successEmbed("Tesoro Financiado", `Se agregaron **${formatCurrency(amount)}** al tesoro. Nuevo saldo: **${formatCurrency(treasury.balance + amount)}**.`)] });

    } else if (sub === "financiar-dpto") {
      const deptAcronym = interaction.options.getString("departamento", true);
      const amount = interaction.options.getInteger("cantidad", true);

      const depts = await db.select().from(departmentsTable).where(eq(departmentsTable.guildId, guildId));
      const dept = depts.find((d) => d.acronym.toLowerCase() === deptAcronym.toLowerCase());

      if (!dept) {
        await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Departamento **${deptAcronym}** no encontrado.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      if (treasury.balance < amount) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `El tesoro solo tiene **${formatCurrency(treasury.balance)}**.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      await db.update(treasuryTable).set({ balance: sql`${treasuryTable.balance} - ${amount}` }).where(eq(treasuryTable.guildId, guildId));
      await db.update(departmentsTable).set({ budget: sql`${departmentsTable.budget} + ${amount}` }).where(eq(departmentsTable.id, dept.id));

      await interaction.reply({ embeds: [successEmbed("Departamento Financiado", `Transferidos **${formatCurrency(amount)}** del tesoro a **${dept.name}**.`)] });

    } else if (sub === "otorgar") {
      const target = interaction.options.getUser("usuario", true);
      const amount = interaction.options.getInteger("cantidad", true);
      const reason = interaction.options.getString("razon", true);

      if (treasury.balance < amount) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `El tesoro solo tiene **${formatCurrency(treasury.balance)}**.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      await db.update(treasuryTable).set({ balance: sql`${treasuryTable.balance} - ${amount}` }).where(eq(treasuryTable.guildId, guildId));
      await addCash(target.id, guildId, amount);
      await logTransaction(guildId, null, target.id, amount, "treasury_grant", reason);

      await interaction.reply({ embeds: [successEmbed("Subsidio Otorgado", `Se otorgaron **${formatCurrency(amount)}** a ${target}.\nMotivo: ${reason}`)] });
    }
  },
};

export default command;
