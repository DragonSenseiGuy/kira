/**
 * @file responseStyles.js
 * @description Preset writing styles for replies. A style is a short
 * instruction added to the system prompt; "default" adds nothing.
 */

export const DEFAULT_RESPONSE_STYLE = "default";

export const RESPONSE_STYLES = [
  { value: "default", label: "Default", instruction: "" },
  {
    value: "concise",
    label: "Concise",
    instruction:
      "Keep responses short and direct. Lead with the answer, skip preamble and recaps, and leave out detail the user did not ask for. Never shorten code, data or anything the user asked for in full.",
  },
  {
    value: "explanatory",
    label: "Explanatory",
    instruction:
      "Teach as you answer. Explain the reasoning step by step, define terms that may be unfamiliar, and use a short example where it helps understanding.",
  },
  {
    value: "formal",
    label: "Formal",
    instruction:
      "Write in a clear, professional tone suited to business communication. Use complete, well-structured sentences and avoid slang, jokes and emoji.",
  },
];

/**
 * @param {string} value
 * @returns {string} The instruction for a style, or "" for default/unknown.
 */
export function responseStyleInstruction(value) {
  return RESPONSE_STYLES.find((style) => style.value === value)?.instruction || "";
}

/**
 * Settings the system prompt may use. An incognito chat leaves out the
 * user's profile and custom instructions but keeps the writing style,
 * which says nothing about the user.
 */
export function promptSettings(settings, isIncognito) {
  if (!isIncognito) return settings;
  return { response_style: settings?.response_style };
}
