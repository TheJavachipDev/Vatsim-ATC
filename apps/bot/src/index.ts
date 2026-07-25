import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { handleCoverage } from "./commands.js";
import { assertConfigured, config } from "./config.js";

// TODO (phase 2): subscription/alert commands, e.g. /watch station:<prefix>
// facility:<choice> to DM users when coverage opens or a booking is added.

function main(): void {
  assertConfigured();

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (ready) => {
    console.log(`Logged in as ${ready.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "coverage") return;
    try {
      await handleCoverage(interaction);
    } catch (err) {
      console.error("coverage command failed:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong handling that command.");
      } else {
        await interaction.reply({
          content: "Something went wrong handling that command.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  });

  void client.login(config.discordToken);
}

main();
