/**
 * @file notebook.js
 * @description Notebook memory system - a living, AI-maintained biography of the user.
 * 
 * The Notebook is a single Markdown document that the AI treats as its ongoing notes
 * about the person it's talking to — warm, human, temporal, and completely local.
 * 
 * Structure:
 * - First half: Holistic narrative about the user (personality, preferences, patterns)
 * - Second half: Temporal zone with activity history (recent to older)
 */

import localforage from "localforage";

const NOTEBOOK_STORAGE_KEY = "user_notebook";
const NOTEBOOK_METADATA_KEY = "user_notebook_metadata";

/**
 * Default empty notebook template
 */
const DEFAULT_NOTEBOOK_TEMPLATE = `---
version: 1
lastUpdated: ${new Date().toISOString().split('T')[0]}
updateCount: 0
---

# Notes on the User

## The Person I'm Talking To

I've just started getting to know this user. As we have more conversations, I'll develop a clearer picture of who they are, what they care about, and how they like to communicate.

## Recent Activity

No conversations recorded yet.

## Background Context

Still learning about the user's background and longer-term interests.
`;

/**
 * Loads the Notebook from storage
 * @returns {Promise<Object>} Notebook object with content and metadata
 */
export async function loadNotebook() {
  try {
    const [content, metadata] = await Promise.all([
      localforage.getItem(NOTEBOOK_STORAGE_KEY),
      localforage.getItem(NOTEBOOK_METADATA_KEY)
    ]);

    if (!content) {
      return {
        content: DEFAULT_NOTEBOOK_TEMPLATE,
        metadata: {
          version: 1,
          lastUpdated: new Date().toISOString(),
          updateCount: 0,
          lastConsolidatedAt: null
        }
      };
    }

    return {
      content,
      metadata: metadata || {
        version: 1,
        lastUpdated: new Date().toISOString(),
        updateCount: 0,
        lastConsolidatedAt: null
      }
    };
  } catch (error) {
    console.error("Error loading Notebook:", error);
    return {
      content: DEFAULT_NOTEBOOK_TEMPLATE,
      metadata: {
        version: 1,
        lastUpdated: new Date().toISOString(),
        updateCount: 0,
        lastConsolidatedAt: null
      }
    };
  }
}

/**
 * Saves the Notebook to storage
 * @param {string} content - The Notebook Markdown content
 * @param {Object} metadata - Notebook metadata
 * @returns {Promise<boolean>} Success status
 */
export async function saveNotebook(content, metadata) {
  try {
    const updatedMetadata = {
      ...metadata,
      lastUpdated: new Date().toISOString()
    };

    await Promise.all([
      localforage.setItem(NOTEBOOK_STORAGE_KEY, content),
      localforage.setItem(NOTEBOOK_METADATA_KEY, updatedMetadata)
    ]);

    return true;
  } catch (error) {
    console.error("Error saving Notebook:", error);
    return false;
  }
}

/**
 * Gets the Notebook content formatted for injection into system prompt
 * @param {Object} notebook - The notebook object from loadNotebook()
 * @returns {string} Formatted Notebook section for system prompt
 */
export function getNotebookForPrompt(notebook) {
  if (!notebook || !notebook.content) {
    return "";
  }

  // Extract just the content after the frontmatter
  const contentMatch = notebook.content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const cleanContent = contentMatch ? contentMatch[1].trim() : notebook.content.trim();

  if (!cleanContent || cleanContent.includes("No conversations recorded yet")) {
    return "";
  }

  return `### My Notes About You

${cleanContent}

---`;
}

/**
 * Validates that a Notebook content is well-formed
 * Note: The AI generates content WITHOUT frontmatter - frontmatter is added by the system
 * @param {string} content - Notebook content to validate (may or may not have frontmatter)
 * @returns {Object} Validation result { valid: boolean, error?: string }
 */
export function validateNotebook(content) {
  if (!content || typeof content !== "string") {
    return { valid: false, error: "Content is empty or not a string" };
  }

  if (content.length < 50) {
    return { valid: false, error: "Content too short (likely incomplete)" };
  }

  // Strip frontmatter if present (for validation purposes)
  const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();

  // Check for required sections (loose validation)
  const hasTitle = contentWithoutFrontmatter.match(/^# /m);

  if (!hasTitle) {
    return { valid: false, error: "Missing title" };
  }

  // Content should have some substance (at least a few hundred chars)
  if (contentWithoutFrontmatter.length < 100) {
    return { valid: false, error: "Content too short after removing frontmatter" };
  }

  return { valid: true };
}

/**
 * Exports the Notebook as a Markdown file for download
 * @param {Object} notebook - The notebook object
 * @returns {string} Data URL for download
 */
export function exportNotebookAsDataUrl(notebook) {
  const blob = new Blob([notebook.content], { type: "text/markdown" });
  return URL.createObjectURL(blob);
}

/**
 * Imports a Notebook from a string
 * @param {string} content - Markdown content to import
 * @returns {Promise<Object|null>} The imported notebook or null on error
 */
export async function importNotebook(content) {
  try {
    const validation = validateNotebook(content);
    if (!validation.valid) {
      console.error("Invalid Notebook import:", validation.error);
      return null;
    }

    const notebook = {
      content,
      metadata: {
        version: 1,
        lastUpdated: new Date().toISOString(),
        updateCount: 0,
        lastConsolidatedAt: null,
        importedAt: new Date().toISOString()
      }
    };

    await saveNotebook(content, notebook.metadata);
    return notebook;
  } catch (error) {
    console.error("Error importing Notebook:", error);
    return null;
  }
}

/**
 * Checks if Notebook memory is enabled in settings
 * @param {Object} settings - User settings object
 * @returns {boolean} Whether Notebook memory is enabled
 */
export function isNotebookEnabled(settings) {
  return settings?.notebook_memory_enabled ?? false;
}

/**
 * Legacy migration: Check if old memory exists and suggest migration
 * @returns {Promise<boolean>} Whether old memory exists
 */
export async function hasLegacyMemory() {
  try {
    const legacyMemory = await localforage.getItem("global_chatbot_memory");
    return !!legacyMemory;
  } catch {
    return false;
  }
}

/**
 * One-time migration from old memory system to Notebook
 * Creates an initial Notebook from existing memory facts
 * @param {Array<string>} memoryFacts - Legacy memory facts
 * @returns {Promise<Object>} The created Notebook
 */
export async function migrateFromLegacyMemory(memoryFacts) {
  const initialContent = `---
version: 1
lastUpdated: ${new Date().toISOString().split('T')[0]}
updateCount: 1
migratedFrom: legacy_memory
---

# Notes on the User

## The Person I'm Talking To

Based on previous conversations, I've noted the following about this user:

${memoryFacts.map(fact => `- ${fact}`).join('\n')}

I'm still developing a deeper understanding of their personality and communication style through ongoing conversations.

## Recent Activity

Migrated from previous memory system on ${new Date().toLocaleDateString()}.

## Background Context

Information gathered from earlier interactions before the Notebook system was implemented.
`;

  const metadata = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    updateCount: 1,
    lastConsolidatedAt: new Date().toISOString(),
    migratedFrom: "legacy_memory"
  };

  await saveNotebook(initialContent, metadata);
  return { content: initialContent, metadata };
}