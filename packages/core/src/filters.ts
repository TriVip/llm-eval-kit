import { DatasetValidationError } from "./errors.js";
import type { EvaluationCase, EvaluationSuite, Severity } from "./types.js";

export type CaseFilters = {
  caseIds?: readonly string[];
  categories?: readonly string[];
  severities?: readonly Severity[];
  tags?: readonly string[];
};

function hasValue(values: readonly string[] | undefined, value: string): boolean {
  return values === undefined || values.length === 0 || values.includes(value);
}

function matches(testCase: EvaluationCase, filters: CaseFilters): boolean {
  return (
    hasValue(filters.caseIds, testCase.id) &&
    hasValue(filters.categories, testCase.category) &&
    hasValue(filters.severities, testCase.severity) &&
    (filters.tags === undefined ||
      filters.tags.length === 0 ||
      filters.tags.some((tag) => testCase.tags.includes(tag)))
  );
}

export function filterEvaluationSuite(
  suite: EvaluationSuite,
  filters: CaseFilters = {},
): EvaluationSuite {
  const cases = suite.cases.filter((testCase) => matches(testCase, filters));

  if (cases.length === 0) {
    throw new DatasetValidationError(
      "No evaluation cases matched the supplied case, category, severity, and tag filters.",
    );
  }

  return { ...suite, cases };
}
