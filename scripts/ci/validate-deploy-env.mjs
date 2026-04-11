import { REQUIRED_CI_ENV, getMissing, maskSecrets, readEnv } from "./deploy-env.mjs";

const target = readEnv("VERCEL_TARGET");
const deployEnv = readEnv("DEPLOY_ENV");
const missing = getMissing(REQUIRED_CI_ENV);

if (target === "preview" && !readEnv("VERCEL_GIT_BRANCH")) {
  missing.push("VERCEL_GIT_BRANCH");
}

if (!["staging", "production"].includes(deployEnv)) {
  throw new Error("DEPLOY_ENV must be either staging or production.");
}

if (!["preview", "production"].includes(target)) {
  throw new Error("VERCEL_TARGET must be either preview or production.");
}

if (missing.length > 0) {
  throw new Error(`Missing required deployment environment variables: ${[...new Set(missing)].join(", ")}`);
}

maskSecrets(REQUIRED_CI_ENV);

console.log(`Deployment env validated: ${deployEnv} -> Vercel ${target}, Supabase ${readEnv("SUPABASE_PROJECT_REF")}.`);
