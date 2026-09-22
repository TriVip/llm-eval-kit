import { describe, expect, it } from "vitest";

import {
  MAX_PROMPT_TEMPLATE_BYTES,
  parsePromptTemplateText,
  promptRenderer,
  PromptOpsError,
  validatePromptTemplate,
  type PromptEvaluationSuite,
  type PromptTemplate,
} from "../src/index.js";

const template: PromptTemplate = {
  schemaVersion: "1.0",
  system: "Policy for {{variables.locale}}: {{input.context}}",
  user: "Question: {{input.user}} / customer={{variables.customer_id}}",
  declaredVariables: ["customer_id", "locale"],
};
const suite: PromptEvaluationSuite = {
  id: "suite",
  cases: [
    {
      id: "CASE_001",
      input: {
        user: "Where is my order?",
        context: "Order is in transit.",
        variables: { customer_id: "C-001", locale: "vi-VN" },
      },
    },
  ],
};

describe("restricted PromptOps template language", () => {
  it("renders only allowed placeholders and preserves request data", () => {
    expect(validatePromptTemplate(template, suite)).toMatchObject({
      valid: true,
      referencedVariables: ["customer_id", "locale"],
      referencesContext: true,
    });
    expect(promptRenderer.render(template, suite.cases[0]!)).toEqual({
      system: "Policy for vi-VN: Order is in transit.",
      user: "Question: Where is my order? / customer=C-001",
      context: "Order is in transit.",
      variables: { customer_id: "C-001", locale: "vi-VN" },
    });
  });

  it.each([
    "{{unknown.value}}",
    "{{variables.user.name}}",
    "{{variables.name || 'fallback'}}",
    "{{#each variables}}",
    "{{> include}}",
    "{{ input.user }}",
    "{{input.user}",
    "input.user}}",
  ])("rejects unsupported or malformed token %s", (token) => {
    expect(() => parsePromptTemplateText(token)).toThrowError(PromptOpsError);
  });

  it("reports undeclared and per-case missing variables before execution", () => {
    const invalidTemplate = { ...template, declaredVariables: ["locale"] };
    const missingSuite = {
      ...suite,
      cases: [{ ...suite.cases[0]!, input: { user: "Question", variables: {} } }],
    };
    const result = validatePromptTemplate(invalidTemplate, missingSuite);
    expect(result.valid).toBe(false);
    expect(result.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "PROMPT_VARIABLE_UNDECLARED",
        "PROMPT_VARIABLE_MISSING",
        "PROMPT_CONTEXT_MISSING",
      ]),
    );
    expect(() => promptRenderer.render(invalidTemplate, missingSuite.cases[0]!)).toThrowError(
      PromptOpsError,
    );
  });

  it("allows absent optional context when the template does not reference it", () => {
    const simple = {
      schemaVersion: "1.0" as const,
      user: "{{input.user}}",
      declaredVariables: [],
    };
    expect(
      validatePromptTemplate(simple, {
        id: "simple",
        cases: [{ id: "CASE_001", input: { user: "Hello", variables: {} } }],
      }).valid,
    ).toBe(true);
  });

  it("treats replacement and JavaScript/HTML/SQL-like content as inert text", () => {
    const inert = {
      schemaVersion: "1.0" as const,
      user: "<script>alert(1)</script>'; DROP TABLE prompts; -- {{input.user}}",
      declaredVariables: [],
    };
    const result = promptRenderer.render(inert, {
      id: "CASE_001",
      input: { user: "{{variables.secret}}", variables: {} },
    });
    expect(result.user).toBe(
      "<script>alert(1)</script>'; DROP TABLE prompts; -- {{variables.secret}}",
    );
  });

  it("enforces the combined 32 KiB UTF-8 template boundary", () => {
    const atLimit = {
      schemaVersion: "1.0" as const,
      user: "a".repeat(MAX_PROMPT_TEMPLATE_BYTES),
      declaredVariables: [],
    };
    expect(validatePromptTemplate(atLimit, { id: "suite", cases: [] }).valid).toBe(true);
    const overLimit = { ...atLimit, user: `${atLimit.user}a` };
    expect(validatePromptTemplate(overLimit, { id: "suite", cases: [] }).errors).toContainEqual(
      expect.objectContaining({ code: "PROMPT_TEMPLATE_TOO_LARGE", path: "template" }),
    );
  });
});
