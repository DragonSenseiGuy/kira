import { useAuth } from "~/composables/useAuth";

/**
 * Sends signed-out visitors to /login whenever accounts are enabled, and
 * keeps signed-in users off the login page.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated, accountsEnabled, loadSession } = useAuth();

  await loadSession();

  if (to.path === "/login") {
    // Nothing to sign in to, or already signed in.
    if (!accountsEnabled.value || isAuthenticated.value) {
      return navigateTo(typeof to.query.redirect === "string" ? to.query.redirect : "/");
    }
    return;
  }

  if (!isAuthenticated.value) {
    return navigateTo({
      path: "/login",
      query: to.fullPath === "/" ? undefined : { redirect: to.fullPath },
    });
  }
});
