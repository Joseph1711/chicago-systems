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
import { verificationConfigTable, verificationLogsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId, getOrCreateUser } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { registerButton, registerModal } from "../../handlers/interactionHandler.js";

registerButton("verify_start", async (interaction) => {
  const modal = new ModalBuilder()
    .setCustomId("verify_modal")
    .setTitle("Verificación de Cuenta");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("ign").setLabel("Nombre en el Juego (IGN)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Nombre de tu personaje en el roleplay")
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("age").setLabel("Tu Edad").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Debes tener 16+ años")
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("about").setLabel("Sobre Ti").setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder("Cuéntanos brevemente sobre ti y por qué quieres unirte.")
    )
  );

  await interaction.showModal(modal);
});

registerModal("verify_modal", async (interaction) => {
  const guildId = interaction.guildId!;
  const [config] = await db.select().from(verificationConfigTable)
    .where(eq(verificationConfigTable.guildId, guildId)).limit(1);

  if (!config?.isEnabled) {
    await interaction.reply({ embeds: [errorEmbed("No Habilitado", "La verificación no está habilitada en este servidor.")], ephemeral: true });
    return;
  }

  const guild = interaction.guild!;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ embeds: [errorEmbed("Error", "No se pudo encontrar tu membresía.")], ephemeral: true });
    return;
  }

  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < (config.antiAltDays ?? 7)) {
    await interaction.reply({
      embeds: [errorEmbed("Cuenta Muy Nueva", `Tu cuenta debe tener al menos **${config.antiAltDays} días** para verificarse. Tu cuenta tiene ${Math.floor(accountAgeDays)} días.`)],
      ephemeral: true,
    });
    return;
  }

  const ign = interaction.fields.getTextInputValue("ign");
  const age = interaction.fields.getTextInputValue("age");
  const about = interaction.fields.getTextInputValue("about");

  await getOrCreateUser(interaction.user.id, guildId, interaction.user.username);
  await db.update(usersTable).set({ isVerified: true })
    .where(and(eq(usersTable.discordId, interaction.user.id), eq(usersTable.guildId, guildId)));

  if (config.verifiedRoleId) {
    await member.roles.add(config.verifiedRoleId).catch(() => null);
  }
  if (config.unverifiedRoleId) {
    await member.roles.remove(config.unverifiedRoleId).catch(() => null);
  }

  await db.insert(verificationLogsTable).values({
    id: generateId(),
    guildId,
    userId: interaction.user.id,
    action: "verified",
    reason: `IGN: ${ign} | Edad: ${age}`,
  });

  if (config.logChannelId) {
    const logChannel = interaction.guild?.channels.cache.get(config.logChannelId) as any;
    if (logChannel) {
      await logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(Colors.Success)
          .setTitle("✅ Usuario Verificado")
          .addFields(
            { name: "Usuario", value: `<@${interaction.user.id}>`, inline: true },
            { name: "IGN", value: ign, inline: true },
            { name: "Edad", value: age, inline: true },
            { name: "Sobre", value: about.slice(0, 200) }
          )
          .setTimestamp()],
      }).catch(() => null);
    }
  }

  await interaction.reply({ embeds: [successEmbed("¡Verificado!", "¡Bienvenido al servidor! Ya tienes acceso a todos los canales.")], ephemeral: true });
});

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("verificar")
    .setDescription("Sistema de verificación")
    .addSubcommand((s) => s.setName("panel").setDescription("Enviar el panel de verificación"))
    .addSubcommand((s) => s.setName("estado").setDescription("Consultar estado de verificación").addUserOption((o) => o.setName("usuario").setDescription("Usuario a consultar").setRequired(false))),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === "panel") {
      const embed = new EmbedBuilder()
        .setColor(Colors.Primary)
        .setTitle("🔐 Verificación de Cuenta")
        .setDescription(
          "¡Bienvenido al servidor!\n\nPara obtener acceso completo, debes verificar tu cuenta.\n\n" +
          "**Requisitos:**\n" +
          "• Tu cuenta de Discord debe tener al menos 7 días de antigüedad\n" +
          "• Completa el formulario de verificación con honestidad\n\n" +
          "Haz clic en el botón de abajo para iniciar el proceso de verificación."
        )
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("verify_start").setLabel("Verificarme Ahora").setEmoji("✅").setStyle(ButtonStyle.Success),
      );

      await interaction.reply({ embeds: [embed], components: [row] });

    } else {
      const target = interaction.options.getUser("usuario") ?? interaction.user;
      const user = await getOrCreateUser(target.id, interaction.guildId!, target.username);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(user.isVerified ? Colors.Success : Colors.Error)
          .setTitle(`${user.isVerified ? "✅" : "❌"} Estado de Verificación`)
          .setDescription(`${target} está **${user.isVerified ? "verificado" : "sin verificar"}**.`)
          .setTimestamp()],
        ephemeral: true,
      });
    }
  },
};

export default command;
