import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  hashPromptTemplate,
  sha256CanonicalJson,
  type PromptTemplate,
} from "../src/index.js";

async function fixture<T>(name: string): Promise<T> {
  const content = await readFile(
    join(process.cwd(), "packages/promptops/test/fixtures", name),
    "utf8",
  );
  return JSON.parse(content) as T;
}

describe("PromptOps golden and adversarial fixtures", () => {
  it("locks canonical prompt content and hash", async () => {
    const golden = await fixture<{
      template: PromptTemplate;
      expectedCanonical: string;
      expectedHash: string;
    }>("golden-prompt.json");
    expect(canonicalJson(golden.template)).toBe(golden.expectedCanonical);
    expect(hashPromptTemplate(golden.template)).toBe(golden.expectedHash);
  });

  it("provides the approved bounded 2x3 plan shape", async () => {
    const plan = await fixture<{ variants: unknown[]; repetitions: number }>("golden-plan.json");
    expect(plan.variants).toHaveLength(2);
    expect(plan.repetitions).toBe(3);
    expect(plan.variants.length * plan.repetitions).toBe(6);
  });

  it("keeps a deliberate flaky result and detectable tamper vector", async () => {
    const flaky = await fixture<{ verdicts: string[]; expectedFlaky: boolean }>("flaky-run.json");
    expect(new Set(flaky.verdicts).size > 1).toBe(flaky.expectedFlaky);
    const tamper = await fixture<{ canonicalEvidence: unknown; tamperedEvidence: unknown }>(
      "tampered-evidence.json",
    );
    expect(sha256CanonicalJson(tamper.canonicalEvidence)).not.toBe(
      sha256CanonicalJson(tamper.tamperedEvidence),
    );
  });

  it("keeps secrets and absolute paths out of the safe projection", async () => {
    const canary = await fixture<{
      sensitiveInput: Record<string, string>;
      safeProjection: unknown;
    }>("secret-canary.json");
    const safe = JSON.stringify(canary.safeProjection);
    for (const secret of Object.values(canary.sensitiveInput)) expect(safe).not.toContain(secret);
  });
});
