/**
 * Mount tests for app/components/NetConsentHost.vue.
 *
 * The host is the UI half of a two-part contract with composables/sandboxNet:
 * it answers the pending request with (allowed, remember). Both halves travel
 * in the answer, so "always allow" cannot degrade to "allow once" the way it
 * did when `remember` went through a global read a microtask later.
 */

import { describe, it, expect, afterEach } from "vitest";
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
    // Mirrors sandboxNet's `finish`, which packs both arguments into the
    // value it resolves.
    resolve = (allowed, remember) => r({ allowed: !!allowed, remember: !!remember });
  });
  emitter.emit("net-consent-request", { url, domain, answer: resolve });
  await nextTick();
  return { answered };
}

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
    expect(await answered).toEqual({ allowed: true, remember: false });
  });

  it("resolves false when the request is denied", async () => {
    mountHost();
    const { answered } = await request();

    buttonLabelled("Deny").click();
    expect(await answered).toEqual({ allowed: false, remember: false });
  });

  it("asks for the domain to be remembered on always-allow", async () => {
    mountHost();
    const { answered } = await request();

    buttonLabelled("Always allow").click();
    expect(await answered).toEqual({ allowed: true, remember: true });
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
