import { reactive } from "vue";

// In-app replacements for window.alert / window.confirm / window.prompt.
//
// AppDialogHost renders `state.current`; requests are queued FIFO so dialogs
// never overlap, and every request resolves exactly once. Safe to call from
// components, composables, or error paths.
//
// Resolution values:
//   alertDialog  → resolves true (OK, Esc, backdrop)
//   confirmDialog→ resolves true/false
//   promptDialog → resolves the trimmed string, or null when cancelled

const state = reactive({ current: null });
const waiting = [];
let resolveCurrent = null;

function open(config) {
  return new Promise((resolve) => {
    if (state.current) {
      waiting.push({ config, resolve });
      return;
    }
    state.current = config;
    resolveCurrent = resolve;
  });
}

export function useDialogState() {
  return state;
}

export function settleDialog(value) {
  if (!state.current) return;
  const done = resolveCurrent;
  const next = waiting.shift();
  state.current = next ? next.config : null;
  resolveCurrent = next ? next.resolve : null;
  if (done) done(value);
}

export function alertDialog({
  title = "Notice",
  message = "",
  confirmLabel = "OK",
} = {}) {
  return open({ kind: "alert", title, message, confirmLabel });
}

export function confirmDialog({
  title = "Are you sure?",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
} = {}) {
  return open({
    kind: "confirm",
    title,
    message,
    confirmLabel,
    cancelLabel,
    danger,
  });
}

export function promptDialog({
  title = "",
  message = "",
  initial = "",
  placeholder = "",
  confirmLabel = "Save",
  cancelLabel = "Cancel",
} = {}) {
  return open({
    kind: "prompt",
    title: title || "Input",
    message,
    initial,
    placeholder,
    confirmLabel,
    cancelLabel,
  });
}
