#!/usr/bin/env python3
"""Generate apps/web/src/data/facilities.json from VATSIM VATSpy.dat.

Source: https://github.com/vatsimnetwork/vatspy-data-project (VATSpy.dat)
Usage:
  curl -fsSL https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/VATSpy.dat \\
    -o /tmp/VATSpy.dat
  python3 apps/web/scripts/generate-facilities.py /tmp/VATSpy.dat
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "facilities.json"
AIRPORTS = ROOT / "src" / "data" / "airports.json"


def display_name(raw: str) -> str:
    name = raw.strip()
    if " - " in name:
        name = name.rsplit(" - ", 1)[-1].strip()
    upper = name.upper()
    markers = (
        "CONTROL",
        "RADIO",
        "OCEANIC",
        "CENTER",
        "INFORMATION",
        "CENTRE",
        "ACC",
        "FIR",
        "FSS",
        "UIR",
    )
    if any(m in upper for m in markers):
        return name
    return f"{name} Control"


def callsign_prefix(raw: str) -> str:
    return raw.strip().upper().split("_", 1)[0]


def load_airport_codes() -> tuple[set[str], set[str]]:
    """Return (icao_codes, iata_or_faa_codes) for collision checks."""
    if not AIRPORTS.exists():
        return set(), set()
    rows = json.loads(AIRPORTS.read_text(encoding="utf-8"))
    icao = {row["icao"].upper() for row in rows if row.get("icao")}
    short: set[str] = set()
    for row in rows:
        if row.get("iata"):
            short.add(str(row["iata"]).upper())
        if row.get("faa"):
            short.add(str(row["faa"]).upper())
    return icao, short


def prefer_fir_icao(fir_icao: str, prefix: str, airport_icao: set[str], airport_short: set[str]) -> bool:
    """
    Prefer the FIR ICAO as the catalog primary when the VATSpy callsign would
    collide with a real airport — e.g. VAN (IATA LTCI) or CYVR (airport)
    must not steal Vancouver Centre (CZVR_CTR).
    """
    if prefix in airport_icao:
        return True
    # Nav Canada ACC logins use the CZ## FIR id, not short radio names.
    if fir_icao.startswith("CZ") and prefix in airport_short:
        return True
    return False


def main() -> int:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/VATSpy.dat")
    if not source.exists():
        print(f"missing VATSpy.dat at {source}", file=sys.stderr)
        return 1

    airport_icao, airport_short = load_airport_codes()
    text = source.read_text(encoding="utf-8", errors="replace").splitlines()
    section: str | None = None
    entries: dict[str, dict] = {}

    def upsert(prefix: str, name: str, alias: str | None, score: int) -> None:
        if not prefix or not re.fullmatch(r"[A-Z0-9-]{2,10}", prefix):
            return
        existing = entries.get(prefix)
        if existing is None or score > existing["score"]:
            aliases = set(existing["aliases"]) if existing else set()
            if alias and alias != prefix and re.fullmatch(r"[A-Z0-9-]{2,10}", alias):
                aliases.add(alias)
            entries[prefix] = {
                "prefix": prefix,
                "name": name,
                "aliases": aliases,
                "score": score,
            }
        else:
            if alias and alias != prefix and re.fullmatch(r"[A-Z0-9-]{2,10}", alias):
                existing["aliases"].add(alias)
            if score == existing["score"] and len(name) < len(existing["name"]):
                existing["name"] = name

    for line in text:
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            continue
        if not line or line.startswith(";"):
            continue
        if section == "FIRs":
            parts = line.split("|")
            if len(parts) < 2:
                continue
            icao = parts[0].strip().upper()
            name = display_name(parts[1])
            callsign = parts[2].strip().upper() if len(parts) > 2 else ""
            root_icao = icao if "-" not in icao else None
            if callsign:
                prefix = callsign_prefix(callsign)
                use_icao = root_icao and prefer_fir_icao(
                    root_icao, prefix, airport_icao, airport_short
                )
                if use_icao:
                    # FIR id is canonical; keep short name as a search alias only
                    # when it does not collide with an airport ICAO.
                    alias = prefix if prefix not in airport_icao else None
                    score = 150 if "-" not in icao else 70
                    upsert(root_icao, name, alias, score)
                else:
                    score = 100 if callsign == prefix or callsign == icao else 50
                    if not re.search(r"\d", callsign):
                        score += 10
                    if "-" not in icao:
                        score += 20
                    upsert(prefix, name, root_icao if prefix != icao else None, score)
            else:
                upsert(icao, name, None, 140 if "-" not in icao else 60)
        elif section == "UIRs":
            parts = line.split("|")
            if len(parts) < 2:
                continue
            uid = parts[0].strip().upper()
            name = display_name(parts[1])
            prefix = callsign_prefix(uid)
            score = 80 if prefix == uid else 40
            if "-" not in uid:
                score += 10
            upsert(prefix, name, None, score)

    primary = set(entries)
    alias_owner: dict[str, tuple[int, str]] = {}
    for e in entries.values():
        for a in e["aliases"]:
            if a in primary:
                continue
            prev = alias_owner.get(a)
            if prev is None or e["score"] > prev[0]:
                alias_owner[a] = (e["score"], e["prefix"])

    out: list[dict] = []
    for e in sorted(entries.values(), key=lambda x: x["prefix"]):
        aliases = sorted(
            a
            for a in e["aliases"]
            if a not in primary and alias_owner.get(a, (0, e["prefix"]))[1] == e["prefix"]
        )
        row: dict = {"prefix": e["prefix"], "name": e["name"]}
        if aliases:
            row["aliases"] = aliases
        out.append(row)

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(out)} facilities to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
