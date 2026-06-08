import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { Command } from "../../types/index.js";
import { db } from "@workspace/db";
import {
  guildConfigTable,
  verificationConfigTable,
  ticketConfigTable,
  departmentsTable,
  itemsTable,
  propertiesTable,
  jobsTable,
  usersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId, formatCurrency, getOrCreateUser, getOrCreateGuildConfig } from "../../utils/helpers.js";
import { successEmbed, errorEmbed, Colors } from "../../utils/embeds.js";
import { addCash, addBank } from "../../services/economyService.js";

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Comandos administrativos")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup((g) =>
      g.setName("economia").setDescription("Configuración de economía")
        .addSubcommand((s) => s.setName("dar-efectivo").setDescription("Dar efectivo a un usuario").addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true)).addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1)))
        .addSubcommand((s) => s.setName("dar-banco").setDescription("Dar fondos bancarios a un usuario").addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true)).addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1)))
        .addSubcommand((s) => s.setName("config-diario").setDescription("Establecer monto de recompensa diaria").addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1)))
        .addSubcommand((s) => s.setName("config-semanal").setDescription("Establecer monto de recompensa semanal").addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1)))
    )
    .addSubcommandGroup((g) =>
      g.setName("objetos").setDescription("Gestión de objetos")
        .addSubcommand((s) =>
          s.setName("crear").setDescription("Crear un nuevo objeto")
            .addStringOption((o) => o.setName("nombre").setDescription("Nombre del objeto").setRequired(true))
            .addStringOption((o) => o.setName("categoria").setDescription("Categoría").setRequired(true))
            .addIntegerOption((o) => o.setName("precio").setDescription("Precio base").setRequired(true).setMinValue(0))
            .addStringOption((o) => o.setName("rareza").setDescription("Rareza").setRequired(false).addChoices({ name: "Común", value: "common" }, { name: "Poco Común", value: "uncommon" }, { name: "Raro", value: "rare" }, { name: "Épico", value: "epic" }, { name: "Legendario", value: "legendary" }))
            .addStringOption((o) => o.setName("descripcion").setDescription("Descripción").setRequired(false))
            .addStringOption((o) => o.setName("emoji").setDescription("Emoji").setRequired(false))
        )
        .addSubcommand((s) => s.setName("lista").setDescription("Listar todos los objetos"))
        .addSubcommand((s) => s.setName("eliminar").setDescription("Eliminar un objeto").addStringOption((o) => o.setName("nombre").setDescription("Nombre del objeto").setRequired(true)))
    )
    .addSubcommandGroup((g) =>
      g.setName("departamento").setDescription("Gestión de departamentos")
        .addSubcommand((s) =>
          s.setName("crear").setDescription("Crear un departamento")
            .addStringOption((o) => o.setName("nombre").setDescription("Nombre completo").setRequired(true))
            .addStringOption((o) => o.setName("siglas").setDescription("Siglas (ej. CPD)").setRequired(true))
            .addStringOption((o) => o.setName("descripcion").setDescription("Descripción").setRequired(false))
            .addRoleOption((o) => o.setName("rol").setDescription("Rol del departamento").setRequired(false))
            .addStringOption((o) => o.setName("emoji").setDescription("Emoji").setRequired(false))
        )
    )
    .addSubcommandGroup((g) =>
      g.setName("propiedad").setDescription("Gestión de propiedades")
        .addSubcommand((s) =>
          s.setName("crear").setDescription("Crear una propiedad")
            .addStringOption((o) => o.setName("nombre").setDescription("Nombre de la propiedad").setRequired(true))
            .addStringOption((o) => o.setName("tipo").setDescription("Tipo").setRequired(true).addChoices({ name: "Casa", value: "house" }, { name: "Apartamento", value: "apartment" }, { name: "Negocio", value: "business" }, { name: "Garaje", value: "garage" }, { name: "Almacén", value: "warehouse" }))
            .addIntegerOption((o) => o.setName("precio").setDescription("Precio de compra").setRequired(true).setMinValue(1))
            .addIntegerOption((o) => o.setName("renta").setDescription("Precio de renta/día").setRequired(false).setMinValue(0))
            .addStringOption((o) => o.setName("direccion").setDescription("Dirección").setRequired(false))
        )
    )
    .addSubcommandGroup((g) =>
      g.setName("configuracion").setDescription("Configuración del servidor")
        .addSubcommand((s) => s.setName("canal-registro").setDescription("Establecer canal de registro").addChannelOption((o) => o.setName("canal").setDescription("Canal").setRequired(true)))
        .addSubcommand((s) => s.setName("canal-mercado").setDescription("Establecer canal de mercado").addChannelOption((o) => o.setName("canal").setDescription("Canal").setRequired(true)))
        .addSubcommand((s) => s.setName("rol-admin").setDescription("Establecer rol de administrador").addRoleOption((o) => o.setName("rol").setDescription("Rol").setRequired(true)))
        .addSubcommand((s) => s.setName("ver").setDescription("Ver configuración actual"))
    )
    .addSubcommandGroup((g) =>
      g.setName("verificacion").setDescription("Configurar el sistema de verificación")
        .addSubcommand((s) =>
          s.setName("setup").setDescription("Habilitar y configurar la verificación")
            .addRoleOption((o) => o.setName("rol-verificado").setDescription("Rol que se asigna al verificarse").setRequired(true))
            .addRoleOption((o) => o.setName("rol-no-verificado").setDescription("Rol que se quita al verificarse").setRequired(false))
            .addChannelOption((o) => o.setName("canal-logs").setDescription("Canal donde se registran las verificaciones").setRequired(false))
            .addIntegerOption((o) => o.setName("dias-minimos").setDescription("Días mínimos de antigüedad de la cuenta (anti-alts)").setRequired(false).setMinValue(0).setMaxValue(365))
        )
        .addSubcommand((s) => s.setName("deshabilitar").setDescription("Deshabilitar el sistema de verificación"))
        .addSubcommand((s) => s.setName("ver").setDescription("Ver configuración actual de verificación"))
    ),
  cooldown: 2,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    if (group === "economia") {
      if (sub === "dar-efectivo") {
        const target = interaction.options.getUser("usuario", true);
        const amount = interaction.options.getInteger("cantidad", true);
        await getOrCreateUser(target.id, interaction.guildId!, target.username);
        await addCash(target.id, interaction.guildId!, amount);
        await interaction.reply({ embeds: [successEmbed("Efectivo Otorgado", `Se dieron **${formatCurrency(amount)}** en efectivo a ${target}.`)] });

      } else if (sub === "dar-banco") {
        const target = interaction.options.getUser("usuario", true);
        const amount = interaction.options.getInteger("cantidad", true);
        await getOrCreateUser(target.id, interaction.guildId!, target.username);
        await addBank(target.id, interaction.guildId!, amount);
        await interaction.reply({ embeds: [successEmbed("Fondos Bancarios Otorgados", `Se dieron **${formatCurrency(amount)}** al banco de ${target}.`)] });

      } else if (sub === "config-diario") {
        const amount = interaction.options.getInteger("cantidad", true);
        await getOrCreateGuildConfig(interaction.guildId!);
        await db.update(guildConfigTable).set({ dailyAmount: amount }).where(eq(guildConfigTable.guildId, interaction.guildId!));
        await interaction.reply({ embeds: [successEmbed("Diario Actualizado", `La recompensa diaria fue establecida en **${formatCurrency(amount)}**.`)] });

      } else if (sub === "config-semanal") {
        const amount = interaction.options.getInteger("cantidad", true);
        await getOrCreateGuildConfig(interaction.guildId!);
        await db.update(guildConfigTable).set({ weeklyAmount: amount }).where(eq(guildConfigTable.guildId, interaction.guildId!));
        await interaction.reply({ embeds: [successEmbed("Semanal Actualizado", `La recompensa semanal fue establecida en **${formatCurrency(amount)}**.`)] });
      }

    } else if (group === "objetos") {
      if (sub === "crear") {
        const name = interaction.options.getString("nombre", true);
        const category = interaction.options.getString("categoria", true);
        const price = interaction.options.getInteger("precio", true);
        const rarity = interaction.options.getString("rareza") ?? "common";
        const description = interaction.options.getString("descripcion");
        const emoji = interaction.options.getString("emoji") ?? "📦";

        const existing = await db.select().from(itemsTable)
          .where(and(eq(itemsTable.guildId, interaction.guildId!), eq(itemsTable.name, name))).limit(1);
        if (existing[0]) {
          await interaction.reply({ embeds: [errorEmbed("Ya Existe", `El objeto **${name}** ya existe.`)], flags: MessageFlags.Ephemeral });
          return;
        }

        await db.insert(itemsTable).values({
          id: generateId(),
          guildId: interaction.guildId!,
          name,
          category,
          rarity,
          basePrice: price,
          description: description ?? null,
          emoji,
        });
        await interaction.reply({ embeds: [successEmbed("Objeto Creado", `${emoji} **${name}** (${rarity}) creado con precio base **${formatCurrency(price)}**.`)] });

      } else if (sub === "lista") {
        const items = await db.select().from(itemsTable)
          .where(and(eq(itemsTable.guildId, interaction.guildId!), eq(itemsTable.isActive, true)));
        if (items.length === 0) {
          await interaction.reply({ embeds: [errorEmbed("Sin Objetos", "Aún no se han creado objetos.")], flags: MessageFlags.Ephemeral });
          return;
        }
        const embed = new EmbedBuilder()
          .setColor(Colors.Primary)
          .setTitle(`📦 Objetos (${items.length})`)
          .setDescription(items.map((i) => `${i.emoji} **${i.name}** [${i.rarity}] — ${formatCurrency(i.basePrice)} — ${i.category}`).join("\n"))
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });

      } else if (sub === "eliminar") {
        const name = interaction.options.getString("nombre", true);
        const [item] = await db.select().from(itemsTable)
          .where(and(eq(itemsTable.guildId, interaction.guildId!), eq(itemsTable.name, name))).limit(1);
        if (!item) {
          await interaction.reply({ embeds: [errorEmbed("No Encontrado", `Objeto **${name}** no encontrado.`)], flags: MessageFlags.Ephemeral });
          return;
        }
        await db.update(itemsTable).set({ isActive: false }).where(eq(itemsTable.id, item.id));
        await interaction.reply({ embeds: [successEmbed("Objeto Eliminado", `${item.emoji} **${item.name}** ha sido eliminado.`)] });
      }

    } else if (group === "departamento") {
      if (sub === "crear") {
        const name = interaction.options.getString("nombre", true);
        const acronym = interaction.options.getString("siglas", true).toUpperCase();
        const description = interaction.options.getString("descripcion");
        const role = interaction.options.getRole("rol");
        const emoji = interaction.options.getString("emoji") ?? "🏛️";

        await db.insert(departmentsTable).values({
          id: generateId(),
          guildId: interaction.guildId!,
          name,
          acronym,
          description: description ?? null,
          roleId: role?.id ?? null,
          emoji,
          budget: 0,
          isActive: true,
        });
        await interaction.reply({ embeds: [successEmbed("Departamento Creado", `${emoji} **${name}** (\`${acronym}\`) ha sido creado.`)] });
      }

    } else if (group === "propiedad") {
      if (sub === "crear") {
        const name = interaction.options.getString("nombre", true);
        const type = interaction.options.getString("tipo", true);
        const price = interaction.options.getInteger("precio", true);
        const rent = interaction.options.getInteger("renta");
        const address = interaction.options.getString("direccion");
        const emoji = { house: "🏠", apartment: "🏢", business: "🏪", garage: "🚗", warehouse: "🏭" }[type] ?? "🏠";

        await db.insert(propertiesTable).values({
          id: generateId(),
          guildId: interaction.guildId!,
          name,
          type,
          price,
          rentPrice: rent ?? null,
          address: address ?? null,
          status: "available",
          emoji,
        });
        await interaction.reply({ embeds: [successEmbed("Propiedad Creada", `${emoji} **${name}** creada por **${formatCurrency(price)}**.`)] });
      }

    } else if (group === "verificacion") {
      const guildId = interaction.guildId!;

      if (sub === "setup") {
        const verifiedRole = interaction.options.getRole("rol-verificado", true);
        const unverifiedRole = interaction.options.getRole("rol-no-verificado");
        const logChannel = interaction.options.getChannel("canal-logs");
        const minDays = interaction.options.getInteger("dias-minimos") ?? 7;

        const [existing] = await db.select().from(verificationConfigTable)
          .where(eq(verificationConfigTable.guildId, guildId)).limit(1);

        if (existing) {
          await db.update(verificationConfigTable).set({
            isEnabled: true,
            verifiedRoleId: verifiedRole.id,
            unverifiedRoleId: unverifiedRole?.id ?? null,
            logChannelId: logChannel?.id ?? null,
            antiAltDays: minDays,
          }).where(eq(verificationConfigTable.guildId, guildId));
        } else {
          await db.insert(verificationConfigTable).values({
            id: generateId(),
            guildId,
            isEnabled: true,
            verifiedRoleId: verifiedRole.id,
            unverifiedRoleId: unverifiedRole?.id ?? null,
            logChannelId: logChannel?.id ?? null,
            antiAltDays: minDays,
          });
        }

        const embed = new EmbedBuilder()
          .setColor(Colors.Success)
          .setTitle("✅ Verificación Habilitada")
          .addFields(
            { name: "Rol verificado", value: `${verifiedRole}`, inline: true },
            { name: "Rol no verificado", value: unverifiedRole ? `${unverifiedRole}` : "No configurado", inline: true },
            { name: "Canal de logs", value: logChannel ? `${logChannel}` : "No configurado", inline: true },
            { name: "Días mínimos de cuenta", value: `${minDays} días`, inline: true },
          )
          .setDescription("Ahora usa `/verificar panel` en el canal donde quieras publicar el panel de verificación.")
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });

      } else if (sub === "deshabilitar") {
        await db.update(verificationConfigTable)
          .set({ isEnabled: false })
          .where(eq(verificationConfigTable.guildId, guildId));
        await interaction.reply({ embeds: [successEmbed("Verificación Deshabilitada", "El sistema de verificación ha sido deshabilitado.")] });

      } else if (sub === "ver") {
        const [cfg] = await db.select().from(verificationConfigTable)
          .where(eq(verificationConfigTable.guildId, guildId)).limit(1);

        const embed = new EmbedBuilder()
          .setColor(cfg?.isEnabled ? Colors.Success : Colors.Error)
          .setTitle("🔐 Configuración de Verificación")
          .addFields(
            { name: "Estado", value: cfg?.isEnabled ? "✅ Habilitada" : "❌ Deshabilitada", inline: true },
            { name: "Rol verificado", value: cfg?.verifiedRoleId ? `<@&${cfg.verifiedRoleId}>` : "No configurado", inline: true },
            { name: "Rol no verificado", value: cfg?.unverifiedRoleId ? `<@&${cfg.unverifiedRoleId}>` : "No configurado", inline: true },
            { name: "Canal de logs", value: cfg?.logChannelId ? `<#${cfg.logChannelId}>` : "No configurado", inline: true },
            { name: "Días mínimos", value: `${cfg?.antiAltDays ?? 7} días`, inline: true },
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

    } else if (group === "configuracion") {
      const cfg = await getOrCreateGuildConfig(interaction.guildId!);

      if (sub === "canal-registro") {
        const channel = interaction.options.getChannel("canal", true);
        await db.update(guildConfigTable).set({ logChannelId: channel.id }).where(eq(guildConfigTable.guildId, interaction.guildId!));
        await interaction.reply({ embeds: [successEmbed("Config Actualizada", `Canal de registro establecido en ${channel}.`)] });

      } else if (sub === "canal-mercado") {
        const channel = interaction.options.getChannel("canal", true);
        await db.update(guildConfigTable).set({ marketplaceChannelId: channel.id }).where(eq(guildConfigTable.guildId, interaction.guildId!));
        await interaction.reply({ embeds: [successEmbed("Config Actualizada", `Canal de mercado establecido en ${channel}.`)] });

      } else if (sub === "rol-admin") {
        const role = interaction.options.getRole("rol", true);
        await db.update(guildConfigTable).set({ adminRoleId: role.id }).where(eq(guildConfigTable.guildId, interaction.guildId!));
        await interaction.reply({ embeds: [successEmbed("Config Actualizada", `Rol de administrador establecido en ${role}.`)] });

      } else if (sub === "ver") {
        const embed = new EmbedBuilder()
          .setColor(Colors.Primary)
          .setTitle("⚙️ Configuración del Servidor")
          .addFields(
            { name: "Economía", value: cfg.economyEnabled ? "✅ Habilitada" : "❌ Deshabilitada", inline: true },
            { name: "Mercado", value: cfg.marketplaceEnabled ? "✅ Habilitado" : "❌ Deshabilitado", inline: true },
            { name: "Recompensa Diaria", value: formatCurrency(cfg.dailyAmount), inline: true },
            { name: "Recompensa Semanal", value: formatCurrency(cfg.weeklyAmount), inline: true },
            { name: "Moneda", value: `${cfg.currency} (${cfg.currencyName})`, inline: true },
            { name: "XP/Mensaje", value: `${cfg.xpPerMessage}`, inline: true },
            { name: "Canal de Registro", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "No configurado", inline: true },
            { name: "Canal de Mercado", value: cfg.marketplaceChannelId ? `<#${cfg.marketplaceChannelId}>` : "No configurado", inline: true },
            { name: "Rol Admin", value: cfg.adminRoleId ? `<@&${cfg.adminRoleId}>` : "No configurado", inline: true }
          )
          .setTimestamp();
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    }
  },
};

export default command;
