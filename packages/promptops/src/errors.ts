export const PROMPTOPS_ERROR_CODES = [
  "CANONICAL_VALUE_INVALID",
  "PROMPT_TEMPLATE_INVALID",
  "PROMPT_TEMPLATE_TOO_LARGE",
  "PROMPT_VARIABLE_DUPLICATE",
  "PROMPT_VARIABLE_UNDECLARED",
  "PROMPT_VARIABLE_MISSING",
  "PROMPT_CONTEXT_MISSING",
  "PROMPT_CONTENT_ALREADY_PUBLISHED",
  "DRAFT_REVISION_CONFLICT",
  "PLAN_STALE",
  "VARIANT_INCOMPATIBLE",
  "EXPERIMENT_ALREADY_ACTIVE",
  "EXPERIMENT_STATE_CONFLICT",
  "EVIDENCE_HASH_CONFLICT",
] as const;

export type PromptOpsErrorCode = (typeof PROMPTOPS_ERROR_CODES)[number];

export type PromptOpsFieldError = {
  path: string;
  code: PromptOpsErrorCode;
  message: string;
  caseId?: string;
  variable?: string;
};

export class PromptOpsError extends Error {
  public override readonly name = "PromptOpsError";

  public constructor(
    public readonly code: PromptOpsErrorCode,
    public readonly safeMessage: string,
    public readonly fieldErrors: readonly PromptOpsFieldError[] = [],
  ) {
    super(safeMessage);
  }
}
