export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const APP_TITLE = import.meta.env.VITE_APP_TITLE || "Monitra";

// Debug: Log environment variable (remove in production)
if (import.meta.env.DEV) {
  console.log("[Logo] VITE_APP_LOGO:", import.meta.env.VITE_APP_LOGO);
}

// Get logo path - use environment variable if set, otherwise use default
// Vite handles /logo.png from public folder automatically
const logoPath = import.meta.env.VITE_APP_LOGO || "/logo.png";
export const APP_LOGO = logoPath;

// Debug: Log final logo path (remove in production)
if (import.meta.env.DEV) {
  console.log("[Logo] Final APP_LOGO:", APP_LOGO);
}

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  
  // Return fallback URL if OAuth is not configured
  if (!oauthPortalUrl || !appId) {
    console.warn("OAuth configuration is missing. VITE_OAUTH_PORTAL_URL and VITE_APP_ID must be set.");
    return "/login";
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  try {
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch (error) {
    console.error("Failed to construct OAuth URL:", error);
    return "/login";
  }
};