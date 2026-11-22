// Every piece of rendered Markdown passes through here before it reaches the
// page. Markdown may contain raw HTML, and it comes from model replies, web
// pages, attached files and imported chats, none of which may run script in
// Kira or imitate its interface.
import createDOMPurify from "dompurify";

// The only inline handlers that survive, and only on a <button>: the calls the
// code-block and table toolbars are rendered with. A renderer that adds a new
// toolbar button must add its handler here.
export const ALLOWED_INLINE_HANDLERS = new Set([
  "window.copyCode(event.currentTarget)",
  "window.downloadCode(event.currentTarget)",
  "window.copyTable(event.currentTarget)",
  "window.downloadTable(event.currentTarget)",
  "window.togglePreview(event.currentTarget)",
]);

// Inline styles are kept for KaTeX, which lays out formulas with them. Only
// sizing, spacing and colour survive, so a style cannot lift an element out of
// the message or load anything.
const ALLOWED_STYLE_PROPERTIES =
  /^(?:(?:min-|max-)?(?:width|height)|top|bottom|left|right|vertical-align|text-align|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|border(?:-(?:top|right|bottom|left))?-(?:width|style|color)|color|background-color|font-size)$/;
const SAFE_STYLE_VALUE = /^[\w\s.,%#+-]*$/;

export function sanitizeStyle(style) {
  return String(style || "")
    .split(";")
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      if (colon === -1) return "";
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();
      return ALLOWED_STYLE_PROPERTIES.test(property) && value && SAFE_STYLE_VALUE.test(value)
        ? `${property}:${value}`
        : "";
    })
    .filter(Boolean)
    .join(";");
}

const CONFIG = {
  // <style> restyles the app; form controls can imitate it and collect input.
  FORBID_TAGS: ["style", "form", "textarea", "select", "option", "dialog"],
  // Links to the web open in a new tab.
  ADD_ATTR: ["target"],
};

let purify = null;

function getPurify() {
  if (purify) return purify;
  if (typeof window === "undefined") return null;

  const instance = createDOMPurify(window);
  if (!instance.isSupported) return null;

  instance.addHook("uponSanitizeAttribute", (node, data) => {
    if (data.attrName === "onclick") {
      data.forceKeepAttr =
        node.nodeName === "BUTTON" && ALLOWED_INLINE_HANDLERS.has(data.attrValue);
    } else if (data.attrName === "style") {
      data.attrValue = sanitizeStyle(data.attrValue);
      if (!data.attrValue) data.keepAttr = false;
    }
  });

  instance.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName === "A" && node.hasAttribute("target")) {
      // A new tab must not be able to reach back through window.opener.
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (node.nodeName === "INPUT") {
      // Task lists render a disabled checkbox; nothing else may be an input.
      if ((node.getAttribute("type") || "").toLowerCase() !== "checkbox") {
        node.remove();
      } else {
        node.setAttribute("disabled", "");
        node.removeAttribute("name");
      }
    }
  });

  purify = instance;
  return purify;
}

// Returns HTML that is safe to insert into the page. Where no sanitizer can
// run, nothing is returned rather than the unchecked input.
export function sanitizeRenderedHtml(html) {
  const instance = getPurify();
  return instance ? instance.sanitize(String(html ?? ""), CONFIG) : "";
}
