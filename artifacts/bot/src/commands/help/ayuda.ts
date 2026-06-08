import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { Command } from "../../types/index.js";
import { Colors } from "../../utils/embeds.js";
import { registerSelectMenu } from "../../handlers/interactionHandler.js";

const CATEGORIES: Record<string, {
  label: string;
  emoji: string;
  description: string;
  commands: { name: string; usage: string; desc: string }[];
}> = {
  economia: {
    label: "Economía",
    emoji: "💰",
    description: "Gana y administra tu dinero",
    commands: [
      { name: "/balance", usage: "/balance [usuario]", desc: "Consulta tu saldo o el de otro usuario" },
      { name: "/diario", usage: "/diario", desc: "Reclama tu recompensa diaria" },
      { name: "/semanal", usage: "/semanal", desc: "Reclama tu recompensa semanal" },
      { name: "/trabajar", usage: "/trabajar", desc: "Trabaja para ganar dinero" },
      { name: "/pagar", usage: "/pagar <usuario> <cantidad>", desc: "Paga dinero a otro usuario" },
      { name: "/tabla", usage: "/tabla [tipo]", desc: "Ver la tabla de clasificación del servidor" },
    ],
  },
  banco: {
    label: "Banco",
    emoji: "🏦",
    description: "Deposita, retira, invierte y solicita préstamos",
    commands: [
      { name: "/banco depositar", usage: "/banco depositar <cantidad>", desc: "Depositar efectivo al banco" },
      { name: "/banco retirar", usage: "/banco retirar <cantidad>", desc: "Retirar fondos del banco" },
      { name: "/banco info", usage: "/banco info", desc: "Ver resumen bancario completo" },
      { name: "/banco ahorros", usage: "/banco ahorros", desc: "Ver o abrir una cuenta de ahorros" },
      { name: "/banco prestamo", usage: "/banco prestamo <cantidad>", desc: "Solicitar un préstamo bancario" },
      { name: "/banco pagar", usage: "/banco pagar <cantidad>", desc: "Pagar tu préstamo activo" },
      { name: "/invertir crear", usage: "/invertir crear <tipo> <cantidad>", desc: "Crear una nueva inversión" },
      { name: "/invertir portafolio", usage: "/invertir portafolio", desc: "Ver tu portafolio de inversiones" },
    ],
  },
  inventario: {
    label: "Inventario",
    emoji: "🎒",
    description: "Gestiona tus objetos",
    commands: [
      { name: "/inventario", usage: "/inventario [usuario]", desc: "Ver tu inventario de objetos" },
      { name: "/dar", usage: "/dar <usuario> <objeto> [cantidad]", desc: "Darle un objeto a otro usuario" },
    ],
  },
  mercado: {
    label: "Mercado",
    emoji: "🛒",
    description: "Compra, vende y subasta objetos",
    commands: [
      { name: "/mercado lista", usage: "/mercado lista", desc: "Ver listados activos del mercado" },
      { name: "/mercado vender", usage: "/mercado vender <objeto> <precio> [cantidad]", desc: "Publicar un objeto en venta" },
      { name: "/mercado comprar", usage: "/mercado comprar <id>", desc: "Comprar un listado del mercado" },
      { name: "/mercado subasta", usage: "/mercado subasta <objeto> <oferta_inicial> <horas>", desc: "Publicar un objeto en subasta" },
      { name: "/mercado pujar", usage: "/mercado pujar <id> <cantidad>", desc: "Hacer una oferta en una subasta" },
      { name: "/mercado cancelar", usage: "/mercado cancelar <id>", desc: "Cancelar tu listado activo" },
      { name: "/mercadonegro explorar", usage: "/mercadonegro explorar", desc: "Explorar el mercado negro" },
      { name: "/mercadonegro comprar", usage: "/mercadonegro comprar <id> [cantidad]", desc: "Comprar del mercado negro" },
    ],
  },
  departamentos: {
    label: "Departamentos",
    emoji: "🏛️",
    description: "Explora y gestiona departamentos gubernamentales",
    commands: [
      { name: "/departamento lista", usage: "/departamento lista", desc: "Ver todos los departamentos activos" },
      { name: "/departamento info", usage: "/departamento info <nombre>", desc: "Ver información de un departamento" },
      { name: "/departamento miembros", usage: "/departamento miembros <nombre>", desc: "Ver miembros de un departamento" },
      { name: "/departamento unirse", usage: "/departamento unirse <nombre>", desc: "Solicitar unirse a un departamento" },
      { name: "/departamento contratar", usage: "/departamento contratar <dept> <usuario>", desc: "Contratar a un miembro (requiere permiso)" },
      { name: "/departamento despedir", usage: "/departamento despedir <dept> <usuario>", desc: "Despedir a un miembro (requiere permiso)" },
      { name: "/departamento presupuesto", usage: "/departamento presupuesto <dept> [agregar]", desc: "Ver o agregar fondos al presupuesto" },
      { name: "/flota ver", usage: "/flota ver <departamento>", desc: "Ver la flota vehicular de un departamento" },
      { name: "/flota comprar", usage: "/flota comprar <dept> <marca> <modelo> <cant> <costo>", desc: "Adquirir vehículos para el departamento" },
    ],
  },
  propiedades: {
    label: "Propiedades",
    emoji: "🏘️",
    description: "Compra, vende y renta propiedades",
    commands: [
      { name: "/propiedad lista", usage: "/propiedad lista [tipo]", desc: "Ver propiedades disponibles" },
      { name: "/propiedad comprar", usage: "/propiedad comprar <id>", desc: "Comprar una propiedad" },
      { name: "/propiedad vender", usage: "/propiedad vender <id>", desc: "Vender una propiedad tuya (75% del valor)" },
      { name: "/propiedad rentar", usage: "/propiedad rentar <id>", desc: "Rentar una propiedad disponible" },
      { name: "/propiedad mias", usage: "/propiedad mias", desc: "Ver tus propiedades" },
    ],
  },
  empresas: {
    label: "Empresas",
    emoji: "🏢",
    description: "Funda y administra tu empresa",
    commands: [
      { name: "/empresa crear", usage: "/empresa crear <nombre> [fondos_iniciales]", desc: "Fundar una empresa" },
      { name: "/empresa info", usage: "/empresa info", desc: "Ver información de tu empresa" },
      { name: "/empresa contratar", usage: "/empresa contratar <usuario> [salario]", desc: "Contratar un empleado" },
      { name: "/empresa despedir", usage: "/empresa despedir <usuario>", desc: "Despedir a un empleado" },
      { name: "/empresa miembros", usage: "/empresa miembros", desc: "Ver empleados de tu empresa" },
      { name: "/empresa depositar", usage: "/empresa depositar <cantidad>", desc: "Depositar fondos a la empresa" },
    ],
  },
  social: {
    label: "Social",
    emoji: "⭐",
    description: "Niveles, reputación y verificación",
    commands: [
      { name: "/nivel", usage: "/nivel [usuario]", desc: "Ver tu nivel y XP acumulado" },
      { name: "/reputacion dar", usage: "/reputacion dar <usuario> <tipo>", desc: "Dar reputación positiva o negativa" },
      { name: "/reputacion perfil", usage: "/reputacion perfil [usuario]", desc: "Ver el perfil de reputación de un usuario" },
      { name: "/verificar panel", usage: "/verificar panel", desc: "Enviar el panel de verificación (admin)" },
      { name: "/verificar estado", usage: "/verificar estado [usuario]", desc: "Consultar estado de verificación" },
    ],
  },
  soporte: {
    label: "Soporte",
    emoji: "🎫",
    description: "Sistema de tickets y solicitudes",
    commands: [
      { name: "/ticket panel", usage: "/ticket panel", desc: "Enviar el panel de tickets (admin)" },
      { name: "/ticket abrir", usage: "/ticket abrir <asunto> [categoria]", desc: "Abrir un ticket de soporte" },
      { name: "/ticket cerrar", usage: "/ticket cerrar [razon]", desc: "Cerrar el ticket actual" },
      { name: "/ticket lista", usage: "/ticket lista", desc: "Ver todos los tickets abiertos" },
      { name: "/solicitar", usage: "/solicitar <tipo>", desc: "Enviar solicitud a CPD/CFD/Sheriff/DOT/Staff" },
    ],
  },
  contratos: {
    label: "Contratos",
    emoji: "📋",
    description: "Contratos y misiones del servidor",
    commands: [
      { name: "/contrato lista", usage: "/contrato lista", desc: "Ver contratos disponibles" },
      { name: "/contrato crear", usage: "/contrato crear <titulo> <descripcion> <recompensa>", desc: "Crear un nuevo contrato" },
      { name: "/contrato aceptar", usage: "/contrato aceptar <id>", desc: "Aceptar un contrato activo" },
      { name: "/contrato completar", usage: "/contrato completar <id>", desc: "Marcar un contrato como completado" },
    ],
  },
  admin: {
    label: "Administración",
    emoji: "⚙️",
    description: "Comandos exclusivos de administradores",
    commands: [
      { name: "/admin economia", usage: "/admin economia dar-efectivo|dar-banco|config-diario|config-semanal", desc: "Gestión de economía del servidor" },
      { name: "/admin objetos", usage: "/admin objetos crear|lista|eliminar", desc: "Crear y gestionar objetos" },
      { name: "/admin departamento", usage: "/admin departamento crear", desc: "Crear un nuevo departamento" },
      { name: "/admin propiedad", usage: "/admin propiedad crear", desc: "Crear una nueva propiedad" },
      { name: "/admin configuracion", usage: "/admin configuracion canal-registro|canal-mercado|rol-admin|ver", desc: "Configurar el servidor" },
      { name: "/tesoro", usage: "/tesoro ver|agregar|financiar-dpto|otorgar", desc: "Gestión del tesoro público" },
    ],
  },
};

function buildOverviewEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Primary)
    .setTitle("📖 Ayuda — Chicago Systems")
    .setDescription(
      "Bienvenido al sistema de ayuda de **Chicago Systems**.\n\n" +
      "Selecciona una categoría del menú de abajo para ver los comandos disponibles.\n\n" +
      Object.values(CATEGORIES).map((c) => `${c.emoji} **${c.label}** — ${c.description}`).join("\n")
    )
    .setFooter({ text: "Chicago Systems | Sistema de Roleplay Completo" })
    .setTimestamp();
}

function buildCategoryEmbed(categoryKey: string): EmbedBuilder | null {
  const cat = CATEGORIES[categoryKey];
  if (!cat) return null;

  const embed = new EmbedBuilder()
    .setColor(Colors.Primary)
    .setTitle(`${cat.emoji} ${cat.label}`)
    .setDescription(cat.description)
    .setFooter({ text: "Usa /ayuda para volver al menú principal" })
    .setTimestamp();

  for (const cmd of cat.commands) {
    embed.addFields({
      name: cmd.name,
      value: `\`${cmd.usage}\`\n${cmd.desc}`,
    });
  }

  return embed;
}

function buildSelectMenu(selectedCategory?: string) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ayuda_category")
      .setPlaceholder("📚 Selecciona una categoría...")
      .addOptions(
        Object.entries(CATEGORIES).map(([key, cat]) => ({
          label: cat.label,
          value: key,
          emoji: cat.emoji,
          description: cat.description.slice(0, 50),
          default: key === selectedCategory,
        }))
      )
  );
}

registerSelectMenu("ayuda_category", async (interaction: StringSelectMenuInteraction) => {
  const selected = interaction.values[0];
  if (!selected) return;

  const embed = buildCategoryEmbed(selected);
  if (!embed) return;

  await interaction.update({
    embeds: [embed],
    components: [buildSelectMenu(selected)],
  });
});

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ayuda")
    .setDescription("Ver todos los comandos disponibles y cómo usarlos")
    .addStringOption((o) =>
      o.setName("categoria")
        .setDescription("Ir directamente a una categoría")
        .setRequired(false)
        .addChoices(
          ...Object.entries(CATEGORIES).map(([key, cat]) => ({ name: `${cat.emoji} ${cat.label}`, value: key }))
        )
    ),
  cooldown: 5,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const category = interaction.options.getString("categoria");

    if (category) {
      const embed = buildCategoryEmbed(category);
      if (!embed) {
        await interaction.reply({ content: "Categoría no encontrada.", ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [embed],
        components: [buildSelectMenu(category)],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        embeds: [buildOverviewEmbed()],
        components: [buildSelectMenu()],
        ephemeral: true,
      });
    }
  },
};

export default command;
