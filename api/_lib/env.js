function cleanEnv(value) {
  return String(value ?? "").trim();
}

export function requireServerEnv(name) {
  const value = cleanEnv(process.env[name]);
  if (!value) {
    const error = new Error(
      `Missing required server environment variable: ${name}. Configure it separately for Production and Preview/Staging.`,
    );
    error.status = 500;
    error.code = "ENV_MISSING";
    error.missingEnv = name;
    throw error;
  }
  return value;
}

export function requireServerUrlEnv(name) {
  const value = requireServerEnv(name);
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    const error = new Error(`Invalid server environment variable: ${name} must be a valid URL.`);
    error.status = 500;
    error.code = "ENV_INVALID";
    error.missingEnv = name;
    throw error;
  }
}

export function optionalServerUrlEnv(name) {
  const value = cleanEnv(process.env[name]);
  if (!value) return "";
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    const error = new Error(`Invalid server environment variable: ${name} must be a valid URL.`);
    error.status = 500;
    error.code = "ENV_INVALID";
    error.missingEnv = name;
    throw error;
  }
}

export function getServerSupabaseConfig() {
  return {
    supabaseUrl: requireServerUrlEnv("SUPABASE_URL"),
    serviceRoleKey: requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getServerSupabasePublishableKey() {
  return requireServerEnv("SUPABASE_PUBLISHABLE_KEY");
}

export function getServerAppUrl() {
  return requireServerUrlEnv("APP_URL");
}

export function getAllowedOrigins() {
  const explicitOrigins = cleanEnv(process.env.ALLOWED_ORIGINS)
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const appUrl = optionalServerUrlEnv("APP_URL");
  return [...new Set([...explicitOrigins, appUrl].filter(Boolean))];
}
