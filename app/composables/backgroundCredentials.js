/**
 * @file backgroundCredentials.js
 * @description Resolution for BACKGROUND completions (title generation,
 * chat summarization, context compression, notepad consolidation).
 *
 * Background tasks deliberately reuse the user's CURRENTLY SELECTED
 * provider and model — there are no separate hidden models anymore. If
 * the selected combination can't serve a background task, the task fails
 * gracefully exactly like any other failed completion.
 */

import localforage from "localforage";
import { resolveChatTarget } from "./providers";

/**
 * Resolves model + credentials for a background completion from the
 * persisted settings snapshot.
 *
 * @param {Object} [settingsOverride]  Use instead of persisted settings
 *   (useful in tests / when a fresh snapshot is already at hand).
 * @returns {Promise<{model: string|null, customApiKey?: string, upstreamBaseUrl?: string}>}
 */
export async function getBackgroundTarget(settingsOverride) {
  let settings = settingsOverride;
  if (!settings) {
    try {
      settings = await localforage.getItem("settings");
    } catch {
      // Storage unavailable — behave as if nothing is configured.
    }
  }

  const target = resolveChatTarget(settings || {});
  return {
    model: target.modelId || null,
    ...(target.apiKey ? { customApiKey: target.apiKey } : {}),
    ...(target.upstreamBaseUrl ? { upstreamBaseUrl: target.upstreamBaseUrl } : {}),
  };
}
