import { readFile } from "node:fs/promises";

import { z } from "zod";

import { ConfigurationError } from "@llm-eval-kit/core";

const id = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const safeRelativePath = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    const segments = value.split(/[\\/]/);
    if (/^(?:[a-z]:|[\\/])/i.test(value) || segments.includes("..")) {
      context.addIssue({ code: "custom", message: "Path must remain relative to the manifest." });
    }
  });
const filters = z
  .object({
    caseIds: z.array(id).optional(),
    categories: z.array(id).optional(),
    severities: z.array(z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])).optional(),
    tags: z.array(id).optional(),
  })
  .strict();

export const studioProjectManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id,
    name: z.string().min(1).max(200),
    targets: z.array(z.object({ id, config: safeRelativePath }).strict()).min(1),
    suites: z
      .array(
        z
          .object({
            id,
            file: safeRelativePath,
            fixtureSets: z.array(z.object({ id, file: safeRelativePath }).strict()).default([]),
          })
          .strict(),
      )
      .min(1),
    scenarios: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(200).optional(),
            targetId: id,
            suiteId: id,
            fixtureSetId: id.optional(),
            filters: filters.optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
  .superRefine((manifest, context) => {
    const checkDuplicates = (values: string[], path: string) => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [path, index, "id"],
            message: `Duplicate ${path} id: ${value}`,
          });
        }
        seen.add(value);
      });
    };
    checkDuplicates(
      manifest.targets.map(({ id: value }) => value),
      "targets",
    );
    checkDuplicates(
      manifest.suites.map(({ id: value }) => value),
      "suites",
    );
    checkDuplicates(
      manifest.scenarios.map(({ id: value }) => value),
      "scenarios",
    );
    manifest.suites.forEach((suite, suiteIndex) =>
      checkDuplicates(
        suite.fixtureSets.map(({ id: value }) => value),
        `suites.${suiteIndex}.fixtureSets`,
      ),
    );
    const targetIds = new Set(manifest.targets.map(({ id: value }) => value));
    const suites = new Map(manifest.suites.map((suite) => [suite.id, suite]));
    manifest.scenarios.forEach((scenario, index) => {
      if (!targetIds.has(scenario.targetId)) {
        context.addIssue({
          code: "custom",
          path: ["scenarios", index, "targetId"],
          message: `Unknown target id: ${scenario.targetId}`,
        });
      }
      const suite = suites.get(scenario.suiteId);
      if (suite === undefined) {
        context.addIssue({
          code: "custom",
          path: ["scenarios", index, "suiteId"],
          message: `Unknown suite id: ${scenario.suiteId}`,
        });
      } else if (
        scenario.fixtureSetId !== undefined &&
        !suite.fixtureSets.some(({ id: fixtureId }) => fixtureId === scenario.fixtureSetId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["scenarios", index, "fixtureSetId"],
          message: `Unknown fixture set id: ${scenario.fixtureSetId}`,
        });
      }
    });
  });

export type StudioProjectManifest = z.infer<typeof studioProjectManifestSchema>;

export async function loadStudioProjectManifest(filePath: string): Promise<StudioProjectManifest> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    throw new ConfigurationError(`Unable to read or parse Studio manifest: ${filePath}`);
  }
  const result = studioProjectManifestSchema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new ConfigurationError(`Invalid Studio manifest: ${detail}`);
  }
  return result.data;
}
