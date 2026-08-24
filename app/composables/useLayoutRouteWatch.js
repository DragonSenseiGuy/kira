import { watch } from "vue";
import { setActiveConversation } from "./workspaceSession";
import { clearPendingSetup } from "./pendingChatSetup";

/**
 * Routes whose pages fill the whole screen and should not compete with
 * sidebars on small viewports.
 */
export function isFullPageDestination(path) {
  return path === "/settings" || path === "/projects" || path.startsWith("/projects/");
}

/**
 * Layout-level route side effects, extracted from default.vue so they can
 * be unit-tested (the inline version once crashed on a temporal-dead-zone
 * reference — exactly the class of bug this extraction prevents).
 *
 * @param {object} route - vue-router route object (reactive)
 * @param {object} panels - { sidebarOpen: Ref, dockOpen: Ref }
 */
export function useLayoutRouteWatch(route, panels) {
  watch(
    () => route.fullPath,
    () => {
      // Workspace scope follows the route: conversation pages own their
      // private scope; every other route has none.
      if (route.params && route.params.id) {
        setActiveConversation(String(route.params.id));
      } else {
        setActiveConversation(null);
      }

      // Leaving the new-chat screen without starting a chat discards
      // anything staged there (attached projects / uploaded files).
      const isNewChat = route.path === "/" || route.path === "/new";
      if (!isNewChat) clearPendingSetup();

      // Full-page destinations take the whole screen on mobile — both the
      // nav and the Workspace dock would only crowd them out, and the dock
      // overlays everything there.
      if (
        typeof window !== "undefined" &&
        window.innerWidth <= 950 &&
        isFullPageDestination(route.path)
      ) {
        panels.sidebarOpen.value = false;
        panels.dockOpen.value = false;
      }
    },
    { immediate: true },
  );
}
