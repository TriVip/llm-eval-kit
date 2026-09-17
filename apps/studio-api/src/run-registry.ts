import type {
  RunSessionSnapshot,
  SafeRunEvent,
  StudioRunRequest,
} from "@llm-eval-kit/api-contracts";
import { STUDIO_API_VERSION } from "@llm-eval-kit/api-contracts";
import type { ExecutionLogEvent, RunArtifact } from "@llm-eval-kit/core";

type RunState = RunSessionSnapshot["state"];
type Listener = (event: SafeRunEvent) => void;

type Session = {
  request: StudioRunRequest;
  snapshot: RunSessionSnapshot;
  events: SafeRunEvent[];
  nextEventId: number;
  listeners: Set<Listener>;
  startedCases: Set<string>;
  finishedCases: Set<string>;
  outcomes: { passed: number; failed: number; warning: number; errors: number };
  controller: AbortController;
};

const maximumBufferedEvents = 256;

function terminal(state: RunState): boolean {
  return [
    "REJECTED",
    "CANCELLED",
    "COMPLETED",
    "QUALITY_FAILED",
    "OPERATIONAL_FAILED",
    "INTERNAL_FAILED",
  ].includes(state);
}

export class RunRegistry {
  private readonly sessions = new Map<string, Session>();
  private activeRunId: string | undefined;

  create(runId: string, request: StudioRunRequest, selectedCases: number): RunSessionSnapshot {
    if (this.activeRunId !== undefined) throw new Error("RUN_ALREADY_ACTIVE");
    const snapshot: RunSessionSnapshot = {
      apiVersion: STUDIO_API_VERSION,
      runId,
      state: "CREATED",
      projectId: request.projectId,
      suiteId: request.suiteId,
      selectedCases,
      completedCases: 0,
    };
    const session: Session = {
      request,
      snapshot,
      events: [],
      nextEventId: 1,
      listeners: new Set(),
      startedCases: new Set(),
      finishedCases: new Set(),
      outcomes: { passed: 0, failed: 0, warning: 0, errors: 0 },
      controller: new AbortController(),
    };
    this.sessions.set(runId, session);
    this.activeRunId = runId;
    this.emit(session, "run.created");
    return snapshot;
  }

  get(runId: string): RunSessionSnapshot | undefined {
    return this.sessions.get(runId)?.snapshot;
  }

  mark(runId: string, state: RunState, additions: Partial<RunSessionSnapshot> = {}): void {
    const session = this.required(runId);
    session.snapshot = { ...session.snapshot, ...additions, state };
    if (terminal(state) && this.activeRunId === runId) this.activeRunId = undefined;
  }

  validating(runId: string): void {
    this.mark(runId, "VALIDATING");
  }

  validated(runId: string): void {
    const session = this.required(runId);
    this.mark(runId, "READY");
    this.emit(session, "run.validated");
  }

  signal(runId: string): AbortSignal {
    return this.required(runId).controller.signal;
  }

  cancel(runId: string): RunSessionSnapshot {
    const session = this.required(runId);
    if (terminal(session.snapshot.state) || session.snapshot.state === "CANCELLING") {
      return session.snapshot;
    }
    const requestedAt = new Date().toISOString();
    this.mark(runId, "CANCELLING", {
      safeMessage: "Cancellation requested. Preserving completed evidence.",
    });
    this.emit(session, "run.cancelling", undefined, "Cancellation requested.");
    session.controller.abort(requestedAt);
    return session.snapshot;
  }

  observe(runId: string, event: ExecutionLogEvent): void {
    const session = this.required(runId);
    if (event.phase !== "run") return;
    if (event.caseId === undefined) {
      if (event.status === "started") {
        if (session.snapshot.state !== "CANCELLING") {
          this.mark(runId, "RUNNING", { startedAt: new Date().toISOString() });
        }
        this.emit(session, "run.started");
      }
      return;
    }
    if (event.status === "started" && !session.startedCases.has(event.caseId)) {
      session.startedCases.add(event.caseId);
      this.emit(session, "case.started", event.caseId);
    }
    if (event.status !== "started" && !session.finishedCases.has(event.caseId)) {
      session.finishedCases.add(event.caseId);
      session.snapshot = { ...session.snapshot, completedCases: session.finishedCases.size };
      this.emit(session, "case.completed", event.caseId);
    }
  }

  complete(runId: string, artifact: RunArtifact, artifactId: string): void {
    const state: RunState =
      artifact.termination?.kind === "CANCELLED"
        ? "CANCELLED"
        : artifact.status === "PASSED"
          ? "COMPLETED"
          : artifact.status === "QUALITY_FAILED"
            ? "QUALITY_FAILED"
            : "OPERATIONAL_FAILED";
    const session = this.required(runId);
    session.outcomes = {
      passed: artifact.metrics.passedCases,
      failed: artifact.metrics.failedCases,
      warning: artifact.metrics.warningCases,
      errors: artifact.metrics.errorCases,
    };
    this.mark(runId, state, {
      completedAt: artifact.metadata.completedAt ?? new Date().toISOString(),
      completedCases: artifact.termination?.completedCases ?? artifact.metrics.selectedCases,
      artifactId,
    });
    this.emit(session, "artifact.written");
    this.emit(session, "run.completed");
  }

  fail(runId: string, safeMessage = "The evaluation could not be completed."): void {
    const session = this.required(runId);
    this.mark(runId, "INTERNAL_FAILED", {
      completedAt: new Date().toISOString(),
      safeMessage,
    });
    this.emit(session, "run.failed", undefined, safeMessage);
  }

  replay(runId: string, afterId: number): { events: SafeRunEvent[]; gap: boolean } | undefined {
    const session = this.sessions.get(runId);
    if (session === undefined) return undefined;
    const oldest = session.events[0]?.id ?? session.nextEventId;
    return {
      events: session.events.filter(({ id }) => id > afterId),
      gap: afterId > 0 && afterId < oldest - 1,
    };
  }

  subscribe(runId: string, listener: Listener): (() => void) | undefined {
    const session = this.sessions.get(runId);
    if (session === undefined) return undefined;
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }

  isTerminal(runId: string): boolean {
    const state = this.sessions.get(runId)?.snapshot.state;
    return state === undefined || terminal(state);
  }

  private required(runId: string): Session {
    const session = this.sessions.get(runId);
    if (session === undefined) throw new Error("RUN_NOT_FOUND");
    return session;
  }

  private emit(
    session: Session,
    type: SafeRunEvent["type"],
    caseId?: string,
    safeMessage?: string,
  ): void {
    const event: SafeRunEvent = {
      apiVersion: STUDIO_API_VERSION,
      id: session.nextEventId,
      runId: session.snapshot.runId,
      timestamp: new Date().toISOString(),
      type,
      progress: {
        selected: session.snapshot.selectedCases,
        running: Math.max(0, session.startedCases.size - session.finishedCases.size),
        completed: session.snapshot.completedCases,
        passed: session.outcomes.passed,
        failed: session.outcomes.failed,
        warning: session.outcomes.warning,
        errors: session.outcomes.errors,
      },
      ...(caseId === undefined ? {} : { caseId }),
      ...(safeMessage === undefined ? {} : { safeMessage }),
    };
    session.nextEventId += 1;
    session.events.push(event);
    if (session.events.length > maximumBufferedEvents) session.events.shift();
    for (const listener of session.listeners) listener(event);
  }
}
