import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(here, "../../../.env");
if (existsSync(rootEnv)) {
  loadEnv({ path: rootEnv });
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN ?? "",
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  webApiUrl: process.env.WEB_API_URL ?? "http://localhost:3000",
} as const;

export function assertConfigured(): void {
  if (!config.discordToken || !config.discordClientId) {
    throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID must be set");
  }
}
