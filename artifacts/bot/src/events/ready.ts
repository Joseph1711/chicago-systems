import { Client, Events } from "discord.js";
import { logger } from "../utils/logger.js";
import { startCronJobs } from "../jobs/cronJobs.js";

export function registerReadyEvent(client: Client): void {
  client.once(Events.ClientReady, async (c) => {
    logger.info("Chicago Systems bot is online!", { tag: c.user.tag, guilds: c.guilds.cache.size });
    c.user.setPresence({
      activities: [{ name: "Chicago Systems | /ayuda" }],
      status: "online",
    });
    startCronJobs(c);
  });
}
