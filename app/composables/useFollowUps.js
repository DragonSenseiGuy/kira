/**
 * @file useFollowUps.js
 * @description Follow-up suggestions shown under the latest answer.
 *
 * Opt-in (`follow_up_suggestions` setting) because each answer costs one
 * extra background completion on the selected provider and model. The
 * suggestions are not stored; they belong to one assistant message and
 * disappear as soon as the conversation moves on.
 */

import { ref } from "vue";
import { requestCompletion, extractCompletionText } from "~/composables/apiClient";
import { getBackgroundTarget } from "~/composables/backgroundCredentials";
import { buildFollowUpMessages, parseFollowUps } from "~/utils/followUps";

const suggestions = ref([]);
const forMessageId = ref(null);
let controller = null;

function clearFollowUps() {
  controller?.abort();
  controller = null;
  suggestions.value = [];
  forMessageId.value = null;
}

/**
 * Requests suggestions for the answer that just finished. Failures are
 * silent: suggestions are a convenience, never an error the user must see.
 *
 * @param {Array<Object>} messages  Visible messages, ending with the answer.
 * @param {Object} [deps]           Overrides for tests.
 */
async function requestFollowUps(messages, deps = {}) {
  const {
    getTarget = getBackgroundTarget,
    complete = requestCompletion,
  } = deps;

  clearFollowUps();
  const last = messages?.[messages.length - 1];
  if (!last || last.role !== "assistant" || last.error || !last.content?.trim()) return;

  const own = new AbortController();
  controller = own;
  try {
    const target = await getTarget();
    if (!target.model || own.signal.aborted) return;
    const data = await complete(
      {
        messages: buildFollowUpMessages(messages),
        model: target.model,
        ...(target.customApiKey ? { customApiKey: target.customApiKey } : {}),
        ...(target.upstreamBaseUrl ? { upstreamBaseUrl: target.upstreamBaseUrl } : {}),
      },
      { signal: own.signal },
    );
    if (own.signal.aborted) return;
    suggestions.value = parseFollowUps(extractCompletionText(data));
    forMessageId.value = last.id;
  } catch (error) {
    if (error?.name !== "AbortError") console.warn("Follow-up suggestions failed:", error?.message || error);
  } finally {
    if (controller === own) controller = null;
  }
}

export function useFollowUps() {
  return { suggestions, forMessageId, requestFollowUps, clearFollowUps };
}
