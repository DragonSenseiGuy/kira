/**
 * @file conversationMarkdown.js
 * @description Turns one conversation into a Markdown document.
 */

import { getMessagesForBranchPath } from "~/composables/branchManager";

const FALLBACK_TITLE = "Untitled chat";

function attachmentNames(message) {
  return (message.attachments || [])
    .map((file) => file?.filename || file?.name)
    .filter(Boolean);
}

/**
 * Markdown for the branch of a conversation that is currently shown.
 * Tool results and reasoning are left out; attachments are listed by name.
 * @param {{title?: string, messages?: Array, branchPath?: number[]}} conversation
 * @returns {string}
 */
export function conversationToMarkdown(conversation) {
  const title = (conversation?.title || "").replace(/\s+/g, " ").trim() || FALLBACK_TITLE;
  const visible = getMessagesForBranchPath(conversation?.messages || [], conversation?.branchPath || []);
  const sections = [`# ${title}`];

  for (const message of visible) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = typeof message.content === "string" ? message.content.trim() : "";
    const files = message.role === "user" ? attachmentNames(message) : [];
    if (!text && files.length === 0) continue;

    const body = [];
    if (files.length) body.push(files.map((name) => `_Attachment: ${name}_`).join("  \n"));
    if (text) body.push(text);
    sections.push(`## ${message.role === "user" ? "You" : "Kira"}\n\n${body.join("\n\n")}`);
  }

  return sections.join("\n\n") + "\n";
}

/**
 * A safe file name for the export, from the conversation title.
 * @param {string} title
 * @returns {string}
 */
export function markdownFileName(title) {
  const base = (title || "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .slice(0, 80)
    .trim();
  return `${base || "chat"}.md`;
}

/**
 * Downloads a conversation as a Markdown file.
 * @param {{title?: string, messages?: Array, branchPath?: number[]}} conversation
 */
export function downloadConversationMarkdown(conversation) {
  const blob = new Blob([conversationToMarkdown(conversation)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = markdownFileName(conversation?.title);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
