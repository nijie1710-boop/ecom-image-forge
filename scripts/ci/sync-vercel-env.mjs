import { VERCEL_ENV_VARS, getMissing, maskSecrets, readEnv } from "./deploy-env.mjs";

const token = readEnv("VERCEL_TOKEN");
const projectId = readEnv("VERCEL_PROJECT_ID");
const teamId = readEnv("VERCEL_TEAM_ID") || readEnv("VERCEL_ORG_ID");
const target = readEnv("VERCEL_TARGET");
const gitBranch = readEnv("VERCEL_GIT_BRANCH");
const deployEnv = readEnv("DEPLOY_ENV");

const missing = getMissing(["VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TARGET", "DEPLOY_ENV"]);
if (target === "preview" && !gitBranch) missing.push("VERCEL_GIT_BRANCH");
missing.push(...getMissing(VERCEL_ENV_VARS.filter((item) => !item.optional).map((item) => item.key)));

if (missing.length > 0) {
  throw new Error(`Missing required Vercel sync variables: ${[...new Set(missing)].join(", ")}`);
}

maskSecrets(VERCEL_ENV_VARS.map((item) => item.key));

const baseUrl = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env`);
baseUrl.searchParams.set("upsert", "true");
if (teamId) baseUrl.searchParams.set("teamId", teamId);

for (const item of VERCEL_ENV_VARS) {
  const value = readEnv(item.key);
  if (!value && item.optional) continue;

  const body = {
    key: item.key,
    value,
    type: item.type,
    target: [target],
    comment: `Managed by GitHub Actions for ${deployEnv}. Do not edit manually unless rotating secrets.`,
  };

  if (target === "preview") {
    body.gitBranch = gitBranch;
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (Array.isArray(payload.failed) && payload.failed.length > 0)) {
    const failure = payload.failed?.[0]?.error?.message || payload.error?.message || response.statusText;
    throw new Error(`Failed to upsert Vercel env ${item.key}: ${failure}`);
  }

  console.log(`Synced Vercel env ${item.key} -> ${target}${target === "preview" ? `/${gitBranch}` : ""}.`);
}
