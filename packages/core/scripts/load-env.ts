import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Load the repo-root `.env` when present. Container/runtime env vars take precedence. */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const envPath = path.resolve(repoRoot, ".env");
if (existsSync(envPath)) {
  loadEnv({ path: envPath });
}
