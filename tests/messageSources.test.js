import { describe, it, expect } from "vitest";
import { messageSources } from "../app/utils/messageSources.js";

const search = (results) => ({ function: { name: "search" }, result: JSON.stringify({ results, query: "q" }) });
const answer = (tools, content = "") => ({
  role: "assistant",
  parts: [...tools.map((tool) => ({ type: "tool_group", tools: [tool] })), { type: "content", content }],
});

describe("messageSources", () => {
  it("lists the results of a search with title and domain", () => {
    expect(messageSources(answer([search([{ title: " Vue ", url: "https://www.vuejs.org/guide/" }])]))).toEqual([
      { url: "https://www.vuejs.org/guide/", title: "Vue", domain: "vuejs.org", cited: false },
    ]);
  });

  it("merges several searches and drops repeated pages", () => {
    const sources = messageSources(
      answer([
        search([{ title: "A", url: "https://a.com/x" }, { title: "B", url: "https://b.com" }]),
        search([{ title: "A again", url: "https://www.a.com/x/#top" }, { title: "C", url: "https://c.com/?q=1" }]),
      ]),
    );
    expect(sources.map((source) => source.title)).toEqual(["A", "B", "C"]);
  });

  it("keeps pages that differ only by query", () => {
    const sources = messageSources(answer([search([{ title: "1", url: "https://a.com/?p=1" }, { title: "2", url: "https://a.com/?p=2" }])]));
    expect(sources).toHaveLength(2);
  });

  it("lists pages the answer links to first", () => {
    const sources = messageSources(
      answer(
        [search([{ title: "A", url: "https://a.com/x" }, { title: "B", url: "https://b.com/y" }])],
        "See [the docs](https://b.com/y/).",
      ),
    );
    expect(sources.map((source) => [source.title, source.cited])).toEqual([
      ["B", true],
      ["A", false],
    ]);
  });

  it("uses the domain when a result has no title", () => {
    expect(messageSources(answer([search([{ url: "https://a.com/x" }])]))[0].title).toBe("a.com");
  });

  it("skips results that are not web pages", () => {
    const results = [{ title: "x", url: "javascript:alert(1)" }, { title: "y", url: "not a url" }, { title: "z" }, null];
    expect(messageSources(answer([search(results)]))).toEqual([]);
  });

  it("ignores other tools, failed searches and results that are not JSON", () => {
    const tools = [
      { function: { name: "crawl" }, result: JSON.stringify({ results: [{ title: "A", url: "https://a.com" }] }) },
      { function: { name: "search" }, result: "Error: failed" },
      { function: { name: "search" } },
      search([]),
    ];
    expect(messageSources(answer(tools))).toEqual([]);
  });

  it("reads a message stored before parts existed", () => {
    const message = { role: "assistant", content: "", tool_calls: [search([{ title: "A", url: "https://a.com" }])] };
    expect(messageSources(message)).toHaveLength(1);
  });

  it("returns nothing for user messages and missing input", () => {
    expect(messageSources({ role: "user", content: "https://a.com" })).toEqual([]);
    expect(messageSources(null)).toEqual([]);
  });
});
