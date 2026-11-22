// Shared utility functions for code blocks
const langExtMap = {
  python: "py",
  javascript: "js",
  typescript: "ts",
  mermaid: "mmd",
  html: "html",
  htm: "html",
  svg: "svg",
  css: "css",
  vue: "vue",
  json: "json",
  markdown: "md",
  shell: "sh",
  bash: "sh",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  go: "go",
  rust: "rs",
  ruby: "rb",
  php: "php",
  sql: "sql",
  xml: "xml",
  yaml: "yml",
};

export function copyCode(button) {
  const wrapper = button && button.closest(".code-block-wrapper");
  if (!wrapper) return; // Guard: button isn't inside a code block

  const codeEl = wrapper.querySelector("pre code");
  if (!codeEl) return; // Guard: <pre><code> not found

  const text = codeEl.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const textEl = button.querySelector("span");
    if (textEl) {
      textEl.textContent = "Copied!";
      button.classList.add("copied");
      setTimeout(() => {
        textEl.textContent = "Copy";
        button.classList.remove("copied");
      }, 2000);
    }
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}

export function downloadCode(button, lang) {
  const wrapper = button && button.closest(".code-block-wrapper");
  if (!wrapper) return; // Guard: button isn't inside a code block

  // Remove any surrounding quotes that might have been added by JSON.stringify
  let cleanLang = lang;
  if (typeof lang === 'string' && lang.startsWith('"') && lang.endsWith('"')) {
    cleanLang = lang.slice(1, -1);
  } else if (typeof lang === 'string' && lang.startsWith("'") && lang.endsWith("'")) {
    cleanLang = lang.slice(1, -1);
  }

  const codeEl = wrapper.querySelector("pre code");
  if (!codeEl) return; // Guard: <pre><code> not found

  const code = codeEl.innerText;
  const extension = langExtMap[cleanLang.toLowerCase()] || "txt";
  const filename = `code-${Date.now()}.${extension}`;
  const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const PREVIEWABLE_LANGS = new Set(["html", "htm", "svg", "mermaid"]);

/** True for code-block languages that can be rendered as a page. */
export function isPreviewableLang(lang) {
  return typeof lang === "string" && PREVIEWABLE_LANGS.has(lang.toLowerCase());
}

/** Builds the document shown in the preview frame for a code block. */
// A srcdoc frame resolves URLs against the parent page, so an in-page link
// (`<a href="#top">`) would navigate the frame to the app itself and wipe the
// preview. This script keeps those links scrolling inside the preview.
const PREVIEW_ANCHOR_SCRIPT = `<script>document.addEventListener("click",function(e){if(e.defaultPrevented)return;var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;var h=a.getAttribute("href");if(!h||h.charAt(0)!=="#")return;e.preventDefault();var id=decodeURIComponent(h.slice(1));var t=id?document.getElementById(id)||document.getElementsByName(id)[0]:document.documentElement;if(t)t.scrollIntoView()});<\/script>`;

export function buildPreviewDocument(lang, code) {
  if (String(lang).toLowerCase() !== "svg") return code + PREVIEW_ANCHOR_SCRIPT;
  return `<!doctype html><html><body style="margin:0;min-height:100vh;display:grid;place-items:center">${code}</body></html>`;
}

let mermaidRenders = 0;

/**
 * Draws Mermaid source as an SVG string. The library is large, so it loads
 * on the first diagram. Rejects when the source is not a valid diagram.
 */
export async function renderMermaid(code) {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
  const id = `kira-mermaid-${++mermaidRenders}`;
  try {
    return (await mermaid.render(id, code)).svg;
  } finally {
    // On a syntax error Mermaid leaves its scratch element in the page.
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
  }
}

/** The page shown when a diagram cannot be drawn. */
export function buildPreviewErrorDocument(message) {
  const text = String(message).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html><body style="margin:16px;font:14px system-ui,sans-serif;color:#b00020"><strong>This diagram could not be drawn.</strong><pre style="white-space:pre-wrap;color:#333">${text}</pre></body></html>`;
}

/**
 * Switches a code block between its source and a rendered preview.
 *
 * The code is model output, so it is untrusted: it renders in an iframe
 * sandboxed to an opaque origin (scripts run, but cannot reach the app,
 * its storage, the top window, or open popups). A Mermaid diagram is drawn
 * to SVG first and then shown the same way.
 */
export async function togglePreview(button) {
  const wrapper = button && button.closest(".code-block-wrapper");
  if (!wrapper) return;
  const pre = wrapper.querySelector("pre");
  const codeEl = pre && pre.querySelector("code");
  if (!codeEl) return;

  // Each click supersedes a diagram that is still being drawn.
  const run = (button.previewRun = (button.previewRun || 0) + 1);
  const label = button.querySelector("span");
  const existing = wrapper.querySelector(".code-preview-frame");

  if (existing || button.getAttribute("aria-pressed") === "true") {
    existing?.remove();
    pre.hidden = false;
    if (label) label.textContent = "Preview";
    button.setAttribute("aria-pressed", "false");
    return;
  }

  const code = codeEl.textContent;
  let page;
  button.setAttribute("aria-pressed", "true");
  if (String(wrapper.dataset.lang).toLowerCase() === "mermaid") {
    try {
      page = buildPreviewDocument("svg", await renderMermaid(code));
    } catch (error) {
      page = buildPreviewErrorDocument(error?.message || error);
    }
    // Switched back to the code, or the message was re-rendered, meanwhile.
    if (button.previewRun !== run || !wrapper.isConnected) return;
  } else {
    page = buildPreviewDocument(wrapper.dataset.lang, code);
  }

  const frame = document.createElement("iframe");
  frame.className = "code-preview-frame";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("title", "Code preview");
  frame.setAttribute("srcdoc", page);
  wrapper.appendChild(frame);
  pre.hidden = true;
  if (label) label.textContent = "Code";
}

// Make functions globally available for inline onclick handlers
if (typeof window !== 'undefined') {
  window.togglePreview = togglePreview;
  window.copyCode = copyCode;
  window.downloadCode = downloadCode;
}
