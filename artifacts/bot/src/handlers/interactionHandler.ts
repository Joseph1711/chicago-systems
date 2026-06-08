import { Collection, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction, MessageFlags,
} from "discord.js";
import { logger } from "../utils/logger.js";
import { errorEmbed } from "../utils/embeds.js";

type ButtonHandlerFn = (interaction: ButtonInteraction) => Promise<void>;
type SelectMenuHandlerFn = (interaction: StringSelectMenuInteraction) => Promise<void>;
type ModalHandlerFn = (interaction: ModalSubmitInteraction) => Promise<void>;

export const buttonHandlers = new Collection<string, ButtonHandlerFn>();
export const selectMenuHandlers = new Collection<string, SelectMenuHandlerFn>();
export const modalHandlers = new Collection<string, ModalHandlerFn>();

export function registerButton(customId: string, handler: ButtonHandlerFn): void {
  buttonHandlers.set(customId, handler);
}

export function registerSelectMenu(customId: string, handler: SelectMenuHandlerFn): void {
  selectMenuHandlers.set(customId, handler);
}

export function registerModal(customId: string, handler: ModalHandlerFn): void {
  modalHandlers.set(customId, handler);
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId.split(":")[0];
  const handler = buttonHandlers.get(interaction.customId) ?? buttonHandlers.get(id);
  if (!handler) return;
  try {
    await handler(interaction);
  } catch (err) {
    logger.error("Button handler error", {
      customId: interaction.customId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 3).join(" | ") : undefined,
    });
    const embed = errorEmbed("Error", "Ocurrió un error al procesar este botón.");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
}

export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const id = interaction.customId.split(":")[0];
  const handler = selectMenuHandlers.get(interaction.customId) ?? selectMenuHandlers.get(id);
  if (!handler) return;
  try {
    await handler(interaction);
  } catch (err) {
    logger.error("Select menu handler error", {
      customId: interaction.customId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const id = interaction.customId.split(":")[0];
  const handler = modalHandlers.get(interaction.customId) ?? modalHandlers.get(id);
  if (!handler) return;
  try {
    await handler(interaction);
  } catch (err) {
    logger.error("Modal handler error", {
      customId: interaction.customId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
