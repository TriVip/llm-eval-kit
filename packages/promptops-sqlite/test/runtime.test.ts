import { describe, expect, it } from "vitest";

import { assertPromptOpsRuntime, isPromptOpsRuntimeSupported } from "../src/index.js";

describe("PromptOps SQLite runtime contract", () => {
  it.each([
    ["22.12.9", false],
    ["22.13.0", true],
    ["22.13.1", true],
    ["23.0.0", true],
    ["24.1.0", true],
    ["invalid", false],
  ])("evaluates Node %s", (version, supported) => {
    expect(isPromptOpsRuntimeSupported(version)).toBe(supported);
  });

  it("fails with upgrade guidance before an adapter can open a database", () => {
    expect(() => assertPromptOpsRuntime("22.12.0")).toThrow(
      "PromptOps SQLite requires Node.js >=22.13.0",
    );
    expect(() => assertPromptOpsRuntime("22.13.0")).not.toThrow();
  });
});
