import { ref } from "vue";

// The open chat's title lives in its page; the top bar lives in the layout.
const title = ref("");

/** @returns {import("vue").Ref<string>} Title of the chat on screen, or "". */
export function useTopBarTitle() {
  return title;
}
