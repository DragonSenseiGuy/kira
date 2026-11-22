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
import { RESPONSE_STYLES, responseStyleInstruction, promptSettings } from "../app/utils/responseStyles.js";

const SANDBOX_TOOLS = ["run_javascript", "write_file", "read_file", "list_files"];

describe("generateSystemPrompt", () => {
  it("joins sections with real newlines, not literal backslash-n text", async () => {
    const prompt = await generateSystemPrompt([], {}, false, true);
    expect(prompt).toContain("\n\n");
    expect(prompt).not.toContain("\\n\\n");
    expect(prompt).toMatch(/^You are Kira,/);
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
  it("adds no style section by default or for an unknown style", async () => {
    for (const response_style of [undefined, null, "default", "pirate"]) {
      expect(await generateSystemPrompt([], { response_style }, false, true)).not.toContain("### Response Style");
    }
  });

  it("adds the chosen response style", async () => {
    for (const style of RESPONSE_STYLES.filter((s) => s.value !== "default")) {
      const prompt = await generateSystemPrompt([], { response_style: style.value }, false, true);
      expect(prompt).toContain(`### Response Style\n${style.instruction}`);
    }
  });

  it("keeps custom instructions after the response style", async () => {
    const prompt = await generateSystemPrompt([], { response_style: "concise", custom_instructions: "ANSWER IN FRENCH" }, false, true);
    expect(prompt.indexOf("### Response Style")).toBeGreaterThan(-1);
    expect(prompt.indexOf("### Response Style")).toBeLessThan(prompt.indexOf("Important User Instructions"));
    expect(prompt.trimEnd().endsWith("ANSWER IN FRENCH")).toBe(true);
  });

  it("offers Default first and gives every other style an instruction", () => {
    expect(RESPONSE_STYLES[0]).toMatchObject({ value: "default", instruction: "" });
    expect(RESPONSE_STYLES.slice(1).every((s) => s.label && s.instruction.length > 20)).toBe(true);
    expect(responseStyleInstruction("concise")).toBe(RESPONSE_STYLES[1].instruction);
  });
});

describe("promptSettings", () => {
  const settings = {
    user_name: "Zelda",
    occupation: "Cartographer",
    custom_instructions: "Call me captain",
    global_memory_enabled: true,
    response_style: "concise",
  };

  it("passes the settings through for a normal chat", () => {
    expect(promptSettings(settings, false)).toBe(settings);
  });

  it("keeps only the response style in incognito", async () => {
    expect(promptSettings(settings, true)).toEqual({ response_style: "concise" });
    const prompt = await generateSystemPrompt([], promptSettings(settings, true), true);
    expect(prompt).toContain("### Response Style");
    expect(prompt).not.toContain("Zelda");
    expect(prompt).not.toContain("Cartographer");
    expect(prompt).not.toContain("captain");
  });
});
