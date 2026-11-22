/**
 * Editing a message and regenerating a reply in incognito.
 *
 * Both create a branch. Incognito used to show every message regardless of
 * branch, so they must now follow the in-memory branch path there too, while
 * still writing nothing to storage.
 *
 * No model is selected, so each send ends at once with the
 * "No AI model selected" reply instead of calling a model.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

const incognito = ref(true);
const store = vi.hoisted(() => ({
  createConversation: vi.fn(async () => "c1"),
  storeMessages: vi.fn(async () => {}),
  deleteConversation: vi.fn(async () => {}),
  updateBranchPath: vi.fn(async () => {}),
  loadConversation: vi.fn(async () => null),
}));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: "/incognito" }) }));
vi.mock("~/composables/storeConversations", () => store);
vi.mock("~/composables/useGlobalIncognito", () => ({
  useGlobalIncognito: () => ({ isIncognito: incognito, setIncognito: vi.fn(), toggleIncognito: vi.fn() }),
}));
vi.mock("~/composables/useSettings", () => ({
  useSettings: () => ({ settings: {}, selectedModel: null, getModelSetting: () => null }),
}));
vi.mock("~/composables/providers", async (importOriginal) => ({
  ...(await importOriginal()),
  resolveChatTarget: () => ({ direct: true, apiKey: "" }),
}));
vi.mock("~/composables/workspaceSession", () => ({
  setActiveConversation: vi.fn(),
  getActiveConversation: vi.fn(),
  deleteChatWorkspace: vi.fn(),
}));
vi.mock("~/composables/message", () => ({ handleIncomingMessage: vi.fn() }));

import { useMessagesManager } from "~/composables/messagesManager";

/** Adds a user turn and its (error) reply, the way the pages do. */
async function ask(manager, text) {
  await manager.sendMessage(text);
}

const visible = (manager) => manager.visibleMessages.value.map((m) => [m.role, m.role === "user" ? m.content : "reply"]);

beforeEach(() => {
  incognito.value = true;
  Object.values(store).forEach((fn) => fn.mockClear());
});

describe("branching in incognito", () => {
  it("shows only the edited message's branch, and lets the old one be reached", async () => {
    const manager = useMessagesManager(ref(null));
    await ask(manager, "first");
    await ask(manager, "second");
    const second = manager.visibleMessages.value.find((m) => m.content === "second");

    await manager.editUserMessage(second.id, "second, edited");

    expect(visible(manager)).toEqual([
      ["user", "first"],
      ["assistant", "reply"],
      ["user", "second, edited"],
      ["assistant", "reply"],
    ]);
    const edited = manager.visibleMessages.value.find((m) => m.content === "second, edited");
    expect(manager.branchInfo.value.get(edited.id)).toMatchObject({ current: 1, total: 2 });

    await manager.navigateBranch(edited.id, -1);
    expect(visible(manager).map(([, text]) => text)).toContain("second");
    expect(visible(manager).map(([, text]) => text)).not.toContain("second, edited");
  });

  it("shows only the regenerated reply", async () => {
    const manager = useMessagesManager(ref(null));
    await ask(manager, "first");
    const reply = manager.visibleMessages.value.at(-1);

    await manager.regenerateAssistantMessage(reply.id);

    expect(visible(manager)).toEqual([
      ["user", "first"],
      ["assistant", "reply"],
    ]);
    const regenerated = manager.visibleMessages.value.at(-1);
    expect(regenerated.id).not.toBe(reply.id);
    expect(manager.branchInfo.value.get(regenerated.id)).toMatchObject({ current: 1, total: 2 });
  });

  it("continues the conversation from the branch on screen", async () => {
    const manager = useMessagesManager(ref(null));
    await ask(manager, "first");
    const first = manager.visibleMessages.value[0];
    await manager.editUserMessage(first.id, "first, edited");

    await ask(manager, "follow up");

    expect(visible(manager).filter(([role]) => role === "user")).toEqual([
      ["user", "first, edited"],
      ["user", "follow up"],
    ]);
  });

  it("stays on the original question when its reply is regenerated after an edit", async () => {
    const manager = useMessagesManager(ref(null));
    await ask(manager, "first");
    const first = manager.visibleMessages.value[0];
    await manager.editUserMessage(first.id, "first, edited");
    await manager.navigateBranch(manager.visibleMessages.value[0].id, -1);
    expect(visible(manager)[0]).toEqual(["user", "first"]);

    await manager.regenerateAssistantMessage(manager.visibleMessages.value.at(-1).id);
    expect(visible(manager)).toEqual([
      ["user", "first"],
      ["assistant", "reply"],
    ]);

    await ask(manager, "follow up");
    expect(visible(manager).filter(([role]) => role === "user")).toEqual([
      ["user", "first"],
      ["user", "follow up"],
    ]);
  });

  it("writes nothing to storage", async () => {
    const manager = useMessagesManager(ref(null));
    await ask(manager, "first");
    const first = manager.visibleMessages.value[0];
    await manager.editUserMessage(first.id, "first, edited");
    await manager.regenerateAssistantMessage(manager.visibleMessages.value.at(-1).id);
    await manager.navigateBranch(manager.visibleMessages.value[0].id, -1);

    Object.values(store).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
});
