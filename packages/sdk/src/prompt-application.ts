import {
  PromptOpsError,
  type CreatePromptInput,
  type Page,
  type PageRequest,
  type PromptDetails,
  type PromptDraft,
  type PromptRepository,
  type PromptSummary,
  type PublishedPromptVersion,
  type SavePromptDraftInput,
} from "@llm-eval-kit/promptops";

export interface PromptApplication {
  create(input: CreatePromptInput): Promise<PromptDetails>;
  saveDraft(input: SavePromptDraftInput): Promise<PromptDraft>;
  publish(draftId: string, expectedRevision: number): Promise<PublishedPromptVersion>;
  createDraft(promptId: string, parentVersion?: number): Promise<PromptDraft>;
  list(page?: Partial<PageRequest>): Promise<Page<PromptSummary>>;
  show(promptId: string): Promise<PromptDetails>;
  showVersion(promptId: string, version: number): Promise<PublishedPromptVersion>;
}

export function createPromptApplication(repository: PromptRepository): PromptApplication {
  return {
    create: (input) => repository.createPrompt(input),
    saveDraft: (input) => repository.saveDraft(input),
    publish: (draftId, expectedRevision) => repository.publishDraft(draftId, expectedRevision),
    createDraft: (promptId, parentVersion) => repository.createDraft(promptId, parentVersion),
    list: (page = {}) =>
      repository.listPrompts({
        limit: page.limit ?? 50,
        ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
      }),
    async show(promptId) {
      const prompt = await repository.getPrompt(promptId);
      if (prompt === undefined) {
        throw new PromptOpsError("PROMPT_NOT_FOUND", "Prompt was not found.");
      }
      return prompt;
    },
    async showVersion(promptId, version) {
      const published = await repository.getPublished(promptId, version);
      if (published === undefined) {
        throw new PromptOpsError("PROMPT_NOT_FOUND", "Published prompt version was not found.");
      }
      return published;
    },
  };
}
