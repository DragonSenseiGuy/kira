/**
 * The model that wrote a reply is recorded on the message, kept through
 * account sync, and shown under the reply.
 */

import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ChatPanel from "../app/components/ChatPanel.vue";
import { replaceMessages, rowToMessage } from "../server/utils/messages.js";

function mountPanel(messages) {
  return mount(ChatPanel, {
    props: { currConvo: "c1", currMessages: messages },
    global: {
      stubs: {
        UiTooltip: { template: "<span><slot /></span>" },
        UiIconButton: { template: "<button />" },
        StreamingMessage: true,
        ChatWidget: true,
        ContextSummaryMarker: true,
        MessageEditArea: true,
        Icon: true,
      },
    },
  });
}

const user = { id: "u1", role: "user", content: "hi", complete: true };

describe("model name under a reply", () => {
  it("shows the model that wrote the reply", () => {
    const wrapper = mountPanel([
      user,
      { id: "a1", role: "assistant", content: "yo", complete: true, modelName: "GPT-5 Mini" },
    ]);
    const label = wrapper.find(".stat-model");
    expect(label.text()).toBe("GPT-5 Mini");
    expect(label.attributes("title")).toBe("Answered by GPT-5 Mini");
    wrapper.unmount();
  });

  it("shows nothing for replies stored without a model", () => {
    const wrapper = mountPanel([
      user,
      { id: "a1", role: "assistant", content: "yo", complete: true },
      { id: "u2", role: "user", content: "again", complete: true },
      { id: "a2", role: "assistant", content: "yo", complete: true, modelName: null },
    ]);
    expect(wrapper.find(".stat-model").exists()).toBe(false);
    wrapper.unmount();
  });

  it("renders a hostile model name as text", () => {
    const wrapper = mountPanel([
      user,
      { id: "a1", role: "assistant", content: "yo", complete: true, modelName: "<img src=x onerror=alert(1)>" },
    ]);
    expect(wrapper.find(".stat-model").text()).toBe("<img src=x onerror=alert(1)>");
    expect(wrapper.find(".stat-model img").exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("model name in account sync", () => {
  async function insertedParams(message) {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await replaceMessages(client, "c1", [message]);
    const [sql, params] = client.query.mock.calls[1];
    const columns = sql.slice(sql.indexOf("(") + 1, sql.indexOf(")")).split(",").map((c) => c.trim());
    expect(params).toHaveLength(columns.length);
    return Object.fromEntries(columns.map((column, i) => [column, params[i]]));
  }

  it("writes the model name to its own column", async () => {
    const row = await insertedParams({ id: "a1", role: "assistant", content: "yo", modelName: "GPT-5 Mini" });
    expect(row.model_name).toBe("GPT-5 Mini");
    expect(row.position).toBe(0);
  });

  it("stores null for a missing or non-string name and caps the length", async () => {
    expect((await insertedParams({ id: "a1", role: "assistant", content: "yo" })).model_name).toBeNull();
    expect((await insertedParams({ id: "a1", role: "assistant", content: "yo", modelName: { a: 1 } })).model_name).toBeNull();
    expect((await insertedParams({ id: "a1", role: "assistant", content: "yo", modelName: "m".repeat(400) })).model_name).toHaveLength(255);
    expect((await insertedParams({ id: "a1", role: "assistant", content: "yo", modelName: "GPT\u0000-5" })).model_name).toBe("GPT-5");
    expect((await insertedParams({ id: "a1", role: "assistant", content: "yo", modelName: "\u0000" })).model_name).toBeNull();
  });

  it("reads the model name back for assistant rows", () => {
    expect(rowToMessage({ id: "a1", role: "assistant", content: "yo", model_name: "GPT-5 Mini" }).modelName).toBe("GPT-5 Mini");
    expect(rowToMessage({ id: "a1", role: "assistant", content: "yo" }).modelName).toBeNull();
    expect("modelName" in rowToMessage({ id: "u1", role: "user", content: "hi", model_name: "x" })).toBe(false);
  });
});
