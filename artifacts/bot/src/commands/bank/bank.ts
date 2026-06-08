import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { Command } from "../../types/index.js";
import { getOrCreateUser, formatCurrency } from "../../utils/helpers.js";
import { addCash, removeBank, addBank, removeCash, logTransaction } from "../../services/economyService.js";
import { db } from "@workspace/db";
import { savingsAccountsTable, loansTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { generateId } from "../../utils/helpers.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("banco")
    .setDescription("Operaciones bancarias")
    .addSubcommand((s) => s.setName("depositar").setDescription("Depositar efectivo al banco").addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName("retirar").setDescription("Retirar del banco").addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName("info").setDescription("Ver resumen bancario completo"))
    .addSubcommand((s) => s.setName("ahorros").setDescription("Ver o abrir una cuenta de ahorros"))
    .addSubcommand((s) => s.setName("prestamo").setDescription("Solicitar un préstamo").addIntegerOption((o) => o.setName("cantidad").setDescription("Monto del préstamo").setRequired(true).setMinValue(100).setMaxValue(50000)))
    .addSubcommand((s) => s.setName("pagar").setDescription("Pagar tu préstamo").addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad a pagar").setRequired(true).setMinValue(1))),
  cooldown: 3,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const user = await getOrCreateUser(interaction.user.id, interaction.guildId!, interaction.user.username);

    if (sub === "depositar") {
      const amount = interaction.options.getInteger("cantidad", true);
      if (user.cash < amount) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `Solo tienes **${formatCurrency(user.cash)}** en efectivo.`)], ephemeral: true });
        return;
      }
      await removeCash(interaction.user.id, interaction.guildId!, amount);
      await addBank(interaction.user.id, interaction.guildId!, amount);
      await logTransaction(interaction.guildId!, null, interaction.user.id, amount, "deposit", "Depósito bancario");
      await interaction.reply({ embeds: [successEmbed("Depósito Exitoso", `Depositaste **${formatCurrency(amount)}** en tu cuenta bancaria. 🏦`)] });

    } else if (sub === "retirar") {
      const amount = interaction.options.getInteger("cantidad", true);
      const success = await removeBank(interaction.user.id, interaction.guildId!, amount);
      if (!success) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `Solo tienes **${formatCurrency(user.bank)}** en el banco.`)], ephemeral: true });
        return;
      }
      await addCash(interaction.user.id, interaction.guildId!, amount);
      await logTransaction(interaction.guildId!, interaction.user.id, null, amount, "withdraw", "Retiro bancario");
      await interaction.reply({ embeds: [successEmbed("Retiro Exitoso", `Retiraste **${formatCurrency(amount)}** del banco. 💵`)] });

    } else if (sub === "info") {
      const savings = await db.select().from(savingsAccountsTable)
        .where(and(eq(savingsAccountsTable.userId, interaction.user.id), eq(savingsAccountsTable.guildId, interaction.guildId!)))
        .limit(1);
      const loans = await db.select().from(loansTable)
        .where(and(eq(loansTable.userId, interaction.user.id), eq(loansTable.guildId, interaction.guildId!), eq(loansTable.status, "active")));

      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle(`🏦 Resumen Bancario — ${interaction.user.displayName}`)
        .addFields(
          { name: "💵 Efectivo en Mano", value: formatCurrency(user.cash), inline: true },
          { name: "🏦 Cuenta Corriente", value: formatCurrency(user.bank), inline: true },
          { name: "💰 Ahorros", value: savings[0] ? formatCurrency(savings[0].balance) : "Sin cuenta", inline: true },
          { name: "📋 Préstamos Activos", value: loans.length > 0 ? loans.map((l) => formatCurrency(l.balance)).join(", ") : "Ninguno", inline: false }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });

    } else if (sub === "ahorros") {
      let [account] = await db.select().from(savingsAccountsTable)
        .where(and(eq(savingsAccountsTable.userId, interaction.user.id), eq(savingsAccountsTable.guildId, interaction.guildId!)));

      if (!account) {
        [account] = await db.insert(savingsAccountsTable).values({
          id: generateId(),
          userId: interaction.user.id,
          guildId: interaction.guildId!,
          balance: 0,
          interestRate: 2,
        }).returning();
        await interaction.reply({ embeds: [successEmbed("Cuenta de Ahorros", `Abriste una cuenta de ahorros con **2% de interés diario**. ¡Deposita dinero para empezar a ganar!`)] });
      } else {
        const embed = new EmbedBuilder()
          .setColor(Colors.Economy)
          .setTitle("💰 Cuenta de Ahorros")
          .addFields(
            { name: "Saldo", value: formatCurrency(account.balance), inline: true },
            { name: "Tasa de Interés", value: `${account.interestRate}% diario`, inline: true }
          )
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
      }

    } else if (sub === "prestamo") {
      const amount = interaction.options.getInteger("cantidad", true);
      const existingLoans = await db.select().from(loansTable)
        .where(and(eq(loansTable.userId, interaction.user.id), eq(loansTable.guildId, interaction.guildId!), eq(loansTable.status, "active")));

      if (existingLoans.length >= 3) {
        await interaction.reply({ embeds: [errorEmbed("Límite de Préstamos", "Ya tienes 3 préstamos activos. Paga uno antes de solicitar otro.")], ephemeral: true });
        return;
      }

      const totalDebt = existingLoans.reduce((s, l) => s + l.balance, 0);
      if (totalDebt > 100000) {
        await interaction.reply({ embeds: [errorEmbed("Límite de Deuda", "Tu deuda total es demasiado alta.")], ephemeral: true });
        return;
      }

      const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(loansTable).values({
        id: generateId(),
        userId: interaction.user.id,
        guildId: interaction.guildId!,
        principal: amount,
        balance: amount,
        interestRate: 10,
        status: "active",
        dueAt,
      });
      await addCash(interaction.user.id, interaction.guildId!, amount);
      await logTransaction(interaction.guildId!, null, interaction.user.id, amount, "loan", "Préstamo bancario");
      await interaction.reply({ embeds: [successEmbed("Préstamo Aprobado", `Recibiste un préstamo de **${formatCurrency(amount)}**. Vence en 7 días. Interés: 10%.`)] });

    } else if (sub === "pagar") {
      const amount = interaction.options.getInteger("cantidad", true);
      const [loan] = await db.select().from(loansTable)
        .where(and(eq(loansTable.userId, interaction.user.id), eq(loansTable.guildId, interaction.guildId!), eq(loansTable.status, "active")))
        .limit(1);

      if (!loan) {
        await interaction.reply({ embeds: [errorEmbed("Sin Préstamo", "No tienes préstamos activos.")], ephemeral: true });
        return;
      }
      if (user.cash < amount) {
        await interaction.reply({ embeds: [errorEmbed("Fondos Insuficientes", `Solo tienes **${formatCurrency(user.cash)}** en efectivo.`)], ephemeral: true });
        return;
      }
      const repay = Math.min(amount, loan.balance);
      await removeCash(interaction.user.id, interaction.guildId!, repay);
      const newBalance = loan.balance - repay;
      await db.update(loansTable).set({ balance: newBalance, status: newBalance <= 0 ? "paid" : "active" }).where(eq(loansTable.id, loan.id));
      await logTransaction(interaction.guildId!, interaction.user.id, null, repay, "loan_repayment");
      await interaction.reply({ embeds: [successEmbed("Préstamo Pagado", `Pagaste **${formatCurrency(repay)}**. Restante: **${formatCurrency(Math.max(0, newBalance))}**.`)] });
    }
  },
};

export default command;
