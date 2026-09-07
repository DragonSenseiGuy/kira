/**
 * Mount tests for the ported beUI agent primitives in app/components/ui/agent.
 *
 * These cover the parts that carry meaning rather than the motion: the timer's
 * formatting, the approval card's three answers, and the phrase cycling that
 * drives the pending indicator.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import AgentProgress from "../app/components/ui/agent/AgentProgress.vue";
import ReasoningText from "../app/components/ui/agent/ReasoningText.vue";
import ThinkingShimmer from "../app/components/ui/agent/ThinkingShimmer.vue";
import ToolApproval from "../app/components/ui/agent/ToolApproval.vue";
import UiDisclosure from "../app/components/ui/Disclosure.vue";
import UiBadge from "../app/components/ui/Badge.vue";
import UiButton from "../app/components/ui/Button.vue";
import UiSpinner from "../app/components/ui/Spinner.vue";

const approvalOptions = {
  global: { components: { UiDisclosure, UiBadge, UiButton, UiSpinner } },
};

const reasoningOptions = {
  global: { components: { UiAgentThinkingShimmer: ThinkingShimmer } },
};

afterEach(() => {
  vi.useRealTimers();
});

describe("AgentProgress", () => {
  it("shows sub-minute time to a tenth of a second", () => {
    const wrapper = mount(AgentProgress, {
      props: { label: "Churning", elapsedSeconds: 9.44 },
    });
    expect(wrapper.text()).toContain("Churning");
    expect(wrapper.text()).toContain("9.4s");
  });

  it("switches to minutes and zero-padded seconds past a minute", () => {
    const wrapper = mount(AgentProgress, { props: { elapsedSeconds: 151.6 } });
    expect(wrapper.text()).toContain("2m 31s");
  });

  it("pads the seconds so the row never changes width", () => {
    const wrapper = mount(AgentProgress, { props: { elapsedSeconds: 125 } });
    expect(wrapper.text()).toContain("2m 05s");
  });

  it("never renders a negative clock", () => {
    const wrapper = mount(AgentProgress, { props: { elapsedSeconds: -3 } });
    expect(wrapper.text()).toContain("0.0s");
  });

  it("runs its own clock when no elapsed time is supplied", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AgentProgress, { props: { initialSeconds: 1 } });

    vi.advanceTimersByTime(500);
    await nextTick();

    expect(wrapper.text()).toContain("1.5s");
  });

  it("holds the clock still when it is not running", async () => {
    vi.useFakeTimers();
    const wrapper = mount(AgentProgress, {
      props: { initialSeconds: 2, running: false },
    });

    vi.advanceTimersByTime(2000);
    await nextTick();

    expect(wrapper.text()).toContain("2.0s");
  });
});

describe("ReasoningText", () => {
  it("starts on the first phrase and advances on the interval", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ReasoningText, {
      props: { phrases: ["Thinking", "Searching"], variant: "swap", interval: 1000 },
      ...reasoningOptions,
    });

    expect(wrapper.text()).toContain("Thinking");

    vi.advanceTimersByTime(1000);
    await nextTick();

    expect(wrapper.text()).toContain("Searching");
  });

  it("wraps back round to the first phrase", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ReasoningText, {
      props: { phrases: ["One", "Two"], variant: "swap", interval: 500 },
      ...reasoningOptions,
    });

    vi.advanceTimersByTime(1000);
    await nextTick();

    expect(wrapper.text()).toContain("One");
  });

  it("splits the cascade variant into per-word elements", () => {
    const wrapper = mount(ReasoningText, {
      props: { phrases: ["Reading the context"], variant: "cascade" },
      ...reasoningOptions,
    });
    expect(wrapper.findAll(".ui-reasoning__word")).toHaveLength(3);
  });
});

describe("ToolApproval", () => {
  function mountApproval(props = {}) {
    return mount(ToolApproval, {
      props: { tool: "terminal.run", ...props },
      ...approvalOptions,
    });
  }

  function click(wrapper, label) {
    const button = wrapper
      .findAll("button")
      .find((el) => el.text().trim() === label);
    return button.trigger("click");
  }

  it("emits a distinct event per answer", async () => {
    const wrapper = mountApproval();

    await click(wrapper, "Allow once");
    await click(wrapper, "Always allow");
    await click(wrapper, "Deny");

    expect(wrapper.emitted("approve")).toHaveLength(1);
    expect(wrapper.emitted("always-allow")).toHaveLength(1);
    expect(wrapper.emitted("deny")).toHaveLength(1);
  });

  it("drops the actions once the request is no longer pending", () => {
    const wrapper = mountApproval({ status: "approved" });
    expect(wrapper.find(".ui-approval__actions").exists()).toBe(false);
    expect(wrapper.text()).toContain("Allowed");
  });

  it("renders parameter rows, with code values preformatted", () => {
    const wrapper = mountApproval({
      parameters: [
        { id: "command", label: "Command", value: "npm test", code: true },
        { id: "directory", label: "Directory", value: "kira" },
      ],
    });

    expect(wrapper.findAll(".ui-approval__param")).toHaveLength(2);
    expect(wrapper.find(".ui-approval__code").text()).toBe("npm test");
    expect(wrapper.find(".ui-approval__param-value").text()).toBe("kira");
  });

  it("collapses the arguments once the decision has been made", async () => {
    const wrapper = mountApproval({
      parameters: [{ id: "command", label: "Command", value: "npm test" }],
    });
    expect(wrapper.find(".ui-disclosure").classes()).toContain("is-open");

    await wrapper.setProps({ status: "denied" });

    expect(wrapper.find(".ui-disclosure").classes()).not.toContain("is-open");
  });
});

describe("ThinkingShimmer", () => {
  it("falls back to a default message", () => {
    expect(mount(ThinkingShimmer).text()).toBe("Thinking…");
  });

  it("exposes the duration as a custom property", () => {
    const wrapper = mount(ThinkingShimmer, { props: { duration: 3 } });
    expect(wrapper.attributes("style")).toContain("--shimmer-duration: 3s");
  });
});
