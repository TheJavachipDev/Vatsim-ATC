import { REST, Routes } from "discord.js";
import { coverageCommand } from "./commands.js";
import { assertConfigured, config } from "./config.js";

// Registers slash commands globally. Run once after changing command shapes:
//   pnpm --filter @vatsim-atc/bot deploy-commands
async function main(): Promise<void> {
  assertConfigured();
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(config.discordClientId), {
    body: [coverageCommand.toJSON()],
  });
  console.log("Registered application commands.");
}

main().catch((err) => {
  console.error("Failed to register commands:", err);
  process.exit(1);
});
