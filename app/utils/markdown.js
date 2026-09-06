import MarkdownIt from "markdown-it";
import markdownItFootnote from "markdown-it-footnote";
import markdownItTaskLists from "markdown-it-task-lists";
import markdownItTexmath from "markdown-it-texmath";
import katex from "katex";

// Shared fence renderer for code blocks (without synchronous highlighting)
// Highlighting is now done lazily via lazyHighlight.js
function addCodeBlockRenderer(md) {
  // Add custom fence rule for code blocks
  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : "";
    const langName = info ? info.split(/\s+/g)[0] : "";

    // Handle code blocks
    const code = token.content;
    const lang = langName || "text";
    const langDisplay = lang;

    // Escape HTML in code content
    const escapedCode = md.utils.escapeHtml(code);

    // Build HTML using template literals for better readability
    // For onclick handlers, we need to properly escape the language to prevent XSS and ensure proper execution
    const escapedLang = langDisplay.replace(/'/g, "\\'").replace(/"/g, '"').replace(/</g, '<').replace(/>/g, '>');
    const safeLangClass = md.utils.escapeHtml(lang);

    // Add data-needs-highlight attribute for lazy highlighting
    return `<div class="code-block-wrapper" data-lang="${safeLangClass}">
  <div class="code-block-header">
    <span class="code-language">${langDisplay}</span>
    <div class="code-actions">
      <button class="code-action-button" onclick="window.downloadCode(event.currentTarget, '${escapedLang}')" title="Download file">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 15.575q-.2 0-.375-.062T11.3 15.3l-3.6-3.6q-.3-.3-.288-.7t.288-.7q.3-.3.713-.312t.712.287L11 12.15V5q0-.425.288-.712T12 4t.713.288T13 5v7.15l1.875-1.875q.3-.3.713-.288t.712.313q.275.3.288.7t-.288.7l-3.6 3.6q-.15.15-.325.213t-.375.062M6 20q-.825 0-1.412-.587T4 18v-2q0-.425.288-.712T5 15t.713.288T6 16v2h12v-2q0-.425.288-.712T19 15t.713.288T20 16v2q0 .825-.587 1.413T18 20z" stroke-width="0.1" stroke="currentColor" />
        </svg>
        <span>Download</span>
      </button>
      <button class="code-action-button" onclick="window.copyCode(event.currentTarget)" title="Copy code">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <path fill="currentColor" stroke-width="0.1" d="M9 18q-.825 0-1.412-.587T7 16V4q0-.825.588-1.412T9 2h9q.825 0 1.413.588T20 4v12q0 .825-.587 1.413T18 18zm0-2h9V4H9zm-4 6q-.825 0-1.412-.587T3 20V7q0-.425.288-.712T4 6t.713.288T5 7v13h10q.425 0 .713.288T16 21t-.288.713T15 22zm4-6V4z" />
        </svg>
        <span>Copy</span>
      </button>
    </div>
  </div>
  <pre><code class="hljs ${safeLangClass}" data-needs-highlight="true">${escapedCode}</code></pre>
</div>`;
  };
}

/**
 * Sends every outbound link to a new tab.
 *
 * In-page anchors (footnote references and back-references, `#section`
 * links) are left alone — opening a fragment in a new tab would reload the
 * whole app. `rel` is set alongside `target` so a new tab can never reach
 * back through `window.opener`.
 *
 * @param {MarkdownIt} md
 */
function addExternalLinkTargets(md) {
  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const href = token.attrGet("href") || "";
    if (!href.startsWith("#")) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };
}

/**
 * Factory function for creating configured markdown-it instances
 * @param {Object} options - Configuration options
 * @param {boolean} options.enableKatex - Enable KaTeX math rendering (default: true)
 * @param {boolean} options.enableFootnotes - Enable footnotes (default: true)
 * @param {boolean} options.enableTaskLists - Enable task lists (default: true)
 * @returns {MarkdownIt} Configured markdown-it instance
 */
export function createMarkdownInstance(options = {}) {
  const {
    enableKatex = true,
    enableFootnotes = true,
    enableTaskLists = true,
  } = options;

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    // Disable synchronous highlighting - we use lazy highlighting instead
    highlight: null,
  });

  if (enableFootnotes) {
    md.use(markdownItFootnote);
  }

  if (enableTaskLists) {
    md.use(markdownItTaskLists, {
      enabled: false,
      label: true,
      bulletMarker: "-",
    });
  }

  if (enableKatex) {
    md.use(markdownItTexmath, {
      engine: katex,
      delimiters: ["dollars", "brackets"],
      katexOptions: {
        throwOnError: false,
        errorColor: "#888",
        strict: "ignore",
      },
    });
  }

  addCodeBlockRenderer(md);
  addExternalLinkTargets(md);
  return md;
}

// Create a single unified instance for all rendering
// This eliminates the "LaTeX jump" when streaming completes
export const md = createMarkdownInstance({
  enableKatex: true,
  enableFootnotes: true,
  enableTaskLists: true,
});

// Backward-compatible exports
// Both point to the same unified instance now
export const chatPanelMd = md;
export const streamingMessageMd = md;

// Default export for convenience
export default md;
