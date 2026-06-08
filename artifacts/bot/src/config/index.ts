import { z } from "zod";

const configSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.string().default("development"),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Missing environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
