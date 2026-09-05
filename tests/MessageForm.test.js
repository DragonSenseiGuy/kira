/**
 * Mount tests for app/components/MessageForm.vue — @mention behavior.
 *
 * Focus:
 *   - The autocomplete popover renders INSIDE .textarea-stack (anchored to
 *     the typing line — a regression here means it drifted back to floating
 *     above the whole composer)
 *   - The list refilters live as you type (reactive query)
 *   - Enter picks the highlighted file into the input
 *   - IME composition (mobile keyboards): reactive state stays in sync while
 *     composing so the send button enables and native text never hides
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
    PopoverPortal: passthrough,
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
      models: [],
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

describe("MessageForm — mobile IME composition", () => {
  /**
   * Simulates a mobile soft keyboard word: compositionstart, value edits,
   * input events (which Vue's v-model ignores while composing).
   */
  async function compose(ta, text) {
    ta.element.value = text;
    await ta.trigger("compositionstart");
    await ta.trigger("input");
  }

  it("keeps reactive state in sync mid-composition so the send button enables", async () => {
    const wrapper = mountForm();
    const ta = wrapper.find("textarea");

    expect(wrapper.find(".send-btn").element.disabled).toBe(true);

    // A composed (not yet committed) word must already enable the button —
    // on mobile every word is a composition until space/punctuation.
    await compose(ta, "hello wor");

    expect(wrapper.find(".send-btn").element.disabled).toBe(false);
    wrapper.unmount();
  });

  it("never hides native text while composing, even with mention chips present", async () => {
    wb.chatFiles.value = [{ path: "notes.md", size: 3 }];
    const wrapper = mountForm();

    // Committed mention → chip mirror engaged (textarea glyphs transparent).
    const ta = await type(wrapper, "@notes.md ");
    await flushPromises();
    expect(wrapper.find(".chat-mirror").exists()).toBe(true);
    expect(ta.classes()).toContain("text-hidden");

    // Mid-composition → mirror suppressed so the composing word is visible.
    ta.element.value = "@notes.md wor";
    await ta.trigger("compositionstart");
    await ta.trigger("input");
    await flushPromises();
    expect(wrapper.find(".chat-mirror").exists()).toBe(false);
    expect(wrapper.find("textarea").classes()).not.toContain("text-hidden");

    // Composition commits (space) → chips render again.
    ta.element.value = "@notes.md world ";
    await ta.trigger("compositionend");
    await ta.trigger("input");
    await flushPromises();
    expect(wrapper.find(".chat-mirror").exists()).toBe(true);
    expect(wrapper.find("textarea").classes()).toContain("text-hidden");
    wrapper.unmount();
  });

  it("plain text without mentions never engages the transparency layer", async () => {
    const wrapper = mountForm();
    const ta = await type(wrapper, "just some words");
    await flushPromises();
    expect(wrapper.find(".chat-mirror").exists()).toBe(false);
    expect(ta.classes()).not.toContain("text-hidden");
    wrapper.unmount();
  });
});
