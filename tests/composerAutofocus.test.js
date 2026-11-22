import { describe, it, expect, beforeEach } from "vitest";
import { canAutofocusComposer } from "~/utils/composerAutofocus";

function fakeWindow({ coarse = false, collapsed = true } = {}) {
  return {
    matchMedia: () => ({ matches: coarse }),
    getSelection: () => ({ isCollapsed: collapsed }),
  };
}

describe("canAutofocusComposer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.activeElement?.blur?.();
  });

  it("allows it when nothing in particular has focus", () => {
    expect(canAutofocusComposer(document, fakeWindow())).toBe(true);
  });

  it("allows it from the sidebar control that opened the chat", () => {
    document.body.innerHTML = '<a href="/x" class="conversation-button">Chat</a><button id="new-chat-button">New</button>';
    document.querySelector(".conversation-button").focus();
    expect(canAutofocusComposer(document, fakeWindow())).toBe(true);
    document.getElementById("new-chat-button").focus();
    expect(canAutofocusComposer(document, fakeWindow())).toBe(true);
  });

  it("leaves focus alone in any other control or field", () => {
    document.body.innerHTML = '<button id="b">Menu</button><input id="i">';
    document.getElementById("b").focus();
    expect(canAutofocusComposer(document, fakeWindow())).toBe(false);
    document.getElementById("i").focus();
    expect(canAutofocusComposer(document, fakeWindow())).toBe(false);
  });

  it("does not raise the keyboard on touch screens", () => {
    expect(canAutofocusComposer(document, fakeWindow({ coarse: true }))).toBe(false);
  });

  it("does not drop a text selection", () => {
    expect(canAutofocusComposer(document, fakeWindow({ collapsed: false }))).toBe(false);
  });
});
