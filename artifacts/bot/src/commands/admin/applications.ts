import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { applicationsTable, applicationConfigTable, departmentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { registerButton, registerModal } from "../../handlers/interactionHandler.js";

const APP_QUESTIONS: Record<string, string[]> = {
  cpd: ["¿Por qué quieres unirte al CPD?", "¿Tienes experiencia previa en RP de aplicación de la ley?", "¿Cuál es tu zona horaria?"],
  cfd: ["¿Por qué quieres unirte al CFD?", "Describe tu experiencia en RP de servicios de emergencia.", "¿Cuál es tu zona horaria?"],
  sheriff: ["¿Por qué quieres unirte a la Oficina del Sheriff?", "¿Has estado en algún departamento de aplicación de la ley?", "¿Cuál es tu zona horaria?"],
  dot: ["¿Por qué quieres unirte al DOT?", "¿Tienes experiencia en RP de infraestructura?", "¿Cuál es tu zona horaria?"],
  staff: ["¿Por qué quieres ser staff?", "¿Qué experiencia tienes en administración de servidores?", "¿Cuántas horas a la semana puedes dedicar?"],
};

for (const type of Object.keys(APP_QUESTIONS)) {
  registerButton(`apply_${type}`, async (interaction) => {
    const questions = APP_QUESTIONS[type]!;
    const modal = new ModalBuilder()
      .setCustomId(`app_modal_${type}`)
      .setTitle(`Solicitud ${type.toUpperCase()}`);

    modal.addComponents(
      ...questions.slice(0, 5).map((q, i) =>
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId(`q${i}`).setLabel(q.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      )
    );

    await interaction.showModal(modal);
  });

  registerModal(`app_modal_${type}`, async (interaction) => {
    const guildId = interaction.guildId!;
    const questions = APP_QUESTIONS[type]!;

    const answers: Record<string, string> = {};
    for (let i = 0; i < questions.length; i++) {
      answers[`q${i}`] = interaction.fields.getTextInputValue(`q${i}`);
    }

    const existingPending = await db.select().from(applicationsTable)
      .where(and(eq(applicationsTable.guildId, guildId), eq(applicationsTable.userId, interaction.user.id), eq(applicationsTable.type, type), eq(applicationsTable.status, "pending")));

    if (existingPending.length > 0) {
      await interaction.reply({ embeds: [errorEmbed("Ya Aplicaste", `Ya tienes una solicitud pendiente para ${type.toUpperCase()}.`)], ephemeral: true });
      return;
    }

    const appId = generateId();
    await db.insert(applicationsTable).values({
      id: appId,
      guildId,
      userId: interaction.user.id,
      type,
      answers: JSON.stringify(answers),
      status: "pending",
    });

    const [config] = await db.select().from(applicationConfigTable)
      .where(and(eq(applicationConfigTable.guildId, guildId), eq(applicationConfigTable.type, type))).limit(1);

    if (config?.reviewChannelId) {
      const reviewChannel = interaction.guild?.channels.cache.get(config.reviewChannelId) as any;
      if (reviewChannel) {
        const embed = new EmbedBuilder()
          .setColor(Colors.Warning)
          .setTitle(`📋 Nueva Solicitud ${type.toUpperCase()}`)
          .setDescription(`<@${interaction.user.id}> envió una solicitud.\nID: \`${appId.slice(0, 8)}\``)
          .addFields(...Object.entries(answers).map(([k, v], i) => ({ name: questions[i] ?? k, value: v.slice(0, 200) })))
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`app_approve:${appId}`).setLabel("Aprobar").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`app_deny:${appId}`).setLabel("Rechazar").setStyle(ButtonStyle.Danger),
        );

        const msg = await reviewChannel.send({ embeds: [embed], components: [row] }).catch(() => null);
        if (msg) await db.update(applicationsTable).set({ messageId: msg.id }).where(eq(applicationsTable.id, appId));
      }
    }

    await interaction.reply({ embeds: [successEmbed("Solicitud Enviada", `¡Tu solicitud para **${type.toUpperCase()}** ha sido enviada y está en revisión!`)], ephemeral: true });
  });
}

registerButton("app_approve", async (interaction) => {
  const appId = interaction.customId.split(":")[1]!;
  const [app] = await db.select().from(applicationsTable).where(eq(applicationsTable.id, appId)).limit(1);
  if (!app) {
    await interaction.reply({ embeds: [errorEmbed("No Encontrado", "Solicitud no encontrada.")], ephemeral: true });
    return;
  }
  await db.update(applicationsTable).set({ status: "approved", reviewedBy: interaction.user.id, reviewedAt: new Date() }).where(eq(applicationsTable.id, appId));
  await interaction.update({ embeds: [new EmbedBuilder().setColor(Colors.Success).setTitle(`✅ Solicitud Aprobada`).setDescription(`Aprobada por <@${interaction.user.id}>`).setTimestamp()], components: [] });
  const user = interaction.guild?.members.cache.get(app.userId);
  if (user) {
    await user.send({ embeds: [successEmbed("Solicitud Aprobada", `¡Tu solicitud para **${app.type.toUpperCase()}** fue aprobada! ¡Bienvenido al equipo!`)] }).catch(() => null);
  }
});

registerButton("app_deny", async (interaction) => {
  const appId = interaction.customId.split(":")[1]!;
  const [app] = await db.select().from(applicationsTable).where(eq(applicationsTable.id, appId)).limit(1);
  if (!app) {
    await interaction.reply({ embeds: [errorEmbed("No Encontrado", "Solicitud no encontrada.")], ephemeral: true });
    return;
  }
  await db.update(applicationsTable).set({ status: "denied", reviewedBy: interaction.user.id, reviewedAt: new Date() }).where(eq(applicationsTable.id, appId));
  await interaction.update({ embeds: [new EmbedBuilder().setColor(Colors.Error).setTitle(`❌ Solicitud Rechazada`).setDescription(`Rechazada por <@${interaction.user.id}>`).setTimestamp()], components: [] });
  const user = interaction.guild?.members.cache.get(app.userId);
  if (user) {
    await user.send({ embeds: [errorEmbed("Solicitud Rechazada", `Tu solicitud para **${app.type.toUpperCase()}** no fue aprobada esta vez. Puedes volver a aplicar después de 7 días.`)] }).catch(() => null);
  }
});

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("solicitar")
    .setDescription("Enviar una solicitud a un departamento")
    .addStringOption((o) =>
      o.setName("tipo").setDescription("Tipo de solicitud").setRequired(true)
        .addChoices(
          { name: "CPD", value: "cpd" },
          { name: "CFD", value: "cfd" },
          { name: "Oficina del Sheriff", value: "sheriff" },
          { name: "DOT", value: "dot" },
          { name: "Staff", value: "staff" }
        )
    ),
  cooldown: 30,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const type = interaction.options.getString("tipo", true);

    const embed = new EmbedBuilder()
      .setColor(Colors.Primary)
      .setTitle(`📋 Solicitud ${type.toUpperCase()}`)
      .setDescription(`Haz clic en el botón de abajo para iniciar tu solicitud para **${type.toUpperCase()}**.\n\nResponde todas las preguntas con honestidad y detalle.`)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`apply_${type}`).setLabel("Iniciar Solicitud").setEmoji("📋").setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};

export default command;
