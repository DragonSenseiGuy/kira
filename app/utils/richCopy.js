import { mathSource } from "./mathSource";

/**
 * Builds the HTML put on the clipboard next to a reply's Markdown source, so a
 * paste into a document or an email keeps headings, lists, tables and code.
 *
 * @param {Element[]} elements - The rendered content blocks of one reply.
 * @returns {string} HTML without the page's own controls, or "" if none.
 */
export function clipboardHtml(elements) {
  return elements
    .map((element) => {
      const copy = element.cloneNode(true);
      // Toolbars and buttons only work inside the page.
      copy.querySelectorAll(".code-block-header, button").forEach((node) => node.remove());
      // Rendered math pastes as scrambled glyphs; its TeX source reads better.
      copy.querySelectorAll(".katex").forEach((node) => {
        const tex = mathSource(node);
        if (tex != null) node.replaceWith(copy.ownerDocument.createTextNode(tex));
      });
      return copy.innerHTML.trim();
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Copies text, with an HTML version alongside it where the browser allows.
 * Plain-text targets (editors, terminals) still receive `text`.
 *
 * @param {string} text
 * @param {string} html
 * @param {Clipboard} [clipboard]
 * @param {typeof ClipboardItem} [Item]
 * @returns {Promise<void>}
 */
export async function copyRichText(
  text,
  html,
  clipboard = navigator.clipboard,
  Item = globalThis.ClipboardItem,
) {
  if (html && Item && clipboard.write) {
    try {
      await clipboard.write([
        new Item({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      // Some browsers refuse HTML on the clipboard; plain text still works.
    }
  }
  await clipboard.writeText(text);
}
