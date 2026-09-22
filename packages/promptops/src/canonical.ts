import { createHash } from "node:crypto";

import { PromptOpsError } from "./errors.js";
import type { PromptOpsJsonValue, PromptTemplate } from "./types.js";

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function canonicalValue(value: unknown, ancestors: Set<object>): PromptOpsJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return typeof value === "string" ? normalizeLineEndings(value) : value;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new PromptOpsError("CANONICAL_VALUE_INVALID", "Canonical JSON requires finite numbers.");
  }
  if (typeof value !== "object") {
    throw new PromptOpsError(
      "CANONICAL_VALUE_INVALID",
      "Canonical JSON contains an unsupported value.",
    );
  }
  if (ancestors.has(value)) {
    throw new PromptOpsError("CANONICAL_VALUE_INVALID", "Canonical JSON cannot contain cycles.");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => canonicalValue(item, ancestors));
    const result: Record<string, PromptOpsJsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalValue((value as Record<string, unknown>)[key], ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, new Set()));
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function canonicalPromptTemplate(template: PromptTemplate): PromptTemplate {
  const duplicates = template.declaredVariables.filter(
    (variable, index, variables) => variables.indexOf(variable) !== index,
  );
  if (duplicates.length > 0) {
    throw new PromptOpsError(
      "PROMPT_VARIABLE_DUPLICATE",
      `Prompt declares a variable more than once: ${duplicates[0] ?? "unknown"}.`,
    );
  }
  return {
    schemaVersion: template.schemaVersion,
    ...(template.system === undefined ? {} : { system: normalizeLineEndings(template.system) }),
    user: normalizeLineEndings(template.user),
    declaredVariables: [...template.declaredVariables].sort(),
  };
}

export function hashPromptTemplate(template: PromptTemplate): string {
  return sha256CanonicalJson(canonicalPromptTemplate(template));
}
