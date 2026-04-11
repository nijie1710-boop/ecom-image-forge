const PRODUCTION_URL = "https://www.picspark.cn";

export function getAppOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return PRODUCTION_URL;
}

export function getAuthCallbackUrl(): string {
  return `${getAppOrigin()}/auth/callback`;
}
