import { describe, it, expect, afterEach } from "vitest";
import { useLightThemeWhilePrinting } from "../app/utils/printTheme.js";

const root = document.documentElement;
const fire = (name) => window.dispatchEvent(new Event(name));
let stop = () => {};

afterEach(() => {
  stop();
  root.classList.remove("dark");
});

describe("useLightThemeWhilePrinting", () => {
  it("prints the dark theme as light and restores it afterwards", () => {
    root.classList.add("dark");
    stop = useLightThemeWhilePrinting();
    fire("beforeprint");
    expect(root.classList.contains("dark")).toBe(false);
    fire("afterprint");
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("leaves the light theme light", () => {
    stop = useLightThemeWhilePrinting();
    fire("beforeprint");
    fire("afterprint");
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("restores dark after two beforeprint events in a row", () => {
    root.classList.add("dark");
    stop = useLightThemeWhilePrinting();
    fire("beforeprint");
    fire("beforeprint");
    fire("afterprint");
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("restores the theme and stops listening when stopped mid-print", () => {
    root.classList.add("dark");
    stop = useLightThemeWhilePrinting();
    fire("beforeprint");
    stop();
    expect(root.classList.contains("dark")).toBe(true);
    fire("beforeprint");
    expect(root.classList.contains("dark")).toBe(true);
  });
});
