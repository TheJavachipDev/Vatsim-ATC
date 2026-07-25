#!/usr/bin/env node
/**
 * Build apps/web/src/data/airports.json from OurAirports public data.
 * Includes ICAO, IATA, and FAA / local identifiers where available.
 *
 * Run: node scripts/build-airports.mjs
 *  or: pnpm airports:build
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const AIRPORT_TYPES = new Set(["large_airport", "medium_airport", "small_airport"]);

function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      cols.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`Failed to fetch airports: ${res.status}`);
const text = await res.text();
const lines = text.split("\n");
const header = parseCsvLine(lines[0] ?? "");
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const out = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line?.trim()) continue;
  const cols = parseCsvLine(line);
  if (!AIRPORT_TYPES.has(cols[idx.type] ?? "")) continue;

  const icao = (cols[idx.icao_code] || cols[idx.gps_code] || cols[idx.ident] || "")
    .toUpperCase()
    .trim();
  if (!/^[A-Z]{4}$/.test(icao)) continue;

  const iataRaw = (cols[idx.iata_code] || "").toUpperCase().trim();
  const iata = /^[A-Z]{3}$/.test(iataRaw) ? iataRaw : null;

  const localRaw = (cols[idx.local_code] || "").toUpperCase().trim();
  const local = /^[A-Z0-9]{2,4}$/.test(localRaw) ? localRaw : null;
  const country = (cols[idx.iso_country] || "").toUpperCase();

  // FAA Location ID lives in OurAirports `local_code` for US airports.
  // Often matches IATA (FLL) but can differ for smaller fields.
  const faa = country === "US" && local ? local : null;

  out.push({
    icao,
    ...(iata ? { iata } : {}),
    ...(faa ? { faa } : {}),
    name: cols[idx.name] ?? icao,
  });
}

out.sort((a, b) => a.icao.localeCompare(b.icao));

const outPath = path.join(__dirname, "../apps/web/src/data/airports.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));

const withIata = out.filter((a) => a.iata).length;
const withFaa = out.filter((a) => a.faa).length;
console.log(
  `Wrote ${out.length} airports (${withIata} with IATA, ${withFaa} with FAA) to ${outPath}`,
);
