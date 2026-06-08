import { REST, Routes } from "discord.js";
import { config } from "./config/index.js";

const rest = new REST().setToken(config.DISCORD_TOKEN);

async function clearCommands(): Promise<void> {
  try {
    console.log("Eliminando todos los comandos globales registrados...");
    await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), { body: [] });
    console.log("✅ Todos los comandos globales han sido eliminados.");
  } catch (err) {
    console.error("Error al eliminar comandos:", err);
    process.exit(1);
  }
}

await clearCommands();
