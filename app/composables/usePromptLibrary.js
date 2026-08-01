/**
 * @file usePromptLibrary.js
 * @description Locally persisted store for saved prompts.
 *
 * A single shared instance so the composer's slash menu and the settings
 * editor always agree, without prop drilling.
 */

import { ref, readonly } from "vue";
import localforage from "localforage";
import {
  normalizeLibrary,
  upsertPrompt as upsertInList,
  removePrompt as removeFromList,
} from "./promptLibrary";

/** localforage key holding the prompt array. */
export const PROMPT_LIBRARY_KEY = "prompt_library";

const prompts = ref([]);
const isLoaded = ref(false);
let loadPromise = null;

/**
 * Prompts every install starts with, so the slash menu is never an empty box
 * on first use. They are seeded once; deleting them sticks.
 */
const STARTER_PROMPTS = [
  {
    id: "starter-explain",
    name: "explain",
    description: "Explain something at a chosen level",
    body: "Explain {{topic}} to me as if I were {{audience}}. Use concrete examples and call out the parts people usually get wrong.",
  },
  {
    id: "starter-review",
    name: "review",
    description: "Review a snippet of code",
    body: "Review the following code for correctness, edge cases, and readability. Point out real problems only — skip style nitpicks.\n\n```\n{{code}}\n```",
  },
  {
    id: "starter-summarize",
    name: "summarise",
    description: "Summarise text into key points",
    body: "Summarise the text below into at most five bullet points, keeping every number and name intact.\n\n{{text}}",
  },
];

async function persist() {
  try {
    await localforage.setItem(
      PROMPT_LIBRARY_KEY,
      JSON.parse(JSON.stringify(prompts.value)),
    );
  } catch (error) {
    console.error("[promptLibrary] Failed to save prompts:", error);
  }
}

async function load() {
  try {
    const stored = await localforage.getItem(PROMPT_LIBRARY_KEY);

    if (stored === null || stored === undefined) {
      prompts.value = normalizeLibrary(STARTER_PROMPTS);
      await persist();
    } else {
      prompts.value = normalizeLibrary(stored);
    }
  } catch (error) {
    console.error("[promptLibrary] Failed to load prompts:", error);
    prompts.value = [];
  } finally {
    isLoaded.value = true;
  }
}

/**
 * Reactive access to the saved prompt library.
 *
 * @returns {Object} `{ prompts, isLoaded, ready, savePrompt, deletePrompt, replaceAll, reload }`
 */
export function usePromptLibrary() {
  if (!loadPromise) loadPromise = load();

  /**
   * Creates or updates a prompt.
   * @param {Object} prompt - The prompt to save.
   * @returns {Promise<Array<Object>>} The updated library.
   */
  async function savePrompt(prompt) {
    prompts.value = upsertInList(prompts.value, prompt);
    await persist();
    return prompts.value;
  }

  /**
   * Deletes a prompt by id.
   * @param {string} id - The prompt id.
   * @returns {Promise<Array<Object>>} The updated library.
   */
  async function deletePrompt(id) {
    prompts.value = removeFromList(prompts.value, id);
    await persist();
    return prompts.value;
  }

  /**
   * Replaces the whole library (used by import).
   * @param {Array<Object>} nextPrompts - The new library.
   * @returns {Promise<Array<Object>>} The updated library.
   */
  async function replaceAll(nextPrompts) {
    prompts.value = normalizeLibrary(nextPrompts);
    await persist();
    return prompts.value;
  }

  /** Re-reads from storage (after an import, for instance). */
  async function reload() {
    loadPromise = load();
    await loadPromise;
  }

  return {
    prompts: readonly(prompts),
    isLoaded: readonly(isLoaded),
    ready: loadPromise,
    savePrompt,
    deletePrompt,
    replaceAll,
    reload,
  };
}
