/**
 * Mount tests for app/components/MessageForm.vue — @mention behavior.
 *
 * Focus:
 *   - The autocomplete popover renders INSIDE .textarea-stack (anchored to
 *     the typing line — a regression here means it drifted back to floating
 *     above the whole composer)
 *   - The list refilters live as you type (reactive query)
 *   - Enter picks the highlighted file into the input
 *
 * Heavy dependency surface is mocked; mentions helpers stay real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

vi.mock("@iconify/vue", () => ({
  Icon: {
    name: "Icon",
    props: ["icon", "width", "height"],
    template: "<span class='icon-stub' />",
  },
}));

// Passthrough stubs — the feature buttons aren't under test.
vi.mock("reka-ui", () => {
  const passthrough = { template: "<div><slot /></div>" };
  return {
    DropdownMenuRoot: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuItem: passthrough,
    PopoverRoot: passthrough,
    PopoverTrigger: passthrough,
    PopoverContent: passthrough,
  };
});

vi.mock("~/composables/useKeybinds", () => ({ useKeybinds: vi.fn() }));

vi.mock("~/composables/useDraftPrompt", () => ({
  useDraftPrompt: () => ({ clearDraft: vi.fn(async () => {}) }),
}));

vi.mock("~/composables/useAttachments", async () => {
  const { ref, computed } = await import("vue");
  const attachments = ref([]);
  return {
    // The composable itself must stay synchronous — only the mock factory
    // awaits its vue import.
    useAttachments: () => ({
      attachments,
      error: ref(""),
      hasAttachments: computed(() => attachments.value.length > 0),
      addFile: vi.fn(async () => {}),
      removeAttachment: vi.fn(),
      clearAttachments: vi.fn(),
      clearError: vi.fn(),
    }),
  };
});

vi.mock("~/components/Logo.vue", () => ({
  default: { template: "<span class='logo-stub' />" },
}));

vi.mock("~/components/BottomSheetModelSelector.vue", () => ({
  default: { template: "<div class='bms-stub' />" },
}));

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
  deleteEntry: vi.fn(),
  renameEntry: vi.fn(),
  detachProject: vi.fn(),
  attachProject: vi.fn(),
  createProject: vi.fn(),
  uploadFiles: vi.fn(),
  downloadAllZip: vi.fn(),
  closePreview: vi.fn(),
  readEntryText: vi.fn(async (path) => `contents of ${path}`),
};

vi.mock("~/composables/useWorkspaceBrowser", () => ({
  useWorkspaceBrowser: () => wb,
}));

// ResizeObserver isn't in happy-dom.
globalThis.ResizeObserver = globalThis.ResizeObserver || class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

import MessageForm from "~/components/MessageForm.vue";

function mountForm() {
  return mount(MessageForm, {
    props: {
      isLoading: false,
      selectedModelId: "",
      availableModels: [],
      settingsManager: { settings: {}, saveSettings: vi.fn() },
      selectedModelName: "Test Model",
      conversationId: "",
    },
  });
}

/** Types text into the textarea with the caret at the end, firing input. */
async function type(wrapper, text) {
  const ta = wrapper.find("textarea");
  ta.element.value = text;
  const caret = text.length;
  ta.element.setSelectionRange(caret, caret);
  await ta.trigger("input");
  return ta;
}

beforeEach(() => {
  wb.available.value = true;
  wb.chatFiles.value = [];
  wb.projectFiles.value = {};
  wb.error.value = "";
});

describe("MessageForm — @mention autocomplete", () => {
  it("renders the popover inside .textarea-stack (typing-line anchor)", async () => {
    wb.chatFiles.value = [{ path: "notes.md", size: 3 }];
    const wrapper = mountForm();
    const ta = await type(wrapper, "@");

    expect(wrapper.find(".mention-pop").exists()).toBe(true);
    const pop = wrapper.find(".mention-pop").element;
    expect(pop.parentElement.classList.contains("textarea-stack")).toBe(true);
    wrapper.unmount();
  });

  it("refilters the list on every keystroke", async () => {
    wb.chatFiles.value = [
      { path: "notes.md", size: 3 },
      { path: "data/words.csv", size: 4 },
    ];
    const wrapper = mountForm();

    let ta = await type(wrapper, "@");
    await flushPromises();
    expect(wrapper.findAll(".mention-item")).toHaveLength(2);

    ta = await type(wrapper, "@w");
    await flushPromises();
    const paths = wrapper.findAll(".mention-item").map((n) => n.text());
    expect(paths).toEqual(["data/words.csv"]);

    ta = await type(wrapper, "@zzz");
    await flushPromises();
    expect(wrapper.find(".mention-pop").exists()).toBe(false);
    wrapper.unmount();
  });

  it("Enter picks the highlighted file into the input", async () => {
    wb.chatFiles.value = [{ path: "data/words.csv", size: 4 }];
    const wrapper = mountForm();

    const ta = await type(wrapper, "@da");
    await flushPromises();
    await ta.trigger("keydown.enter");
    await flushPromises();

    expect(wrapper.find("textarea").element.value).toBe("@data/words.csv ");
    // Picker closed after selection.
    expect(wrapper.find(".mention-pop").exists()).toBe(false);
    wrapper.unmount();
  });
});
