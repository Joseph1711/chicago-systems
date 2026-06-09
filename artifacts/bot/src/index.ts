import "./config/index.js";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { loadCommands } from "./handlers/commandHandler.js";
import { registerReadyEvent } from "./events/ready.js";
import { registerInteractionCreate } from "./events/interactionCreate.js";
import { registerMessageCreate } from "./events/messageCreate.js";
import { startKeepAlive } from "./utils/keepAlive.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

async function main() {
  logger.info("Starting Chicago Systems bot...");

  await loadCommands();

  registerReadyEvent(client);
  registerInteractionCreate(client);
  registerMessageCreate(client);

  startKeepAlive(client, 3000);

  await client.login(config.DISCORD_TOKEN);
}

main().catch((err) => {
  logger.error("Fatal startup error err");
  process.exit(1);
});
