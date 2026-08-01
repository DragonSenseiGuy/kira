/**
 * Tests for app/composables/commandPalette.js
 *
 * The palette component renders exactly what `buildPaletteItems` returns, so
 * these tests cover the parts users actually feel: prefix modes, which
 * sections appear when, per-section caps, and the wrap-around keyboard cursor.
 */

import { describe, it, expect } from "vitest";
import {
  parsePaletteQuery,
  buildPaletteItems,
  moveActiveIndex,
  clampActiveIndex,
  PALETTE_PREFIXES,
} from "../app/composables/commandPalette.js";

const commands = [
  { id: "new-chat", label: "New chat", keywords: ["start", "conversation"] },
  { id: "toggle-sidebar", label: "Hide sidebar", keywords: ["drawer"] },
  { id: "toggle-theme", label: "Switch to dark theme", keywords: ["appearance"] },
  { id: "open-settings", label: "Open settings", keywords: ["preferences"] },
  { id: "open-notepad", label: "Open Notepad", keywords: ["memory"] },
  { id: "export-chat", label: "Export this chat", keywords: ["zip"] },
  { id: "incognito", label: "Start incognito chat", keywords: ["private"] },
  { id: "params", label: "Show parameters", keywords: ["temperature"] },
];

const conversations = [
  { id: "c1", title: "Rust ownership", lastUpdated: "2026-01-02T00:00:00.000Z" },
  { id: "c2", title: "Dinner ideas", lastUpdated: "2026-01-03T00:00:00.000Z" },
  { id: "c3", title: "Travel plans", lastUpdated: "2026-01-04T00:00:00.000Z" },
];

const messageResults = [
  {
    conversationId: "c1",
    conversationTitle: "Rust ownership",
    messageId: "m1",
    role: "assistant",
    score: 12,
    snippet: { text: "ownership means one owner", ranges: [{ start: 0, end: 9 }] },
  },
];

describe("parsePaletteQuery", () => {
  it("defaults to searching everything", () => {
    expect(parsePaletteQuery("rust")).toEqual({ mode: "all", term: "rust" });
  });

  it("treats an empty input as an empty all-mode query", () => {
    expect(parsePaletteQuery("")).toEqual({ mode: "all", term: "" });
    expect(parsePaletteQuery(null)).toEqual({ mode: "all", term: "" });
  });

  it("maps each prefix to its section", () => {
    expect(parsePaletteQuery(">new").mode).toBe("commands");
    expect(parsePaletteQuery("@rust").mode).toBe("chats");
    expect(parsePaletteQuery("#pelican").mode).toBe("messages");
  });

  it("strips the prefix from the term", () => {
    expect(parsePaletteQuery(">  new chat ").term).toBe("new chat");
  });

  it("allows a bare prefix with no term", () => {
    expect(parsePaletteQuery(">")).toEqual({ mode: "commands", term: "" });
  });

  it("trims surrounding whitespace", () => {
    expect(parsePaletteQuery("  rust  ").term).toBe("rust");
  });

  it("exposes its prefix table so the UI can document the modes", () => {
    expect(PALETTE_PREFIXES).toEqual({
      ">": "commands",
      "@": "chats",
      "#": "messages",
    });
  });
});

