import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import { ticketsTable, ticketConfigTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { registerButton } from "../../handlers/interactionHandler.js";

registerButton("ticket_close", async (interaction) => {
  const channelId = interaction.customId.split(":")[1] ?? interaction.channelId;
  const [ticket] = await db.select().from(ticketsTable)
    .where(and(eq(ticketsTable.channelId, channelId), eq(ticketsTable.status, "open"))).limit(1);

  if (!ticket) {
    await interaction.reply({ embeds: [errorEmbed("Ya Cerrado", "Este ticket ya está cerrado.")], flags: MessageFlags.Ephemeral });
    return;
  }

  await db.update(ticketsTable).set({ status: "closed", closedBy: interaction.user.id, closedAt: new Date() })
    .where(eq(ticketsTable.id, ticket.id));

  await interaction.reply({ embeds: [successEmbed("Ticket Cerrado", `Ticket cerrado por <@${interaction.user.id}>.`)] });
  setTimeout(() => interaction.channel?.delete().catch(() => null), 5000);
});

registerButton("ticket:open", async (interaction) => {
  const guildId = interaction.guildId!;
  const [config] = await db.select().from(ticketConfigTable)
    .where(eq(ticketConfigTable.guildId, guildId)).limit(1);

  if (!config?.categoryId) {
    await interaction.reply({ embeds: [errorEmbed("No Configurado", "Los tickets no están configurados.")], flags: MessageFlags.Ephemeral });
    return;
  }

  const openTickets = await db.select().from(ticketsTable)
    .where(and(eq(ticketsTable.guildId, guildId), eq(ticketsTable.userId, interaction.user.id), eq(ticketsTable.status, "open")));

  if (openTickets.length >= 3) {
    await interaction.reply({ embeds: [errorEmbed("Demasiados Tickets", "Ya tienes 3 tickets abiertos.")], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const allTickets = await db.select().from(ticketsTable).where(eq(ticketsTable.guildId, guildId));
  const ticketNum = allTickets.length + 1;

  const channel = await interaction.guild?.channels.create({
    name: `ticket-${ticketNum.toString().padStart(4, "0")}`,
    type: ChannelType.GuildText,
    parent: config.categoryId,
    permissionOverwrites: [
      { id: interaction.guild!.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...(config.supportRoleId ? [{ id: config.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ],
  }).catch(() => null);

  if (!channel) {
    await interaction.editReply({ embeds: [errorEmbed("Error", "No se pudo crear el canal de ticket.")] });
    return;
  }

  await db.insert(ticketsTable).values({
    id: generateId(),
    guildId,
    userId: interaction.user.id,
    channelId: channel.id,
    category: "general",
    subject: "Abierto desde panel",
    status: "open",
    number: ticketNum,
  });

  const ticketEmbed = new EmbedBuilder()
    .setColor(Colors.Primary)
    .setTitle(`🎫 Ticket #${ticketNum.toString().padStart(4, "0")}`)
    .addFields(
      { name: "Usuario", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Categoría", value: "General", inline: true }
    )
    .setTimestamp();

  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close:${channel.id}`).setLabel("Cerrar Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger),
  );

  const textChannel = channel as TextChannel;
  await textChannel.send({
    content: `${config.supportRoleId ? `<@&${config.supportRoleId}> ` : ""}<@${interaction.user.id}>`,
    embeds: [ticketEmbed],
    components: [closeRow],
  });

  await interaction.editReply({ embeds: [successEmbed("Ticket Creado", `Tu ticket ha sido creado: ${channel}`)] });
});

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Sistema de tickets de soporte")
    .addSubcommand((s) => s.setName("abrir").setDescription("Abrir un ticket de soporte").addStringOption((o) => o.setName("asunto").setDescription("Breve descripción del problema").setRequired(true)).addStringOption((o) => o.setName("categoria").setDescription("Categoría").setRequired(false).addChoices({ name: "General", value: "general" }, { name: "Apelación de Ban", value: "ban_appeal" }, { name: "Reporte", value: "report" }, { name: "Soporte", value: "support" })))
    .addSubcommand((s) => s.setName("cerrar").setDescription("Cerrar el ticket actual").addStringOption((o) => o.setName("razon").setDescription("Motivo del cierre").setRequired(false)))
    .addSubcommand((s) => s.setName("lista").setDescription("Ver tickets abiertos"))
    .addSubcommand((s) => s.setName("panel").setDescription("Enviar el panel de tickets")),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const [config] = await db.select().from(ticketConfigTable)
      .where(eq(ticketConfigTable.guildId, interaction.guildId!)).limit(1);

    if (sub === "panel") {
      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle("🎫 Tickets de Soporte")
        .setDescription("¿Necesitas ayuda? Haz clic en el botón de abajo para abrir un ticket de soporte.\n\nNuestro equipo te atenderá lo antes posible.")
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("ticket:open").setLabel("Abrir Ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary),
      );

      await interaction.reply({ embeds: [embed], components: [row] });

    } else if (sub === "abrir") {
      const subject = interaction.options.getString("asunto", true);
      const category = interaction.options.getString("categoria") ?? "general";

      const openTickets = await db.select().from(ticketsTable)
        .where(and(eq(ticketsTable.guildId, interaction.guildId!), eq(ticketsTable.userId, interaction.user.id), eq(ticketsTable.status, "open")));

      if (openTickets.length >= 3) {
        await interaction.reply({ embeds: [errorEmbed("Demasiados Tickets", "Ya tienes 3 tickets abiertos. Cierra uno antes de abrir otro.")], flags: MessageFlags.Ephemeral });
        return;
      }

      if (!config?.categoryId) {
        await interaction.reply({ embeds: [errorEmbed("No Configurado", "Los tickets no están configurados. Pide a un admin que use `/admin tickets setup`.")], flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const allTickets = await db.select().from(ticketsTable).where(eq(ticketsTable.guildId, interaction.guildId!));
      const ticketNum = allTickets.length + 1;

      const channel = await interaction.guild?.channels.create({
        name: `ticket-${ticketNum.toString().padStart(4, "0")}`,
        type: ChannelType.GuildText,
        parent: config.categoryId,
        permissionOverwrites: [
          { id: interaction.guild!.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          ...(config.supportRoleId ? [{ id: config.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
        ],
      });

      if (!channel) {
        await interaction.editReply({ embeds: [errorEmbed("Error", "No se pudo crear el canal de ticket.")] });
        return;
      }

      await db.insert(ticketsTable).values({
        id: generateId(),
        guildId: interaction.guildId!,
        userId: interaction.user.id,
        channelId: channel.id,
        category,
        subject,
        status: "open",
        number: ticketNum,
      });

      const ticketEmbed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle(`🎫 Ticket #${ticketNum.toString().padStart(4, "0")}`)
        .addFields(
          { name: "Usuario", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Categoría", value: category, inline: true },
          { name: "Asunto", value: subject }
        )
        .setTimestamp();

      const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ticket_close:${channel.id}`).setLabel("Cerrar Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger),
      );

      await (channel as TextChannel).send({
        content: `${config.supportRoleId ? `<@&${config.supportRoleId}>` : ""} <@${interaction.user.id}>`,
        embeds: [ticketEmbed],
        components: [closeRow],
      });

      await interaction.editReply({ embeds: [successEmbed("Ticket Creado", `Tu ticket ha sido creado: ${channel}`)] });

    } else if (sub === "cerrar") {
      const reason = interaction.options.getString("razon") ?? "Sin motivo especificado";
      const [ticket] = await db.select().from(ticketsTable)
        .where(and(eq(ticketsTable.channelId, interaction.channel!.id), eq(ticketsTable.status, "open"))).limit(1);

      if (!ticket) {
        await interaction.reply({ embeds: [errorEmbed("No es un Ticket", "Este no es un canal de ticket activo.")], flags: MessageFlags.Ephemeral });
        return;
      }

      await db.update(ticketsTable).set({ status: "closed", closedBy: interaction.user.id, closedAt: new Date() }).where(eq(ticketsTable.id, ticket.id));
      await interaction.reply({ embeds: [successEmbed("Ticket Cerrado", `Ticket cerrado por <@${interaction.user.id}>. Motivo: ${reason}`)] });
      setTimeout(() => interaction.channel?.delete().catch(() => null), 5000);

    } else if (sub === "lista") {
      const tickets = await db.select().from(ticketsTable)
        .where(and(eq(ticketsTable.guildId, interaction.guildId!), eq(ticketsTable.status, "open")))
        .orderBy(desc(ticketsTable.createdAt));

      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle(`🎫 Tickets Abiertos (${tickets.length})`)
        .setDescription(tickets.length > 0
          ? tickets.map((t) => `#${t.number.toString().padStart(4, "0")} <@${t.userId}> — ${t.subject ?? "Sin asunto"} (${t.category})`).join("\n")
          : "No hay tickets abiertos.")
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};

export default command;
