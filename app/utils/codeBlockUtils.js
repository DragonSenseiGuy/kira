// Shared utility functions for code blocks
const langExtMap = {
  python: "py",
  javascript: "js",
  typescript: "ts",
  html: "html",
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

// Make functions globally available for inline onclick handlers
if (typeof window !== 'undefined') {
  window.copyCode = copyCode;
  window.downloadCode = downloadCode;
}
