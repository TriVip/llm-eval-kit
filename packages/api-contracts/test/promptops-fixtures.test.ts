import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { experimentPlanSchema, promptTemplateSchema } from "../src/index.js";

async function readFixture(name: string): Promise<unknown> {
  const path = join(process.cwd(), "packages/promptops/test/fixtures", name);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("PromptOps fixture contracts", () => {
  it("validates the golden prompt and experiment plan through public schemas", async () => {
    const prompt = (await readFixture("golden-prompt.json")) as { template: unknown };
    expect(promptTemplateSchema.parse(prompt.template).schemaVersion).toBe("1.0");
    expect(experimentPlanSchema.parse(await readFixture("golden-plan.json"))).toMatchObject({
      experimentId: "support-prompt-v2",
      repetitions: 3,
    });
  });
});
