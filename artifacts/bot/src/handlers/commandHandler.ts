import { Collection, Client, ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Command } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { errorEmbed } from "../utils/embeds.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const commands = new Collection<string, Command>();
export const cooldowns = new Collection<string, Collection<string, number>>();

export async function loadCommands(): Promise<void> {
  const commandsPath = join(__dirname, "..", "commands");
  const categories = readdirSync(commandsPath).filter((f) => {
    try {
      return statSync(join(commandsPath, f)).isDirectory();
    } catch {
      return false;
    }
  });

  let loaded = 0;
  for (const category of categories) {
    const files = readdirSync(join(commandsPath, category)).filter((f) => f.endsWith(".js") || f.endsWith(".ts"));
    for (const file of files) {
      try {
        const mod = await import(join(commandsPath, category, file));
        const command: Command = mod.default ?? mod.command;
        if (!command?.data?.name) continue;
        commands.set(command.data.name, command);
        loaded++;
      } catch (err) {
        logger.error("Failed to load command", { file, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  logger.info("Commands loaded", { count: loaded });
}

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = commands.get(interaction.commandName);
  if (!command) return;

  if (command.cooldown) {
    if (!cooldowns.has(command.data.name)) {
      cooldowns.set(command.data.name, new Collection());
    }
    const timestamps = cooldowns.get(command.data.name)!;
    const now = Date.now();
    const cooldownMs = command.cooldown * 1000;

    if (timestamps.has(interaction.user.id)) {
      const expiry = timestamps.get(interaction.user.id)! + cooldownMs;
      if (now < expiry) {
        const remaining = ((expiry - now) / 1000).toFixed(1);
        await interaction.reply({
          embeds: [errorEmbed("Cooldown", `Please wait **${remaining}s** before using this command again.`)],
          ephemeral: true,
        });
        return;
      }
    }
    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownMs);
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error("Command execution error", {
      command: interaction.commandName,
      user: interaction.user.id,
      guild: interaction.guildId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 3).join(" | ") : undefined,
    });
    const embed = errorEmbed("Error", "Ocurrió un error al ejecutar este comando.");
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const command = commands.get(interaction.commandName);
  if (!command?.autocomplete) return;
  try {
    await command.autocomplete(interaction);
  } catch (err) {
    logger.error("Autocomplete error err, command: interaction.commandName");
  }
}