describe("buildPaletteItems", () => {
  it("shows commands and recent chats before anything is typed", () => {
    const { sections } = buildPaletteItems({ commands, conversations, query: "" });
    const keys = sections.map((s) => s.key);

    expect(keys).toContain("commands");
    expect(keys).toContain("chats");
    expect(keys).not.toContain("messages");
  });

  it("labels the idle chat section as recent", () => {
    const { sections } = buildPaletteItems({ commands, conversations, query: "" });
    expect(sections.find((s) => s.key === "chats").label).toBe("Recent chats");
  });

  it("includes message results once a term is typed", () => {
    const { sections } = buildPaletteItems({
      commands,
      conversations,
      messageResults,
      query: "ownership",
    });
    expect(sections.map((s) => s.key)).toContain("messages");
  });

  it("matches commands on their keywords, not just their labels", () => {
    const { flat } = buildPaletteItems({ commands, query: ">temperature" });
    expect(flat.map((row) => row.command.id)).toContain("params");
  });

  it("only highlights label characters, never keyword characters", () => {
    const { flat } = buildPaletteItems({ commands, query: ">temperature" });
    const row = flat.find((r) => r.command.id === "params");

    for (const position of row.positions) {
      expect(position).toBeLessThan(row.command.label.length);
    }
  });

  it("restricts to a single section when a prefix is used", () => {
    expect(
      buildPaletteItems({ commands, conversations, messageResults, query: "@rust" })
        .sections.map((s) => s.key),
    ).toEqual(["chats"]);
  });

  it("shows nothing in message mode until a term is typed", () => {
    expect(buildPaletteItems({ commands, conversations, messageResults, query: "#" }).sections)
      .toEqual([]);
  });

  it("shows the full command list for a bare > prefix", () => {
    const { flat } = buildPaletteItems({ commands, query: ">" });
    expect(flat).toHaveLength(commands.length);
  });

  it("caps each section in mixed mode", () => {
    const manyConversations = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      title: `Chat about cats ${i}`,
    }));
    const { sections } = buildPaletteItems({
      commands,
      conversations: manyConversations,
      query: "cat",
    });
    expect(sections.find((s) => s.key === "chats").items.length).toBeLessThanOrEqual(5);
  });

  it("omits sections that have no matches", () => {
    const { sections } = buildPaletteItems({
      commands,
      conversations,
      query: "zzzzzz",
    });
    expect(sections).toEqual([]);
  });

  it("flattens rows in section order with sequential indices", () => {
    const { flat } = buildPaletteItems({ commands, conversations, query: "" });

    expect(flat.map((row) => row.index)).toEqual(flat.map((_, i) => i));
    const firstChat = flat.findIndex((row) => row.kind === "chat");
    const lastCommand = flat.map((row) => row.kind).lastIndexOf("command");
    expect(lastCommand).toBeLessThan(firstChat);
  });

  it("gives every row a stable unique key", () => {
    const { flat } = buildPaletteItems({
      commands,
      conversations,
      messageResults,
      query: "o",
    });
    const keys = flat.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("tags each row with its section", () => {
    const { flat } = buildPaletteItems({ commands, conversations, query: "" });
    expect(flat.every((row) => typeof row.sectionKey === "string")).toBe(true);
  });

  it("tolerates being called with no data at all", () => {
    expect(buildPaletteItems()).toEqual({
      mode: "all",
      term: "",
      sections: [],
      flat: [],
    });
  });
});

describe("moveActiveIndex", () => {
  it("moves down", () => {
    expect(moveActiveIndex(0, 1, 3)).toBe(1);
  });

  it("wraps past the end", () => {
    expect(moveActiveIndex(2, 1, 3)).toBe(0);
  });

  it("wraps before the start", () => {
    expect(moveActiveIndex(0, -1, 3)).toBe(2);
  });

  it("selects the first row when moving down from no selection", () => {
    expect(moveActiveIndex(-1, 1, 3)).toBe(0);
  });

  it("selects the last row when moving up from no selection", () => {
    expect(moveActiveIndex(-1, -1, 3)).toBe(2);
  });

  it("returns -1 when there is nothing to select", () => {
    expect(moveActiveIndex(0, 1, 0)).toBe(-1);
  });
});

describe("clampActiveIndex", () => {
  it("keeps a valid index", () => {
    expect(clampActiveIndex(1, 3)).toBe(1);
  });

  it("clamps an index that fell off the end", () => {
    expect(clampActiveIndex(9, 3)).toBe(2);
  });

  it("returns -1 for an empty list", () => {
    expect(clampActiveIndex(2, 0)).toBe(-1);
  });

  it("normalises a negative index", () => {
    expect(clampActiveIndex(-1, 3)).toBe(0);
  });
});
