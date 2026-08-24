/**
 * @file htmlPreview.js
 * @description Makes multi-file HTML previews actually work. Generated web
 * apps usually span several workspace files (index.html + style.css +
 * app.js), but a sandboxed srcdoc iframe cannot fetch them. This module
 * inlines every LOCAL stylesheet/script reference into one self-contained
 * document before it goes into the iframe.
 *
 * - External URLs (https://, //), data: URIs and #anchors are left alone —
 *   CDNs (React via unpkg, etc.) load fine inside the opaque-origin iframe.
 * - References that cannot be resolved are left untouched; the browser's
 *   normal "resource not found" behavior applies.
 * - Images are skipped for now: the workspace is text-only today.
 */

/** True when a ref points at the network / embedded data / an anchor. */
function isExternal(ref) {
  return (
    !ref ||
    /^(https?:)?\/\//i.test(ref) ||
    /^data:/i.test(ref) ||
    /^[a-z][a-z0-9+.-]*:/i.test(ref) || // blob:, mailto:, javascript:, …
    ref.startsWith("#")
  );
}

/**
 * Resolves `ref` relative to the directory of `entryPath` into a
 * workspace-absolute path. Returns null when the ref is external.
 */
export function resolveRelativePath(entryPath, ref) {
  if (!ref || isExternal(ref)) return null;
  const clean = String(ref).split(/[?#]/)[0];
  if (!clean) return null;

  const baseParts = String(entryPath).split("/").slice(0, -1);
  const parts = [];
  const joined = `${baseParts.join("/")}/${clean}`.replace(/^\//, "");
  for (const seg of joined.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

function getAttr(tagText, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = re.exec(tagText);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? "";
}

/**
 * Rewrites every local <link rel=stylesheet> into a <style> block and every
 * local <script src> into an inline script (preserving type/integrity-less
 * attributes like `defer`, which becomes meaningless but harmless).
 *
 * @param {string} html
 * @param {string} entryPath Workspace path of the HTML file itself.
 * @param {(path: string) => Promise<string|null>} readText
 * @returns {Promise<string>}
 */
export async function inlineHtmlAssets(html, entryPath, readText) {
  let out = String(html ?? "");

  // ---- stylesheets ----
  const linkRe = /<link\b[^>]*>/gi;
  const linkReplacements = [];
  for (const tag of out.match(linkRe) || []) {
    const rel = getAttr(tag, "rel");
    if (!rel || !/stylesheet/i.test(rel)) continue;
    const href = getAttr(tag, "href");
    const resolved = resolveRelativePath(entryPath, href);
    if (!resolved) continue;
    linkReplacements.push({ tag, resolved });
  }
  for (const { tag, resolved } of linkReplacements) {
    const css = await readSafe(readText, resolved);
    if (css === null) continue;
    out = out.replace(tag, `<style>\n${css}\n</style>`);
  }

  // ---- scripts ----
  const scriptRe = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>\s*<\/script>/gi;
  const scriptMatches = [...out.matchAll(scriptRe)];
  for (const match of scriptMatches) {
    const [fullTag, dq, sq] = match;
    const ref = dq ?? sq ?? "";
    const resolved = resolveRelativePath(entryPath, ref);
    if (!resolved) continue;
    const js = await readSafe(readText, resolved);
    if (js === null) continue;
    // Preserve attributes other than src (e.g. type="module").
    // fullTag includes the closing </script>, so extract ONLY the open
    // tag's attribute region first.
    const openAttrs = /<script\b([^>]*)/i.exec(fullTag)?.[1] ?? "";
    const attrs = openAttrs
      .replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/i, "")
      .trim();
    out = out.replace(
      fullTag,
      `<script${attrs ? " " + attrs : ""}>\n${js}\n</script>`,
    );
  }

  return out;
}

async function readSafe(readText, path) {
  try {
    const content = await readText(path);
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

/**
 * Injects <base target="_blank"> so links open outside the sandboxed iframe
 * instead of navigating it away from the preview document.
 */
export function ensureBaseTag(html) {
  const base = '<base target="_blank">';
  const s = String(html ?? "");
  if (/<head[^>]*>/i.test(s)) {
    return s.replace(/<head[^>]*>/i, (m) => m + base);
  }
  if (/<html[^>]*>/i.test(s)) {
    return s.replace(/<html[^>]*>/i, (m) => `${m}<head>${base}</head>`);
  }
  return base + s;
}
