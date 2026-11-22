import { describe, it, expect, vi } from "vitest";
import { replaceMessages, rowToMessage, toEpochMs } from "../server/utils/messages.js";

const sent = new Date("2026-11-22T04:42:37.580Z");

describe("toEpochMs", () => {
  it("turns the ISO strings a browser sends into epoch milliseconds", () => {
    expect(toEpochMs(sent.toISOString())).toBe(sent.getTime());
    expect(toEpochMs(sent)).toBe(sent.getTime());
  });

  it("keeps numbers, including the ones read back from the database", () => {
    expect(toEpochMs(sent.getTime())).toBe(sent.getTime());
    expect(toEpochMs(0)).toBe(0);
  });

  it("returns null when there is no usable time", () => {
    for (const value of [null, undefined, "", "soon", NaN, Infinity]) expect(toEpochMs(value)).toBeNull();
  });
});

describe("replaceMessages", () => {
  // The message as it arrives: stored Dates after a JSON round trip.
  const assistant = JSON.parse(
    JSON.stringify({
      id: "a",
      role: "assistant",
      content: "hello",
      timestamp: sent,
      parentId: "u",
      apiCallTime: sent,
      firstTokenTime: sent,
      completionTime: sent,
      reasoningStartTime: sent,
      reasoningEndTime: null,
      reasoningDuration: 1200,
    }),
  );

  it("writes numbers to every numeric timing column", async () => {
    const client = { query: vi.fn().mockResolvedValue({}) };
    await replaceMessages(client, "c1", [assistant]);

    const params = client.query.mock.calls[1][1];
    // reasoning_start_time, reasoning_end_time, reasoning_duration
    expect(params.slice(10, 13)).toEqual([sent.getTime(), null, 1200]);
    // api_call_time, first_token_time, completion_time
    expect(params.slice(14, 17)).toEqual([sent.getTime(), sent.getTime(), sent.getTime()]);
    // timestamp is a TIMESTAMPTZ column and keeps its ISO string.
    expect(params[4]).toBe(sent.toISOString());
  });

  it("reads back times the client can turn into dates again", () => {
    const message = rowToMessage({ id: "a", role: "assistant", api_call_time: sent.getTime() });
    expect(new Date(message.apiCallTime).toISOString()).toBe(sent.toISOString());
  });
});
