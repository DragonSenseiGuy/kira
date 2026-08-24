/**
 * Tests for app/composables/systemPrompt.js — assembly behavior.
 *
 * Regression focus:
 *   - Sections are joined with REAL newlines (a past bug joined them with
 *     literal "\n" text, flattening the whole prompt onto one line)
 *   - The code-sandbox awareness module appears only when sandbox tools
 *     are offered
 */

import { describe, it, expect } from "vitest";
import { generateSystemPrompt } from "../app/composables/systemPrompt.js";

const SANDBOX_TOOLS = ["run_javascript", "write_file", "read_file", "list_files"];

describe("generateSystemPrompt", () => {
  it("joins sections with real newlines, not literal backslash-n text", async () => {
    const prompt = await generateSystemPrompt([], {}, false, true);
    expect(prompt).toContain("\n\n");
    expect(prompt).not.toContain("\\n\\n");
    expect(prompt).toMatch(/^You are Libre,/);
  });

  it("includes sandbox awareness when code tools are offered", async () => {
    const withTools = await generateSystemPrompt(SANDBOX_TOOLS, {}, false, true);
    expect(withTools).toContain("Sandbox and workspace");
    expect(withTools).toContain("run_javascript");

    const withoutTools = await generateSystemPrompt(
      ["search", "getPageContents"],
      {},
      false,
      true,
    );
    expect(withoutTools).not.toContain("Sandbox and workspace");
    expect(withoutTools).toContain("Web Search and Page Crawling");
  });

  it("omits tool sections entirely when tool use is unsupported", async () => {
    const prompt = await generateSystemPrompt(SANDBOX_TOOLS, {}, false, false);
    expect(prompt).not.toContain("Sandbox and workspace");
    expect(prompt).not.toContain("Web Search and Page Crawling");
  });

  it("lists every offered tool by name in the tools section", async () => {
    const names = ["search", ...SANDBOX_TOOLS];
    const prompt = await generateSystemPrompt(names, {}, false, true);
    for (const name of names) {
      expect(prompt).toContain(name);
    }
  });

  it("places custom instructions last", async () => {
    const prompt = await generateSystemPrompt([], { custom_instructions: "ALWAYS ANSWER IN FRENCH" }, false, true);
    expect(prompt).toContain("Important User Instructions");
    expect(prompt.trimEnd().endsWith("ALWAYS ANSWER IN FRENCH")).toBe(true);
  });
});


