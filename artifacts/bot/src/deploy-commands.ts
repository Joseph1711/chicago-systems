import "./config/index.js";
import { REST, Routes } from "discord.js";
import { config } from "./config/index.js";
import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "./utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function deployCommands() {
  const commands: object[] = [];
  const commandsPath = join(__dirname, "commands");

  const categories = readdirSync(commandsPath).filter((f) => {
    try {
      return statSync(join(commandsPath, f)).isDirectory();
    } catch {
      return false;
    }
  });

  for (const category of categories) {
    const files = readdirSync(join(commandsPath, category)).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      try {
        const mod = await import(join(commandsPath, category, file));
        const command = mod.default ?? mod.command;
        if (command?.data?.toJSON) {
          commands.push(command.data.toJSON());
          logger.info("Queued command for deployment name: command.data.name");
        }
      } catch (err) {
        logger.error("Failed to load command for deployment err, file");
      }
    }
  }

  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

  logger.info("Deploying commands globally... count: commands.length");

  const data = await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
    body: commands,
  }) as any[];

  logger.info("Successfully deployed commands count: data.length");
}

deployCommands().catch((err) => {
  logger.error("Failed to deploy commands err");
  process.exit(1);
});
