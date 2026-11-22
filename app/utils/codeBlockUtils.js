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
};

export function copyCode(button) {
  const wrapper = button && button.closest(".code-block-wrapper");
  if (!wrapper) return; // Guard: button isn't inside a code block

  const codeEl = wrapper.querySelector("pre code");
  if (!codeEl) return; // Guard: <pre><code> not found

  const text = codeEl.innerText;
  const textEl = button.querySelector("span");
  // Shows the outcome on the button for two seconds, then restores "Copy".
  const flash = (label, className) => {
    if (!textEl) return;
    textEl.textContent = label;
    button.classList.add(className);
    setTimeout(() => {
      textEl.textContent = "Copy";
      button.classList.remove(className);
    }, 2000);
  };

  // `navigator.clipboard` is missing on pages not served over HTTPS, so the
  // call itself can throw as well as reject.
  let written;
  try {
    written = navigator.clipboard.writeText(text);
  } catch (err) {
    written = Promise.reject(err);
  }
  return written.then(() => flash("Copied!", "copied")).catch(err => {
    console.error('Failed to copy text: ', err);
    flash("Copy failed", "copy-failed");
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

// Make functions globally available for inline onclick handlers
if (typeof window !== 'undefined') {
  window.copyCode = copyCode;
  window.downloadCode = downloadCode;
}
