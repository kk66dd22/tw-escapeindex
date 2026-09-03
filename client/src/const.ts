export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the direct Google OAuth flow. This must only run from a user event.
export const startLogin = () => {
  const loginUrl = new URL(`${window.location.origin}/api/google/login`);
  loginUrl.searchParams.set("returnTo", window.location.origin);
  window.location.href = loginUrl.toString();
};
