import type {
  ExperimentId,
  ExperimentRecommendation,
  HumanDecision,
  PromptDraft,
  PromptDraftId,
  PromptId,
  PromptOpsExperiment,
  PublishedPromptVersion,
  RecommendationId,
} from "./types.js";

export type PageRequest = { limit: number; cursor?: string };
export type Page<T> = { items: T[]; nextCursor?: string };

export interface PromptRepository {
  getDraft(draftId: PromptDraftId): Promise<PromptDraft | undefined>;
  getPublished(promptId: PromptId, version: number): Promise<PublishedPromptVersion | undefined>;
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
