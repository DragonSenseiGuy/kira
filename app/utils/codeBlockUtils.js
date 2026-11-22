// Shared utility functions for code blocks
const langExtMap = {
  python: "py",
  javascript: "js",
  typescript: "ts",
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

const PREVIEWABLE_LANGS = new Set(["html", "htm", "svg"]);

/** True for code-block languages that can be rendered as a page. */
export function isPreviewableLang(lang) {
  return typeof lang === "string" && PREVIEWABLE_LANGS.has(lang.toLowerCase());
}

/** Builds the document shown in the preview frame for a code block. */
export function buildPreviewDocument(lang, code) {
  if (String(lang).toLowerCase() !== "svg") return code;
  return `<!doctype html><html><body style="margin:0;min-height:100vh;display:grid;place-items:center">${code}</body></html>`;
}

/**
 * Switches a code block between its source and a rendered preview.
 *
 * The code is model output, so it is untrusted: it renders in an iframe
 * sandboxed to an opaque origin (scripts run, but cannot reach the app,
 * its storage, the top window, or open popups).
 */
export function togglePreview(button) {
  const wrapper = button && button.closest(".code-block-wrapper");
  if (!wrapper) return;
  const pre = wrapper.querySelector("pre");
  const codeEl = pre && pre.querySelector("code");
  if (!codeEl) return;

  const label = button.querySelector("span");
  const existing = wrapper.querySelector(".code-preview-frame");

  if (existing) {
    existing.remove();
    pre.hidden = false;
    if (label) label.textContent = "Preview";
    button.setAttribute("aria-pressed", "false");
    return;
  }

  const frame = document.createElement("iframe");
  frame.className = "code-preview-frame";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("title", "Code preview");
  frame.setAttribute("srcdoc", buildPreviewDocument(wrapper.dataset.lang, codeEl.textContent));
  wrapper.appendChild(frame);
  pre.hidden = true;
  if (label) label.textContent = "Code";
  button.setAttribute("aria-pressed", "true");
}

// Make functions globally available for inline onclick handlers
if (typeof window !== 'undefined') {
  window.togglePreview = togglePreview;
  window.copyCode = copyCode;
  window.downloadCode = downloadCode;
}
