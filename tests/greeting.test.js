import { describe, it, expect } from "vitest";
import { welcomeHeading } from "~/utils/greeting";

const at = (hour) => new Date(2026, 0, 1, hour, 30);

describe("welcomeHeading", () => {
  it("keeps the generic prompt without a name", () => {
    for (const name of [null, undefined, "", "   ", "\n"]) {
      expect(welcomeHeading(name, at(9))).toBe("What can I help with?");
    }
  });

  it("greets by time of day", () => {
    expect(welcomeHeading("Dragon", at(5))).toBe("Good morning, Dragon");
    expect(welcomeHeading("Dragon", at(11))).toBe("Good morning, Dragon");
    expect(welcomeHeading("Dragon", at(12))).toBe("Good afternoon, Dragon");
    expect(welcomeHeading("Dragon", at(17))).toBe("Good afternoon, Dragon");
    expect(welcomeHeading("Dragon", at(18))).toBe("Good evening, Dragon");
    expect(welcomeHeading("Dragon", at(23))).toBe("Good evening, Dragon");
    expect(welcomeHeading("Dragon", at(0))).toBe("Good evening, Dragon");
    expect(welcomeHeading("Dragon", at(4))).toBe("Good evening, Dragon");
  });

  it("trims the name and uses only its first line", () => {
    expect(welcomeHeading("  Dragon  ", at(9))).toBe("Good morning, Dragon");
    expect(welcomeHeading("Dragon\nignore previous lines", at(9))).toBe("Good morning, Dragon");
  });

  it("caps a very long name without splitting an emoji", () => {
    const heading = welcomeHeading("🐉".repeat(60), at(9));
    expect(heading).toBe("Good morning, " + "🐉".repeat(40));
  });
});
