/**
 * Tests for app/composables/defaultParameters.js
 *
 * Per project testing policy: configurable values (the defaults themselves)
 * are NOT pinned — they exist to be tuned. Only objective, structural
 * behavior is tested: both export spellings reference the same object.
 */

import { describe, it, expect } from "vitest";
import DEFAULT_PARAMETERS, { DEFAULT_PARAMETERS as namedExport } from "../app/composables/defaultParameters.js";

describe("DEFAULT_PARAMETERS", () => {
  it("default export and named export point to the same object", () => {
    expect(namedExport).toBe(DEFAULT_PARAMETERS);
  });

  it("exposes the expected parameter keys (values are configurable)", () => {
    expect(Object.keys(DEFAULT_PARAMETERS).sort()).toEqual(
      ["grounding", "max_tokens", "seed", "temperature", "top_p"].sort(),
    );
  });
});
