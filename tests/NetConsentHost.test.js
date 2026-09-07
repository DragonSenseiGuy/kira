/**
 * Mount tests for app/components/NetConsentHost.vue.
 *
 * The host is the UI half of a two-part contract with composables/sandboxNet:
 * it resolves the pending promise and leaves `window.__libreNetRemember` set
 * for sandboxNet to read *after* it awaits. The remember case is the one worth
 * pinning down — sandboxNet reads the flag a microtask late, so a host that
 * clears it synchronously silently downgrades "always allow" to "allow once".
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { emitter } from "../app/composables/emitter";
import NetConsentHost from "../app/components/NetConsentHost.vue";
import UiAgentToolApproval from "../app/components/ui/agent/ToolApproval.vue";
import UiDisclosure from "../app/components/ui/Disclosure.vue";
import UiBadge from "../app/components/ui/Badge.vue";
import UiButton from "../app/components/ui/Button.vue";
import UiSpinner from "../app/components/ui/Spinner.vue";

const mountOptions = {
  global: {
    components: { UiAgentToolApproval, UiDisclosure, UiBadge, UiButton, UiSpinner },
  },
};

let wrapper;

function mountHost() {
  wrapper = mount(NetConsentHost, mountOptions);
  return wrapper;
}

/** The card is teleported to body, so query there rather than on the wrapper. */
function buttonLabelled(text) {
  return Array.from(document.body.querySelectorAll("button")).find(
    (el) => el.textContent.trim() === text,
  );
}

/**
 * Emits a request and hands back the promise sandboxNet would be awaiting.
 * Wrapped in an object because returning it bare would let the caller's own
 * `await` chain onto it and hang until the card is answered.
 */
async function request(url = "https://example.com/data.json", domain = "example.com") {
  let resolve;
  const answered = new Promise((r) => {
    resolve = r;
  });
  emitter.emit("net-consent-request", { url, domain, answer: resolve });
  await nextTick();
  return { answered };
}

beforeEach(() => {
  window.__libreNetRemember = false;
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
});

describe("NetConsentHost", () => {
  it("renders nothing until a request arrives", () => {
    mountHost();
    expect(document.body.querySelector(".nc-overlay")).toBeNull();
  });

  it("shows the requested domain and URL", async () => {
    mountHost();
    await request();

    const card = document.body.querySelector(".nc-overlay");
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("example.com");
    expect(card.textContent).toContain("https://example.com/data.json");
  });

  it("resolves true when the request is allowed once", async () => {
    mountHost();
    const { answered } = await request();

    buttonLabelled("Allow once").click();
    expect(await answered).toBe(true);
  });

  it("resolves false when the request is denied", async () => {
    mountHost();
    const { answered } = await request();

    buttonLabelled("Deny").click();
    expect(await answered).toBe(false);
  });

  it("leaves the remember flag set for the awaiting reader on always-allow", async () => {
    mountHost();
    const { answered } = await request();
    // Mirrors sandboxNet: read the flag in the continuation of the await.
    const flagAtRead = answered.then(() => window.__libreNetRemember);

    buttonLabelled("Always allow").click();
    expect(await flagAtRead).toBe(true);
  });

  it("does not set the remember flag for a one-off allow", async () => {
    mountHost();
    const { answered } = await request();
    const flagAtRead = answered.then(() => window.__libreNetRemember);

    buttonLabelled("Allow once").click();
    expect(await flagAtRead).toBe(false);
  });

  it("replaces the actions with the outcome once answered", async () => {
    mountHost();
    await request();

    buttonLabelled("Deny").click();
    await nextTick();

    expect(buttonLabelled("Deny")).toBeUndefined();
    expect(document.body.querySelector(".nc-overlay").textContent).toContain("Denied");
  });
});
