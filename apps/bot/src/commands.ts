import { PRIMARY_FACILITY_TYPES, type FacilityType } from "@vatsim-atc/core";
import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { fetchStation } from "./api-client.js";

export const coverageCommand = new SlashCommandBuilder()
  .setName("coverage")
  .setDescription("VATSIM ATC coverage forecast for a station")
  .addStringOption((option) =>
    option
      .setName("station")
      .setDescription("Station prefix or ICAO, e.g. EGKK")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("facility")
      .setDescription("Facility type")
      .setRequired(true)
      .addChoices(...PRIMARY_FACILITY_TYPES.map((f) => ({ name: f, value: f }))),
  );

function formatPercent(probability: number): string {
  const capped = Math.min(Math.max(probability, 0), 0.9);
  return `${Math.round(capped * 100)}%`;
}

function hourLabel(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getUTCHours()).padStart(2, "0")}00z`;
}

export async function handleCoverage(interaction: ChatInputCommandInteraction): Promise<void> {
  const prefix = interaction.options.getString("station", true).trim().toUpperCase();
  const facility = interaction.options.getString("facility", true) as FacilityType;

  await interaction.deferReply();

  let data;
  try {
    data = await fetchStation(prefix);
  } catch {
    await interaction.editReply("Could not reach the coverage API. Try again shortly.");
    return;
  }

  if (!data) {
    await interaction.editReply(`No coverage data for **${prefix}** yet.`);
    return;
  }

  const online = data.online.filter((s) => s.facilityType === facility);
  const forecast = data.forecast.find((f) => f.facilityType === facility);

  const liveLine =
    online.length > 0
      ? `🟢 Online now — ${online.map((s) => `\`${s.callsign}\``).join(", ")}`
      : "⚪ Offline right now";

  const forecastLines = forecast
    ? forecast.hours
        .slice(0, 12)
        .map((h) => {
          const marker = h.source === "booking" ? "📌" : "";
          return `\`${hourLabel(h.at)}\` ${formatPercent(h.probability)} ${marker}`.trim();
        })
        .join("\n")
    : "No forecast available.";

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`${data.station.prefix} ${facility}`)
    .setDescription(liveLine)
    .addFields({ name: "Next 12 hours (UTC)", value: forecastLines })
    .setFooter({ text: "vatsim-atc.com — unofficial, VATSIM public datafeed" });

  await interaction.editReply({ embeds: [embed] });
}
