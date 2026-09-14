export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the direct Google OAuth flow. This must only run from a user event.
export const startLogin = () => {
  const appOrigin = import.meta.env.PROD ? "https://www.tw-escapeindex.com" : window.location.origin;
  const loginUrl = new URL(`${appOrigin}/api/google/login`);
  loginUrl.searchParams.set("returnTo", "https://www.tw-escapeindex.com");
  window.location.href = loginUrl.toString();
};
