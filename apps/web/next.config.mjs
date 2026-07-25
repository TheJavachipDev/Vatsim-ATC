import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// Next.js only auto-loads .env from apps/web; load the monorepo root .env too.
const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(rootEnv)) {
  loadEnv({ path: rootEnv });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  serverExternalPackages: ["pg"],
};

export default nextConfig;
