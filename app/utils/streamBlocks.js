/**
 * @file streamBlocks.js
 * @description Pure helpers powering the incremental streaming renderer
 * (StreamingMessage.vue). Splitting markdown into blocks lets the UI
 * re-render only the trailing incomplete block while finished blocks stay
 * as static HTML — the key to keeping long messages streaming smoothly.
 */

/**
 * Smart block splitting that respects fenced code blocks.
 * Prevents code blocks with blank lines from being prematurely split.
 *
 * Runs in O(n): a single forward pass over the lines plus one backward
 * pass to precompute "next non-blank line" indices (the naive version
 * re-scanned forward from every blank line, which is O(n²)).
 *
 * @param {string} markdown
 * @returns {string[]} At least one (possibly empty) block.
 */
export function splitIntoBlocks(markdown) {
  if (!markdown) return [''];

  const lines = markdown.split('\n');
  const blocks = [];
  let currentBlock = [];
  let inCodeFence = false;
  let fenceChar = '';

  // nextNonBlank[i] = index of the first line after i with content,
  // or -1 when none exists. Computed once in a single backward pass.
  const nextNonBlank = new Array(lines.length).fill(-1);
  for (let i = lines.length - 2; i >= 0; i--) {
    nextNonBlank[i] = lines[i + 1].trim() !== '' ? i + 1 : nextNonBlank[i + 1];
  }

  // Patterns that typically start new blocks
  const blockStarters = /^#{1,6}\s|^>|^[-*+]\s|^\d+\.\s|^```|^~~~|^\|/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for fence start/end (``` or ~~~)
    const fenceMatch = trimmed.match(/^(```|~~~)/);
    if (fenceMatch) {
      if (!inCodeFence) {
        // Starting a code fence — finalize any current block first
        if (currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'));
          currentBlock = [];
        }
        inCodeFence = true;
        fenceChar = fenceMatch[1];
        currentBlock.push(line);
      } else if (trimmed.startsWith(fenceChar)) {
        // Ending a code fence
        currentBlock.push(line);
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
        inCodeFence = false;
        fenceChar = '';
      } else {
        currentBlock.push(line);
      }
    } else if (inCodeFence) {
      currentBlock.push(line);
    } else if (trimmed === '' && currentBlock.length > 0) {
      // Blank line outside code fence — potential block boundary
      const nextIdx = nextNonBlank[i];
      const nextLine = nextIdx !== -1 ? lines[nextIdx] : null;

      if (!nextLine || blockStarters.test(nextLine)) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      } else {
        currentBlock.push(line);
      }
    } else {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  return blocks.length ? blocks : [''];
}

/**
 * Add streaming caret to the end of the rendered HTML.
 * The caret is inserted before the last closing tag so it appears inline
 * at the end of the content instead of on its own line.
 *
 * @param {string} html Rendered HTML of the streaming block.
 * @returns {string}
 */
export function addCaretToHtml(html) {
  // Always return at least the caret, even if no content
  if (!html || html.trim().length === 0) {
    return '<span class="streaming-caret"></span>';
  }

  // Find the last closing tag and insert caret before it
  const lastCloseMatch = html.match(/<\/[^>]+>$/);
  if (lastCloseMatch) {
    const insertPos = html.lastIndexOf(lastCloseMatch[0]);
    return html.slice(0, insertPos) + '<span class="streaming-caret"></span>' + html.slice(insertPos);
  }

  // No closing tag at end - just append caret
  return html + '<span class="streaming-caret"></span>';
}
