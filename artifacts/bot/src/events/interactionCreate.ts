import { Client, Events, Interaction } from "discord.js";
import { handleCommand, handleAutocomplete } from "../handlers/commandHandler.js";
import { handleButton, handleSelectMenu, handleModal } from "../handlers/interactionHandler.js";
import { checkRateLimit, markWarned } from "../middleware/antiSpam.js";
import { errorEmbed } from "../utils/embeds.js";
import { logger } from "../utils/logger.js";

export function registerInteractionCreate(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    const userId = interaction.user.id;

    if (checkRateLimit(userId)) {
      if (interaction.isRepliable()) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            embeds: [errorEmbed("Rate Limited", "You are sending requests too fast. Please slow down.")],
            ephemeral: true,
          }).catch(() => null);
        }
      }
      markWarned(userId);
      return;
    }

    try {
      if (interaction.isChatInputCommand()) {
        await handleCommand(interaction);
      } else if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
      } else if (interaction.isButton()) {
        await handleButton(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
      }
    } catch (err) {
      logger.error("Unhandled interaction error", { userId: interaction.user?.id, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
