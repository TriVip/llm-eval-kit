import { PromptOpsError, type PromptOpsFieldError } from "./errors.js";
import type {
  GenerationRequestContent,
  PromptEvaluationCase,
  PromptEvaluationSuite,
  PromptOpsJsonPrimitive,
  PromptTemplate,
} from "./types.js";

export const MAX_PROMPT_TEMPLATE_BYTES = 32 * 1024;
export const MAX_PROMPT_VARIABLES = 100;
export const MAX_PROMPT_IDENTIFIER_LENGTH = 120;

const variableIdentifier = /^[A-Za-z][A-Za-z0-9_-]{0,119}$/;

export type Placeholder =
  | { kind: "INPUT_USER"; source: "input.user" }
  | { kind: "INPUT_CONTEXT"; source: "input.context" }
  | { kind: "VARIABLE"; source: string; variable: string };

export type TemplateSegment =
  { kind: "TEXT"; value: string } | { kind: "PLACEHOLDER"; value: Placeholder };

function parsePlaceholder(source: string): Placeholder {
  if (source === "input.user") return { kind: "INPUT_USER", source };
  if (source === "input.context") return { kind: "INPUT_CONTEXT", source };
  if (source.startsWith("variables.")) {
    const variable = source.slice("variables.".length);
    if (variableIdentifier.test(variable)) return { kind: "VARIABLE", source, variable };
  }
  throw new PromptOpsError(
    "PROMPT_TEMPLATE_INVALID",
    `Unsupported prompt placeholder: {{${source}}}.`,
  );
}

export function parsePromptTemplateText(text: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const opening = text.indexOf("{{", cursor);
    const strayClosing = text.indexOf("}}", cursor);
    if (strayClosing !== -1 && (opening === -1 || strayClosing < opening)) {
      throw new PromptOpsError(
        "PROMPT_TEMPLATE_INVALID",
        "Prompt contains an unmatched closing token.",
      );
    }
    if (opening === -1) {
      if (cursor < text.length) segments.push({ kind: "TEXT", value: text.slice(cursor) });
      break;
    }
    if (opening > cursor) segments.push({ kind: "TEXT", value: text.slice(cursor, opening) });
    const closing = text.indexOf("}}", opening + 2);
    if (closing === -1) {
      throw new PromptOpsError("PROMPT_TEMPLATE_INVALID", "Prompt contains an unclosed token.");
    }
    const source = text.slice(opening + 2, closing);
    if (source.length === 0 || source.trim() !== source || source.includes("{{")) {
      throw new PromptOpsError("PROMPT_TEMPLATE_INVALID", "Prompt contains a malformed token.");
    }
    segments.push({ kind: "PLACEHOLDER", value: parsePlaceholder(source) });
    cursor = closing + 2;
  }
  return segments;
}

function templateTexts(
  template: PromptTemplate,
): ReadonlyArray<readonly ["system" | "user", string]> {
  return [
    ...(template.system === undefined ? [] : [["system", template.system] as const]),
    ["user", template.user],
  ];
}

function templateBytes(template: PromptTemplate): number {
  const encoder = new TextEncoder();
  return templateTexts(template).reduce(
    (total, [, text]) => total + encoder.encode(text).byteLength,
    0,
  );
}

function templateDefinitionErrors(template: PromptTemplate): PromptOpsFieldError[] {
  const errors: PromptOpsFieldError[] = [];
  if (template.schemaVersion !== "1.0") {
    errors.push({
      path: "schemaVersion",
      code: "PROMPT_TEMPLATE_INVALID",
      message: "Prompt schemaVersion must be 1.0.",
    });
  }
  if (template.user.length === 0) {
    errors.push({
      path: "user",
      code: "PROMPT_TEMPLATE_INVALID",
      message: "Prompt user template must not be empty.",
    });
  }
  if (templateBytes(template) > MAX_PROMPT_TEMPLATE_BYTES) {
    errors.push({
      path: "template",
      code: "PROMPT_TEMPLATE_TOO_LARGE",
      message: `Combined prompt template must not exceed ${MAX_PROMPT_TEMPLATE_BYTES} UTF-8 bytes.`,
    });
  }
  if (template.declaredVariables.length > MAX_PROMPT_VARIABLES) {
    errors.push({
      path: "declaredVariables",
      code: "PROMPT_TEMPLATE_INVALID",
      message: `Prompt must not declare more than ${MAX_PROMPT_VARIABLES} variables.`,
    });
  }
  const seen = new Set<string>();
  template.declaredVariables.forEach((variable, index) => {
    if (!variableIdentifier.test(variable)) {
      errors.push({
        path: `declaredVariables.${index}`,
        code: "PROMPT_TEMPLATE_INVALID",
        message: `Prompt variable is not a safe identifier: ${variable}.`,
        variable,
      });
    } else if (seen.has(variable)) {
      errors.push({
        path: `declaredVariables.${index}`,
        code: "PROMPT_VARIABLE_DUPLICATE",
        message: `Prompt variable is declared more than once: ${variable}.`,
        variable,
      });
    }
    seen.add(variable);
  });
  return errors;
}

