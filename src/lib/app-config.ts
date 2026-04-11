import { requireFrontendAppUrl } from "@/lib/env";

export function getAppOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return requireFrontendAppUrl();
}

export function getAuthCallbackUrl(): string {
  return `${getAppOrigin()}/auth/callback`;
}
