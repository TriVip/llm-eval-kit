import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  canonicalPromptTemplate,
  hashPromptTemplate,
  PromptOpsError,
  sha256CanonicalJson,
} from "../src/index.js";

describe("PromptOps canonical JSON", () => {
  it("is independent of object key order and normalizes line endings", () => {
    const left = { z: "line 1\r\nline 2", a: { y: 2, x: true } };
    const right = { a: { x: true, y: 2 }, z: "line 1\nline 2" };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(sha256CanonicalJson(left)).toBe(sha256CanonicalJson(right));
  });

  it("sorts declared variables but preserves meaningful whitespace and array order", () => {
    const template = {
      schemaVersion: "1.0" as const,
      system: " Keep this ",
      user: "Hello {{variables.name}}",
      declaredVariables: ["locale", "name"],
    };
    expect(canonicalPromptTemplate({ ...template, declaredVariables: ["locale", "name"] })).toEqual(
      template,
    );
    expect(hashPromptTemplate(template)).toBe(
      hashPromptTemplate({ ...template, declaredVariables: ["locale", "name"] }),
    );
    expect(hashPromptTemplate(template)).not.toBe(
      hashPromptTemplate({ ...template, system: "Keep this" }),
    );
    expect(canonicalJson({ values: [2, 1] })).not.toBe(canonicalJson({ values: [1, 2] }));
  });

  it("rejects duplicates, cycles, non-finite numbers, and unsupported values", () => {
    expect(() =>
      canonicalPromptTemplate({
        schemaVersion: "1.0",
        user: "Hello",
        declaredVariables: ["name", "name"],
      }),
    ).toThrowError(PromptOpsError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const value of [cyclic, Number.NaN, { missing: undefined }]) {
      expect(() => canonicalJson(value)).toThrowError(PromptOpsError);
    }
  });
});