function parseTemplate(template: PromptTemplate): {
  segments: Map<"system" | "user", TemplateSegment[]>;
  errors: PromptOpsFieldError[];
} {
  const segments = new Map<"system" | "user", TemplateSegment[]>();
  const errors = templateDefinitionErrors(template);
  for (const [field, text] of templateTexts(template)) {
    try {
      segments.set(field, parsePromptTemplateText(text));
    } catch (error) {
      errors.push({
        path: field,
        code: "PROMPT_TEMPLATE_INVALID",
        message:
          error instanceof PromptOpsError ? error.safeMessage : "Prompt template is invalid.",
      });
    }
  }
  return { segments, errors };
}

export type PromptValidationResult = {
  valid: boolean;
  errors: PromptOpsFieldError[];
  referencedVariables: string[];
  referencesContext: boolean;
};

export function validatePromptTemplateDefinition(template: PromptTemplate): PromptValidationResult {
  const parsed = parseTemplate(template);
  const placeholders = [...parsed.segments.values()].flatMap((segments) =>
    segments.flatMap((segment) => (segment.kind === "PLACEHOLDER" ? [segment.value] : [])),
  );
  const referencedVariables = [
    ...new Set(
      placeholders.flatMap((placeholder) =>
        placeholder.kind === "VARIABLE" ? [placeholder.variable] : [],
      ),
    ),
  ].sort();
  const declared = new Set(template.declaredVariables);
  for (const variable of referencedVariables) {
    if (!declared.has(variable)) {
      parsed.errors.push({
        path: "template",
        code: "PROMPT_VARIABLE_UNDECLARED",
        message: `Prompt references an undeclared variable: ${variable}.`,
        variable,
      });
    }
  }
  return {
    valid: parsed.errors.length === 0,
    errors: parsed.errors,
    referencedVariables,
    referencesContext: placeholders.some(({ kind }) => kind === "INPUT_CONTEXT"),
  };
}

export function validatePromptTemplate(
  template: PromptTemplate,
  suite: PromptEvaluationSuite,
): PromptValidationResult {
  const definition = validatePromptTemplateDefinition(template);
  const errors = [...definition.errors];
  const referencedVariables = definition.referencedVariables;
  const referencesContext = definition.referencesContext;
  for (const testCase of suite.cases) {
    for (const variable of referencedVariables) {
      if (!(variable in testCase.input.variables)) {
        errors.push({
          path: `cases.${testCase.id}.input.variables.${variable}`,
          code: "PROMPT_VARIABLE_MISSING",
          message: `Case ${testCase.id} is missing prompt variable: ${variable}.`,
          caseId: testCase.id,
          variable,
        });
      }
    }
    if (referencesContext && testCase.input.context === undefined) {
      errors.push({
        path: `cases.${testCase.id}.input.context`,
        code: "PROMPT_CONTEXT_MISSING",
        message: `Case ${testCase.id} is missing context required by the prompt.`,
        caseId: testCase.id,
      });
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    referencedVariables,
    referencesContext,
  };
}

function renderPrimitive(value: PromptOpsJsonPrimitive): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function renderSegments(segments: TemplateSegment[], testCase: PromptEvaluationCase): string {
  return segments
    .map((segment) => {
      if (segment.kind === "TEXT") return segment.value;
      const placeholder = segment.value;
      if (placeholder.kind === "INPUT_USER") return testCase.input.user;
      if (placeholder.kind === "INPUT_CONTEXT") {
        if (testCase.input.context === undefined) {
          throw new PromptOpsError(
            "PROMPT_CONTEXT_MISSING",
            `Case ${testCase.id} is missing context required by the prompt.`,
          );
        }
        return testCase.input.context;
      }
      const value = testCase.input.variables[placeholder.variable];
      if (value === undefined) {
        throw new PromptOpsError(
          "PROMPT_VARIABLE_MISSING",
          `Case ${testCase.id} is missing prompt variable: ${placeholder.variable}.`,
        );
      }
      return renderPrimitive(value);
    })
    .join("");
}

export interface PromptRenderer {
  validate(template: PromptTemplate, suite: PromptEvaluationSuite): PromptValidationResult;
  render(template: PromptTemplate, testCase: PromptEvaluationCase): GenerationRequestContent;
}

export const promptRenderer: PromptRenderer = {
  validate: validatePromptTemplate,
  render(template, testCase) {
    const validation = validatePromptTemplate(template, {
      id: "render",
      cases: [testCase],
    });
    if (!validation.valid) {
      throw new PromptOpsError(
        validation.errors[0]?.code ?? "PROMPT_TEMPLATE_INVALID",
        validation.errors[0]?.message ?? "Prompt template is invalid.",
        validation.errors,
      );
    }
    const parsed = parseTemplate(template);
    const systemSegments = parsed.segments.get("system");
    const userSegments = parsed.segments.get("user") ?? [];
    return {
      ...(systemSegments === undefined ? {} : { system: renderSegments(systemSegments, testCase) }),
      user: renderSegments(userSegments, testCase),
      ...(testCase.input.context === undefined ? {} : { context: testCase.input.context }),
      variables: { ...testCase.input.variables },
    };
  },
};
