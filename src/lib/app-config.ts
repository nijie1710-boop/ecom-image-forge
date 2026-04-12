function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getAppOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  const appUrl = import.meta.env.VITE_APP_URL?.trim();
  if (!appUrl) {
    throw new Error("[env] Missing VITE_APP_URL. Configure it in the current Vercel environment.");
  }
  return normalizeOrigin(appUrl);
}

export function getAuthCallbackUrl(): string {
  return `${getAppOrigin()}/auth/callback`;
}
