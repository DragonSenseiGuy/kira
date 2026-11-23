// The standalone Mermaid build, served as a file of its own (not bundled).
import mermaidScriptUrl from "mermaid/dist/mermaid.min.js?url";

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
  // Short names and other languages models commonly label blocks with.
  js: "js",
  jsx: "jsx",
  mjs: "mjs",
  ts: "ts",
  tsx: "tsx",
  py: "py",
  sh: "sh",
  zsh: "sh",
  yml: "yml",
  md: "md",
  "c++": "cpp",
  "c#": "cs",
  cs: "cs",
  rs: "rs",
  rb: "rb",
  golang: "go",
  kotlin: "kt",
  swift: "swift",
  scala: "scala",
  dart: "dart",
  lua: "lua",
  r: "r",
  perl: "pl",
  powershell: "ps1",
  toml: "toml",
  ini: "ini",
  scss: "scss",
  svg: "svg",
  csv: "csv",
  diff: "diff",
  graphql: "graphql",
  dockerfile: "dockerfile",
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
  if (typeof lang !== 'string') lang = wrapper.dataset.lang || 'text';
  let cleanLang = lang;
  if (typeof lang === 'string' && lang.startsWith('"') && lang.endsWith('"')) {
    cleanLang = lang.slice(1, -1);
  } else if (typeof lang === 'string' && lang.startsWith("'") && lang.endsWith("'")) {
    cleanLang = lang.slice(1, -1);
  }

  const codeEl = wrapper.querySelector("pre code");
  if (!codeEl) return; // Guard: <pre><code> not found

  const code = codeEl.innerText;
  // Own entries only: a block labelled "constructor" must not pick up
  // something inherited from Object.
  const key = String(cleanLang).toLowerCase();
  const extension = Object.hasOwn(langExtMap, key) ? langExtMap[key] : "txt";
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

/**
 * Builds the page that draws a Mermaid diagram inside the preview frame.
 *
 * The diagram source is model output, so Mermaid itself runs in the frame,
 * never in the app page: `scriptUrl` is the standalone Mermaid build, which
 * the frame loads on its own. The source is embedded as a JS string.
 */
export function buildMermaidDocument(code, scriptUrl) {
  const source = JSON.stringify(String(code)).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const src = String(scriptUrl).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<!doctype html><html><body style="margin:0;min-height:100vh;display:grid;place-items:center;font:14px system-ui,sans-serif">
<div id="diagram">Drawing the diagram…</div>
<script>
function fail(message){var d=document.getElementById("diagram");d.textContent="";var b=document.createElement("strong");b.style.color="#b00020";b.textContent="This diagram could not be drawn.";var p=document.createElement("pre");p.style.whiteSpace="pre-wrap";p.textContent=message;d.append(b,p)}
function draw(){mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:"default"});mermaid.render("diagram-svg",${source}).then(function(r){document.getElementById("diagram").innerHTML=r.svg},function(e){var s=document.getElementById("ddiagram-svg");if(s)s.remove();fail(e&&e.message||String(e))})}
<\/script>
<script src="${src}" onload="draw()" onerror="fail('The diagram renderer could not be loaded.')"><\/script>
</body></html>`;
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

  const lang = wrapper.dataset.lang;
  const code = codeEl.textContent;
  const page =
    String(lang).toLowerCase() === "mermaid"
      ? buildMermaidDocument(code, new URL(mermaidScriptUrl, document.baseURI).href)
      : buildPreviewDocument(lang, code);

  const frame = document.createElement("iframe");
  frame.className = "code-preview-frame";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("title", "Code preview");
  frame.setAttribute("srcdoc", page);
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
