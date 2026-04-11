import { dirname, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { SUPABASE_SECRET_VARS, getMissing, maskSecrets, readEnv } from "./deploy-env.mjs";

function getArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function quoteDotenv(value) {
  return `"${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n")}"`;
}

const outputPath = resolve(
  getArg("out") || readEnv("SUPABASE_SECRET_ENV_FILE") || ".supabase-secrets.generated.env",
);
const missing = getMissing(SUPABASE_SECRET_VARS);

if (missing.length > 0) {
  throw new Error(`Missing required Supabase Edge Function secrets: ${missing.join(", ")}`);
}

maskSecrets(SUPABASE_SECRET_VARS);

const contents = SUPABASE_SECRET_VARS.map((key) => `${key}=${quoteDotenv(readEnv(key))}`).join("\n") + "\n";

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, contents, { encoding: "utf8", mode: 0o600 });

console.log(`Wrote Supabase secrets env file with ${SUPABASE_SECRET_VARS.length} keys: ${outputPath}`);
