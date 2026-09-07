/**
 * Mount tests for the reasoning header of app/components/ChatWidget.vue.
 *
 * ChatPanel hands the widget either a settled label or a `liveSince`
 * timestamp, never both. This pins down which of the two the header renders,
 * since the live branch is what replaced the old per-message string interval.
 */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChatWidget from "../app/components/ChatWidget.vue";
import UiAgentProgress from "../app/components/ui/agent/AgentProgress.vue";
import UiDisclosure from "../app/components/ui/Disclosure.vue";
import UiBadge from "../app/components/ui/Badge.vue";

const mountOptions = {
  global: { components: { UiAgentProgress, UiDisclosure, UiBadge } },
};

function mountReasoning(props) {
  return mount(ChatWidget, {
    props: { type: "reasoning", content: "Weighing the options.", ...props },
    ...mountOptions,
  });
}

describe("ChatWidget reasoning header", () => {
  it("shows a running clock while reasoning is live", () => {
    const wrapper = mountReasoning({
      status: "Reasoning Process",
      liveSince: Date.now() - 3400,
    });

    expect(wrapper.find(".ui-progress").exists()).toBe(true);
    expect(wrapper.text()).toContain("Thinking");
    expect(wrapper.text()).toContain("3.4s");
  });

  it("carries the elapsed time forward rather than restarting at zero", () => {
    const wrapper = mountReasoning({ liveSince: Date.now() - 90_000 });
    expect(wrapper.text()).toContain("1m 30s");
  });

  it("shows the settled label once reasoning has finished", () => {
    const wrapper = mountReasoning({ status: "Thought for 5.0s", liveSince: null });

    expect(wrapper.find(".ui-progress").exists()).toBe(false);
    expect(wrapper.text()).toContain("Thought for 5.0s");
  });

  it("leaves tool widgets on their own header", () => {
    const wrapper = mount(ChatWidget, {
      props: {
        type: "tool",
        toolCalls: [{ id: "1", function: { name: "search", arguments: '{"query":"kira"}' } }],
      },
      ...mountOptions,
    });

    expect(wrapper.find(".ui-progress").exists()).toBe(false);
  });
});
