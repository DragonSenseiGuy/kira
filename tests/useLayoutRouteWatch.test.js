/**
 * Tests for app/composables/useLayoutRouteWatch.js — the layout's route
 * side effects, extracted from default.vue.
 *
 * Covers:
 *   - Workspace scope follows the route (conversation id ↔ null)
 *   - New-chat staging is discarded on any non-new-chat navigation
 *   - Incognito is derived from the route (never a stale global flag)
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

// useGlobalIncognito derives its state from useRoute(), which normally needs a
// setup context. Point it at the same fake route object the watcher gets.
let currentRoute = null;
vi.mock("vue-router", () => ({
  useRoute: () => currentRoute,
}));

import { setActiveConversation } from "../app/composables/workspaceSession";
import { clearPendingSetup } from "../app/composables/pendingChatSetup";
import { useGlobalIncognito } from "../app/composables/useGlobalIncognito";
import {
  useLayoutRouteWatch,
  isFullPageDestination,
  isChatStart,
} from "../app/composables/useLayoutRouteWatch";

function setViewportWidth(px) {
  Object.defineProperty(window, "innerWidth", {
    value: px,
    configurable: true,
    writable: true,
  });
}

function fakeRoute(path, id = null) {
  currentRoute = reactive({
    fullPath: id ? `/${id}` : path,
    path,
    params: id ? { id } : {},
  });
  return currentRoute;
}

function navigate(route, path, id = null) {
  route.fullPath = path;
  route.path = path;
  route.params = id ? { id } : {};
}

beforeEach(() => {
  vi.mocked(setActiveConversation).mockClear();
  vi.mocked(clearPendingSetup).mockClear();
  setViewportWidth(1200); // desktop by default
  fakeRoute("/");
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

describe("isChatStart", () => {
  it("classifies the screens where a chat is composed but not yet created", () => {
    expect(isChatStart("/")).toBe(true);
    expect(isChatStart("/new")).toBe(true);
  });

  it("excludes every other route", () => {
    expect(isChatStart("/incognito")).toBe(false);
    expect(isChatStart("/abc123")).toBe(false);
    expect(isChatStart("/settings")).toBe(false);
  });
});

describe("useGlobalIncognito (route-derived)", () => {
  it("is on for the incognito screen regardless of the toggle", () => {
    fakeRoute("/incognito");
    const { isIncognito, setIncognito } = useGlobalIncognito();

    setIncognito(false);
    expect(isIncognito.value).toBe(true);
  });

  it("is off on a stored conversation even when the toggle is armed", () => {
    fakeRoute("/convo-9", "convo-9");
    const { isIncognito, setIncognito } = useGlobalIncognito();

    setIncognito(true);
    expect(isIncognito.value).toBe(false);
  });

  it("follows the toggle on the chat-start surfaces", () => {
    const route = fakeRoute("/");
    const { isIncognito, toggleIncognito } = useGlobalIncognito();

    expect(isIncognito.value).toBe(false);
    toggleIncognito();
    expect(isIncognito.value).toBe(true);

    navigate(route, "/new");
    expect(isIncognito.value).toBe(true);
  });

  it("is off on non-chat routes such as settings", () => {
    fakeRoute("/settings");
    const { isIncognito, setIncognito } = useGlobalIncognito();

    setIncognito(true);
    expect(isIncognito.value).toBe(false);
  });
});

describe("useLayoutRouteWatch", () => {
  // Regression for #17: opening a stored conversation from the sidebar while
  // incognito rendered the incognito welcome, because changeConversation()
  // bailed out on a global flag nothing had cleared.
  it("leaves incognito off and scopes the conversation when one is opened from /incognito", async () => {
    const route = fakeRoute("/incognito");
    const { isIncognito, setIncognito } = useGlobalIncognito();
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), dockOpen: ref(false) });

    setIncognito(true);
    expect(isIncognito.value).toBe(true);

    navigate(route, "/convo-9", "convo-9");
    await nextTick();

    expect(isIncognito.value).toBe(false);
    expect(setActiveConversation).toHaveBeenCalledWith("convo-9");
  });

  it("stays incognito while on the incognito screen", async () => {
    const route = fakeRoute("/incognito");
    const { isIncognito } = useGlobalIncognito();
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), dockOpen: ref(false) });

    route.fullPath = "/incognito?initialMessage=hi";
    await nextTick();

    expect(isIncognito.value).toBe(true);
  });

  it("runs immediately: conversation routes set the active scope", () => {
    const route = fakeRoute("/abc123", "abc123");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), closeDock: vi.fn() });

    expect(setActiveConversation).toHaveBeenCalledWith("abc123");
  });

  it("clears the active scope on non-conversation routes", () => {
    const route = fakeRoute("/settings");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), closeDock: vi.fn() });

    expect(setActiveConversation).toHaveBeenCalledWith(null);
  });

  it("discards staging when leaving the new-chat screen", () => {
    const route = fakeRoute("/settings");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), closeDock: vi.fn() });

    expect(clearPendingSetup).toHaveBeenCalled();
  });

  it("keeps staging while navigating between new-chat surfaces", () => {
    const route = fakeRoute("/");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), closeDock: vi.fn() });

    expect(clearPendingSetup).not.toHaveBeenCalled();
  });

  it("reacts to subsequent navigations", async () => {
    const route = fakeRoute("/");
    useLayoutRouteWatch(route, { sidebarOpen: ref(true), closeDock: vi.fn() });

    vi.mocked(setActiveConversation).mockClear();
    navigate(route, "/convo-9", "convo-9");
    await nextTick();

    expect(setActiveConversation).toHaveBeenCalledWith("convo-9");
  });

  it("mobile: settings closes both sidebars", () => {
    setViewportWidth(500);
    const sidebarOpen = ref(true);
    const closeDock = vi.fn();
    const route = fakeRoute("/settings");

    useLayoutRouteWatch(route, { sidebarOpen, closeDock });

    expect(sidebarOpen.value).toBe(false);
    expect(closeDock).toHaveBeenCalled();
  });

  it("mobile: any projects route closes both sidebars", () => {
    setViewportWidth(500);
    const sidebarOpen = ref(true);
    const closeDock = vi.fn();
    const route = fakeRoute("/projects/my-proj");

    useLayoutRouteWatch(route, { sidebarOpen, closeDock });

    expect(sidebarOpen.value).toBe(false);
    expect(closeDock).toHaveBeenCalled();
  });

  it("mobile: chat routes leave the panels alone", () => {
    setViewportWidth(500);
    const sidebarOpen = ref(true);
    const closeDock = vi.fn();
    const route = fakeRoute("/abc", "abc");

    useLayoutRouteWatch(route, { sidebarOpen, closeDock });

    expect(sidebarOpen.value).toBe(true);
    expect(closeDock).not.toHaveBeenCalled();
  });

  it("desktop: full-page destinations never touch the panels", () => {
    setViewportWidth(1400);
    const sidebarOpen = ref(true);
    const closeDock = vi.fn();
    const route = fakeRoute("/settings");

    useLayoutRouteWatch(route, { sidebarOpen, closeDock });

    expect(sidebarOpen.value).toBe(true);
    expect(closeDock).not.toHaveBeenCalled();
  });
});
