/**
 * Mount tests for ~/components/WorkspacePanel.vue (Workspace dock).
 *
 * Focus on the logic that regressed during development:
 *   - Gallery/Tree view toggle + localStorage persistence
 *   - Preview⇄Code toggle only appears for renderable kinds (html/md/svg)
 *   - New-chat staging UI (attach projects / staged list / remove)
 *   - Delete flows route through the in-app confirm dialog, never window.confirm
 *
 * The workspace browser composable is mocked; dialogs and staging use the
 * real singletons.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

// Iconify fetches icon data over the network at render; stub it.
vi.mock("@iconify/vue", () => ({
  Icon: {
    name: "Icon",
    props: ["icon", "width", "height", "class"],
    template: "<span class='icon-stub' />",
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("~/composables/useGlobalIncognito", async () => {
  const { ref } = await import("vue");
  return { useGlobalIncognito: () => ({ isIncognito: ref(false) }) };
});

// The workspace browser is the dock's data backbone — full mock.
const wb = {
  available: ref(true),
  loading: ref(false),
  error: ref(""),
  chatFiles: ref([]),
  projectFiles: ref({}),
  library: ref([]),
  preview: ref(null),
  formatBytes: (n) => `${n} B`,
  refresh: vi.fn(),
  openPreview: vi.fn(),
  downloadFile: vi.fn(),
  deleteEntry: vi.fn(async () => ({})),
  renameEntry: vi.fn(async () => ({})),
  detachProject: vi.fn(),
  attachProject: vi.fn(),
  createProject: vi.fn(async () => {}),
  uploadFiles: vi.fn(),
  downloadAllZip: vi.fn(),
  closePreview: vi.fn(),
  readEntryText: vi.fn(async () => ""),
};

vi.mock("~/composables/useWorkspaceBrowser", () => ({
  useWorkspaceBrowser: () => wb,
}));

import WorkspacePanel from "~/components/WorkspacePanel.vue";
import {
  useDialogState,
  settleDialog,
} from "../app/composables/useDialogs";
import {
  clearPendingSetup,
  usePendingChatSetup,
} from "../app/composables/pendingChatSetup";

// ResizeObserver isn't implemented in happy-dom.
class RO {
  observe() {}
  disconnect() {}
  unobserve() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver || RO;

const dialogState = useDialogState();
const pending = usePendingChatSetup();

function drainDialogs() {
  let guard = 0;
  while (dialogState.current && guard++ < 10) settleDialog(false);
  dialogState.current = null;
}

function mountDock() {
  return mount(WorkspacePanel, {
    props: {
      isOpen: true,
      settingsManager: { settings: {}, saveSettings: vi.fn() },
      sidebarOpen: false,
    },
  });
}

beforeEach(() => {
  drainDialogs();
  clearPendingSetup();
  localStorage.removeItem("workspace-dock-view");
  wb.available.value = true;
  wb.chatFiles.value = [];
  wb.projectFiles.value = {};
  wb.library.value = [];
  wb.preview.value = null;
  wb.error.value = "";
  vi.mocked(wb.deleteEntry).mockClear();
  vi.mocked(wb.openPreview).mockClear();
});

describe("Workspace dock — layout toggle", () => {
  it("shows item count and defaults to the gallery view", () => {
    wb.chatFiles.value = [
      { path: "b.md", size: 5 },
      { path: "a.csv", size: 2 },
    ];
    const wrapper = mountDock();

    expect(wrapper.text()).toContain("2 items");
    expect(wrapper.find(".fp-seg").exists()).toBe(true);
    expect(wrapper.findAll(".ws-card")).toHaveLength(2);
    // Gallery is flat + name-sorted: a.csv first despite b.md being first.
    expect(wrapper.findAll(".ws-card")[0].text()).toContain("a.csv");
    wrapper.unmount();
  });

  it("persists the tree view choice to localStorage", async () => {
    wb.chatFiles.value = [{ path: "x.txt", size: 1 }];
    const wrapper = mountDock();

    const treeBtn = wrapper.findAll(".seg-btn").find((b) => b.text() === "Tree");
    await treeBtn.trigger("click");

    expect(localStorage.getItem("workspace-dock-view")).toBe("tree");
    // Tree rows render instead of cards.
    expect(wrapper.findAll(".ws-card")).toHaveLength(0);
    expect(wrapper.findAll(".fp-row").length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it("restores a previously persisted tree view on mount", () => {
    localStorage.setItem("workspace-dock-view", "tree");
    wb.chatFiles.value = [{ path: "x.txt", size: 1 }];
    const wrapper = mountDock();

    expect(wrapper.findAll(".ws-card")).toHaveLength(0);
    wrapper.unmount();
  });
});

describe("Workspace dock — preview header", () => {
  it("offers Preview/Code only for renderable kinds (md/html), not text", async () => {
    wb.preview.value = { displayPath: "notes.txt", kind: "text", content: "plain" };
    const wrapper = mountDock();
    await flushPromises();

    expect(wrapper.find(".pc-preview").exists()).toBe(true);
    expect(wrapper.find(".pc-preview .fp-seg").exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows the toggle for markdown and switches to raw source", async () => {
    wb.preview.value = {
      displayPath: "notes.md",
      kind: "md",
      content: "# hello",
    };
    const wrapper = mountDock();
    await flushPromises();

    const seg = wrapper.find(".pc-preview .fp-seg");
    expect(seg.exists()).toBe(true);

    const codeBtn = seg.findAll("button").find((b) => b.text() === "Code");
    await codeBtn.trigger("click");
    await flushPromises();

    // Raw source shown instead of rendered markdown.
    expect(wrapper.find(".pc-preview .pc-code").text()).toContain("# hello");
    wrapper.unmount();
  });

  it("back button closes the preview", async () => {
    wb.preview.value = { displayPath: "x.md", kind: "md", content: "hi" };
    const wrapper = mountDock();
    await flushPromises();

    const back = wrapper.find(".pc-preview-head button[aria-label='Back to workspace']");
    await back.trigger("click");
    expect(wb.closePreview).toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe("Workspace dock — delete flow", () => {
  it("routes deletion through the in-app confirm dialog", async () => {
    wb.chatFiles.value = [{ path: "doomed.txt", size: 3 }];
    const wrapper = mountDock();

    // Card actions render on hover via CSS but exist in the DOM.
    const del = wrapper
      .findAll(".ws-card button")
      .find((b) => b.attributes("title") === "Delete");
    await del.trigger("click");
    await flushPromises();

    expect(dialogState.current).toMatchObject({ kind: "confirm", danger: true });
    expect(wrapper.text()).toContain("doomed.txt");

    settleDialog(true);
    await flushPromises();

    expect(wb.deleteEntry).toHaveBeenCalledWith("doomed.txt");
    wrapper.unmount();
  });

  it("cancelling the dialog leaves the file alone", async () => {
    wb.chatFiles.value = [{ path: "keeper.txt", size: 3 }];
    const wrapper = mountDock();

    const del = wrapper
      .findAll(".ws-card button")
      .find((b) => b.attributes("title") === "Delete");
    await del.trigger("click");
    await flushPromises();

    settleDialog(false);
    await flushPromises();

    expect(wb.deleteEntry).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe("Workspace dock — new-chat staging", () => {
  it("shows staging UI when no chat is open", () => {
    wb.available.value = false;
    wb.library.value = [{ name: "alpha", files: 2, bytes: 10, attached: false }];
    const wrapper = mountDock();

    expect(wrapper.text()).toContain("New chat setup");
    // Structural anchor (copy may be reworded): the empty-state hint renders.
    expect(wrapper.find(".fp-empty").exists()).toBe(true);
    wrapper.unmount();
  });

  it("attaching a project from the footer stages it for the next chat", async () => {
    wb.available.value = false;
    wb.library.value = [{ name: "alpha", files: 2, bytes: 10, attached: false }];
    const wrapper = mountDock();

    // Projects panel auto-opens in staging mode; click its attach button.
    const attach = wrapper
      .findAll(".proj-panel button")
      .find((b) => b.attributes("title") === "Attach to your next chat");
    expect(attach).toBeTruthy();
    await attach.trigger("click");

    expect(pending.hasPending()).toBe(true);
    await flushPromises();

    // Staged summary section appears with the project name.
    expect(wrapper.text()).toContain("Staged for your next chat");
    const stagedRows = wrapper.findAll(".fp-row.lib");
    expect(stagedRows.some((r) => r.text().includes("alpha"))).toBe(true);
    wrapper.unmount();
  });

  it("staged files can be removed before the chat starts", async () => {
    wb.available.value = false;
    pending.stageFiles([{ name: "data.csv", size: 12, text: async () => "x" }]);

    const wrapper = mountDock();
    await flushPromises();

    const removeBtn = wrapper
      .findAll("button")
      .find((b) => b.attributes("title") === "Remove file");
    expect(removeBtn).toBeTruthy();
    await removeBtn.trigger("click");

    expect(pending.hasPending()).toBe(false);
    wrapper.unmount();
  });
});

