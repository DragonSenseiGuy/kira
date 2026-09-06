/**
 * Tests for app/composables/useLayoutRouteWatch.js — the layout's route
 * side effects, extracted from default.vue.
 *
 * Covers:
 *   - Workspace scope follows the route (conversation id ↔ null)
 *   - New-chat staging is discarded on any non-new-chat navigation
 *   - Incognito is cleared when leaving the chat-start surfaces
 *   - Mobile (≤950px): full-page destinations close BOTH sidebars
 *   - Desktop: panels are never touched by the watcher
 *   - isFullPageDestination classification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reactive, ref, nextTick } from "vue";

vi.mock("../app/composables/workspaceSession", () => ({
  setActiveConversation: vi.fn(),
}));

vi.mock("../app/composables/pendingChatSetup", () => ({
  clearPendingSetup: vi.fn(),
}));

import { setActiveConversation } from "../app/composables/workspaceSession";
import { clearPendingSetup } from "../app/composables/pendingChatSetup";
import { useGlobalIncognito } from "../app/composables/useGlobalIncognito";
import {
  useLayoutRouteWatch,
  isFullPageDestination,
  keepsIncognito,
} from "../app/composables/useLayoutRouteWatch";

function setViewportWidth(px) {
  Object.defineProperty(window, "innerWidth", {
    value: px,
    configurable: true,
    writable: true,
  });
}

function fakeRoute(path, id = null) {
  return reactive({
    fullPath: id ? `/${id}` : path,
    path,
    params: id ? { id } : {},
  });
}

beforeEach(() => {
  vi.mocked(setActiveConversation).mockClear();
  vi.mocked(clearPendingSetup).mockClear();
  setViewportWidth(1200); // desktop by default
  useGlobalIncognito().setIncognito(false);
});

afterEach(() => {
  setViewportWidth(1200);
});

describe("isFullPageDestination", () => {
  it("classifies settings and any projects route as full-page", () => {
    expect(isFullPageDestination("/settings")).toBe(true);
    expect(isFullPageDestination("/projects")).toBe(true);
    expect(isFullPageDestination("/projects/my-proj")).toBe(true);
  });

  it("excludes chat surfaces", () => {
    expect(isFullPageDestination("/")).toBe(false);
    expect(isFullPageDestination("/new")).toBe(false);
    expect(isFullPageDestination("/abc123")).toBe(false);
    expect(isFullPageDestination("/notepad")).toBe(false);
    expect(isFullPageDestination("/projectsfoo")).toBe(false); // not a projects route
  });
});

describe("keepsIncognito", () => {
  it("keeps the flag on the chat-start surfaces", () => {
    expect(keepsIncognito("/incognito")).toBe(true);
    expect(keepsIncognito("/")).toBe(true);
    expect(keepsIncognito("/new")).toBe(true);
  });

  it("drops it everywhere else", () => {
    expect(keepsIncognito("/abc123")).toBe(false);
    expect(keepsIncognito("/settings")).toBe(false);
    expect(keepsIncognito("/projects")).toBe(false);
  });
});

describe("useLayoutRouteWatch", () => {
  it("clears incognito when a stored conversation is opened", async () => {
    const { isIncognito, setIncognito } = useGlobalIncognito();
    const route = fakeRoute("/incognito");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), dockOpen: ref(false) });

    setIncognito(true);
    route.fullPath = "/convo-9";
    route.path = "/convo-9";
    route.params = { id: "convo-9" };
    await nextTick();

    expect(isIncognito.value).toBe(false);
  });

  it("leaves incognito armed while on the incognito screen", async () => {
    const { isIncognito, setIncognito } = useGlobalIncognito();
    const route = fakeRoute("/incognito");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), dockOpen: ref(false) });

    setIncognito(true);
    route.fullPath = "/incognito?initialMessage=hi";
    await nextTick();

    expect(isIncognito.value).toBe(true);
  });

  it("runs immediately: conversation routes set the active scope", () => {
    const route = fakeRoute("/abc123", "abc123");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), dockOpen: ref(false) });

    expect(setActiveConversation).toHaveBeenCalledWith("abc123");
  });

  it("clears the active scope on non-conversation routes", () => {
    const route = fakeRoute("/settings");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), dockOpen: ref(false) });

    expect(setActiveConversation).toHaveBeenCalledWith(null);
  });

  it("discards staging when leaving the new-chat screen", () => {
    const route = fakeRoute("/settings");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), dockOpen: ref(false) });

    expect(clearPendingSetup).toHaveBeenCalled();
  });

  it("keeps staging while navigating between new-chat surfaces", () => {
    const route = fakeRoute("/");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), dockOpen: ref(false) });

    expect(clearPendingSetup).not.toHaveBeenCalled();
  });

  it("reacts to subsequent navigations", async () => {
    const route = fakeRoute("/");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), dockOpen: ref(false) });

    vi.mocked(setActiveConversation).mockClear();
    route.fullPath = "/convo-9";
    route.path = "/convo-9";
    route.params = { id: "convo-9" };
    await nextTick();

    expect(setActiveConversation).toHaveBeenCalledWith("convo-9");
  });

  it("mobile: settings closes both sidebars", () => {
    setViewportWidth(500);
    const sidebarOpen = ref(true);
    const dockOpen = ref(true);
    const route = fakeRoute("/settings");

    useLayoutRouteWatch(route, { sidebarOpen, dockOpen });

    expect(sidebarOpen.value).toBe(false);
    expect(dockOpen.value).toBe(false);
  });

  it("mobile: any projects route closes both sidebars", () => {
    setViewportWidth(500);
    const sidebarOpen = ref(true);
    const dockOpen = ref(true);
    const route = fakeRoute("/projects/my-proj");

    useLayoutRouteWatch(route, { sidebarOpen, dockOpen });

    expect(sidebarOpen.value).toBe(false);
    expect(dockOpen.value).toBe(false);
  });

  it("mobile: chat routes leave the panels alone", () => {
    setViewportWidth(500);
    const sidebarOpen = ref(true);
    const dockOpen = ref(true);
    const route = fakeRoute("/abc", "abc");

    useLayoutRouteWatch(route, { sidebarOpen, dockOpen });

    expect(sidebarOpen.value).toBe(true);
    expect(dockOpen.value).toBe(true);
  });

  it("desktop: full-page destinations never touch the panels", () => {
    setViewportWidth(1400);
    const sidebarOpen = ref(true);
    const dockOpen = ref(true);
    const route = fakeRoute("/settings");

    useLayoutRouteWatch(route, { sidebarOpen, dockOpen });

    expect(sidebarOpen.value).toBe(true);
    expect(dockOpen.value).toBe(true);
  });
});
