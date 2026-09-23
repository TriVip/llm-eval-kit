import { describe, expect, it, vi } from "vitest";

import {
  PromptOpsError,
  type PromptDetails,
  type PromptRepository,
  type PromptTemplate,
} from "@llm-eval-kit/promptops";

import { createPromptApplication } from "../src/index.js";

const template: PromptTemplate = {
  schemaVersion: "1.0",
  user: "{{input.user}}",
  declaredVariables: [],
};
const details: PromptDetails = {
  promptId: "support",
  displayName: "Support",
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
  versions: [],
};

function repository(): PromptRepository {
  return {
    createPrompt: vi.fn(async () => details),
    saveDraft: vi.fn(async () => {
      throw new Error("unused");
    }),
    createDraft: vi.fn(async () => {
      throw new Error("unused");
    }),
    publishDraft: vi.fn(async () => {
      throw new Error("unused");
    }),
    getDraft: vi.fn(async () => undefined),
    getPrompt: vi.fn(async (promptId) => (promptId === "support" ? details : undefined)),
    getPublished: vi.fn(async () => undefined),
    listPrompts: vi.fn(async () => ({ items: [details] })),
    listPublished: vi.fn(async () => ({ items: [] })),
  };
}

describe("Prompt application facade", () => {
  it("exposes the same repository contract with stable list defaults", async () => {
    const port = repository();
    const application = createPromptApplication(port);
    await expect(
      application.create({ promptId: "support", displayName: "Support", template }),
    ).resolves.toEqual(details);
    await expect(application.list()).resolves.toEqual({ items: [details] });
    expect(port.listPrompts).toHaveBeenCalledWith({ limit: 50 });
    await expect(application.show("support")).resolves.toEqual(details);
  });

  it("normalizes missing prompt/version lookups to safe domain errors", async () => {
    const application = createPromptApplication(repository());
    await expect(application.show("missing")).rejects.toMatchObject({
      code: "PROMPT_NOT_FOUND",
      safeMessage: "Prompt was not found.",
    });
    await expect(application.showVersion("support", 1)).rejects.toBeInstanceOf(PromptOpsError);
  });
});
