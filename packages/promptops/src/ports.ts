import type {
  CreatePromptInput,
  ExperimentId,
  ExperimentRecommendation,
  HumanDecision,
  PromptDraft,
  PromptDraftId,
  PromptDetails,
  PromptId,
  PromptOpsExperiment,
  PromptSummary,
  PublishedPromptVersion,
  RecommendationId,
  SavePromptDraftInput,
} from "./types.js";

export type PageRequest = { limit: number; cursor?: string };
export type Page<T> = { items: T[]; nextCursor?: string };

export interface PromptRepository {
  createPrompt(input: CreatePromptInput): Promise<PromptDetails>;
  saveDraft(input: SavePromptDraftInput): Promise<PromptDraft>;
  createDraft(promptId: PromptId, parentVersion?: number): Promise<PromptDraft>;
  publishDraft(draftId: PromptDraftId, expectedRevision: number): Promise<PublishedPromptVersion>;
  getDraft(draftId: PromptDraftId): Promise<PromptDraft | undefined>;
  getPrompt(promptId: PromptId): Promise<PromptDetails | undefined>;
  getPublished(promptId: PromptId, version: number): Promise<PublishedPromptVersion | undefined>;
  listPrompts(page: PageRequest): Promise<Page<PromptSummary>>;
  listPublished(promptId: PromptId, page: PageRequest): Promise<Page<PublishedPromptVersion>>;
}

export interface ExperimentRepository {
  get(experimentId: ExperimentId): Promise<PromptOpsExperiment | undefined>;
  list(page: PageRequest): Promise<Page<PromptOpsExperiment>>;
}

export interface RecommendationRepository {
  get(recommendationId: RecommendationId): Promise<ExperimentRecommendation | undefined>;
  append(experimentId: ExperimentId, recommendation: ExperimentRecommendation): Promise<void>;
}

export interface DecisionRepository {
  append(experimentId: ExperimentId, decision: HumanDecision): Promise<void>;
  list(experimentId: ExperimentId, page: PageRequest): Promise<Page<HumanDecision>>;
}

export type ArtifactReference = {
  artifactId: string;
  artifactHash: string;
};

export interface VerifiedArtifactReader<TArtifact = unknown> {
  loadVerified(reference: ArtifactReference): Promise<TArtifact>;
}

export interface PromptOpsClock {
  now(): Date;
}
