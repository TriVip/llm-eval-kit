import type { RunArtifact } from "./types.js";

const sensitiveKey = /(^|_)(authorization|api[_-]?key|token|secret|password|cookie)($|_)/i;
const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bAIza[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi,
];

export function redactText(value: string): string {
  return secretPatterns.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), value);
}

export function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : redactValue(child, seen),
    ]),
  );
}

export function redactRunArtifact(artifact: RunArtifact, retainRawResponses = false): RunArtifact {
  const safe = redactValue(artifact) as RunArtifact;
  if (retainRawResponses) return safe;
  return {
    ...safe,
    cases: safe.cases.map((item) => {
      if (item.generation === undefined) return item;
      const generation = { ...item.generation };
      delete generation.rawStructuredOutput;
      return { ...item, generation: { ...generation, text: "[RAW_RESPONSE_NOT_RETAINED]" } };
    }),
  };
}
