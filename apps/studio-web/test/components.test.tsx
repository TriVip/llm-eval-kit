// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { getArtifact, getArtifacts } from "../src/api.js";
import { EmptyState, LoadingState, StatusBadge } from "../src/components.js";
import {
  ArtifactPage,
  ArtifactsPage,
  CasePage,
  ComparePage,
  LiveRunPage,
  NewRunPage,
  OverviewPage,
  ReviewPage,
  filterArtifactCases,
} from "../src/pages.js";
import { AppShell } from "../src/shell.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function expectNoAxeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(result.violations).toEqual([]);
}

describe("Studio accessible primitives", () => {
  it("renders verdict text in addition to color", () => {
    const { container } = render(<StatusBadge status="QUALITY_FAILED" />);
    expect(screen.getByText("QUALITY FAILED")).toBeTruthy();
    expect(container.querySelector(".status--fail")).not.toBeNull();
  });

  it("provides navigation landmarks and a skip link", async () => {
    const { container } = render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeTruthy();
    expect(screen.getByText("Skip to content")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("defines visible focus and reduced-motion behavior", async () => {
    const css = await readFile(resolve("apps/studio-web/src/styles.css"), "utf8");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("renders labelled loading and empty states", () => {
    const { rerender } = render(<LoadingState label="Loading evidence" />);
    expect(screen.getByRole("status", { name: "Loading evidence" })).toBeTruthy();
    rerender(<EmptyState title="No evidence">Create a run first.</EmptyState>);
    expect(screen.getByText("No evidence")).toBeTruthy();
  });
});

describe("Overview", () => {
  it("explains the read-only boundary and registered scenarios", async () => {
    const bootstrap = {
      apiVersion: "1.0",
      csrfToken: "token-1",
      capabilities: { readArtifacts: true, runEvaluations: true },
      projects: [
        {
          id: "ecommerce-support",
          name: "E-commerce Support",
          targets: [{ id: "mock", name: "mock" }],
          suites: [{ id: "main", name: "Main" }],
          scenarios: [{ id: "portfolio-pass", name: "Portfolio pass" }],
        },
      ],
      artifacts: [],
    };
    const project = {
      id: "ecommerce-support",
      name: "E-commerce Support",
      targets: [{ id: "mock", provider: "mock", model: "fixture-v1", ready: true }],
      suites: [{ id: "main", name: "Main", caseCount: 64, fixtureSets: [{ id: "passing" }] }],
      scenarios: [
        {
          id: "portfolio-pass",
          name: "Portfolio pass",
          targetId: "mock",
          suiteId: "main",
          fixtureSetId: "passing",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => ({
        ok: true,
        json: async () => (path.includes("/projects/") ? project : bootstrap),
      })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Evidence before confidence.")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Portfolio pass")).toBeTruthy());
    expect(screen.getByText("Mock runs · canonical evidence")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("shows a recoverable API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Studio is unavailable")).toBeTruthy());
  });

  it("shows an explicit empty-project state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          apiVersion: "1.0",
          csrfToken: "token-1",
          capabilities: { readArtifacts: true, runEvaluations: false },
          projects: [],
          artifacts: [],
        }),
      })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("No project registered")).toBeTruthy());
  });
});

const summary = {
  id: "artifact-12345678",
  runId: "run-1",
  suiteId: "main",
  status: "PASSED" as const,
  startedAt: "2026-09-16T00:00:00.000Z",
  completedAt: "2026-09-16T00:00:01.000Z",
  selectedCases: 64,
  passRate: 1,
  errorRate: 0,
};

const artifactDetail = {
  summary,
  artifact: {
    status: "PASSED" as const,
    metrics: {
      selectedCases: 64,
      passedCases: 64,
      failedCases: 0,
      warningCases: 0,
      errorCases: 0,
      passRate: 1,
      errorRate: 0,
    },
    gateFailures: [],
    cases: [
      {
        caseId: "REFUND_001",
        category: "refund_policy",
        severity: "CRITICAL" as const,
        verdict: "PASS" as const,
        generation: { text: "[RAW_RESPONSE_NOT_RETAINED]" },
        evaluations: [
          {
            evaluatorId: "policy-check",
            verdict: "PASS" as const,
            reason: "Policy matched.",
            evidence: { expected: "<img src=x onerror=alert(1)>" },
          },
        ],
      },
    ],
  },
};

const failedArtifactDetail = {
  summary: {
    ...summary,
    status: "QUALITY_FAILED" as const,
    passRate: 0.5,
  },
  artifact: {
    ...artifactDetail.artifact,
    status: "QUALITY_FAILED" as const,
    metrics: {
      ...artifactDetail.artifact.metrics,
      passedCases: 1,
      failedCases: 1,
      passRate: 0.5,
    },
    gateFailures: [
      {
        code: "CRITICAL_CASE_FAILURE",
        reason: "Critical refund policy failed.",
        affectedCaseIds: ["REFUND_001"],
      },
    ],
    cases: [
      {
        ...artifactDetail.artifact.cases[0]!,
        tags: ["regression", "policy"],
        verdict: "FAIL" as const,
        evaluations: [
          {
            evaluatorId: "policy-check",
            verdict: "FAIL" as const,
            reason: "30-day claim conflicts with 14-day evidence.",
          },
        ],
      },
      {
        caseId: "SHIPPING_001",
        category: "shipping",
        severity: "LOW" as const,
        tags: ["smoke"],
        verdict: "PASS" as const,
        score: 1,
        evaluations: [
          {
            evaluatorId: "exact-check",
            verdict: "PASS" as const,
            reason: "Matched.",
          },
        ],
      },
    ],
  },
};

describe("Artifact routes and client", () => {
  it("renders empty and populated artifact indexes", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal("fetch", fetchMock);
    let queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ArtifactsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("No artifacts found")).toBeTruthy());
    rendered.unmount();
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => [summary] }));
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ArtifactsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("run-1")).toBeTruthy());
    expect(screen.getByText("100.0%")).toBeTruthy();
  });

  it("renders artifact detail and recoverable missing state", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => artifactDetail,
    }));
    vi.stubGlobal("fetch", fetchMock);
    let queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/artifacts/artifact-12345678"]}>
          <Routes>
            <Route path="/artifacts/:artifactId" element={<ArtifactPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("64")).toBeTruthy());
    expect(
      screen.getByText("Raw provider responses remain omitted.", { exact: false }),
    ).toBeTruthy();
    rendered.unmount();
    fetchMock.mockImplementation(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/artifacts/missing"]}>
          <Routes>
            <Route path="/artifacts/:artifactId" element={<ArtifactPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Artifact not found")).toBeTruthy());
  });

  it("validates artifact client responses and failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [summary] })),
    );
    await expect(getArtifacts()).resolves.toHaveLength(1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => artifactDetail })),
    );
    await expect(getArtifact(summary.id)).resolves.toMatchObject({ summary: { runId: "run-1" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    await expect(getArtifacts()).rejects.toThrow("Studio request failed (500)");
  });

  it("renders case evidence as inert text with an honest redaction placeholder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => artifactDetail })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/artifacts/artifact-12345678/cases/REFUND_001"]}>
          <Routes>
            <Route path="/artifacts/:artifactId/cases/:caseId" element={<CasePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("[RAW_RESPONSE_NOT_RETAINED]")).toBeTruthy());
    expect(screen.getByText(/<img src=x/)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("renders canonical gate evidence and combines interactive case filters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => failedArtifactDetail })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/artifacts/artifact-12345678"]}>
          <Routes>
            <Route path="/artifacts/:artifactId" element={<ArtifactPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Critical refund policy failed.")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Search cases"), { target: { value: "policy" } });
    fireEvent.change(screen.getByLabelText("Verdict"), { target: { value: "FAIL" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "refund_policy" } });
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "CRITICAL" } });
    fireEvent.change(screen.getByLabelText("Evaluator"), { target: { value: "policy-check" } });
    expect(screen.getByText("1 of 2 cases")).toBeTruthy();
    expect(screen.getByRole("link", { name: "REFUND_001" })).toBeTruthy();
    expect(screen.queryByText("SHIPPING_001")).toBeNull();
  });

  it("requires two explicit confirmations and a matching hash before baseline overwrite", async () => {
    let promotions = 0;
    const currentHash = "a".repeat(64);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/v1/bootstrap") {
          return {
            ok: true,
            json: async () => ({
              apiVersion: "1.0",
              csrfToken: "token-1",
              capabilities: { readArtifacts: true, runEvaluations: true },
              projects: [
                {
                  id: "ecommerce-support",
                  name: "E-commerce Support",
                  targets: [],
                  suites: [],
                  scenarios: [],
                },
              ],
              artifacts: [],
            }),
          };
        }
        if (path === "/api/v1/baselines") {
          promotions += 1;
          if (promotions === 1) {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                apiVersion: "1.0",
                type: "about:blank",
                title: "Baseline was not promoted",
                status: 409,
                code: "BASELINE_EXISTS",
                detail: "A baseline already exists.",
                correlationId: "request-1",
                currentHash,
              }),
            };
          }
          return {
            ok: true,
            json: async () => ({
              apiVersion: "1.0",
              projectId: "ecommerce-support",
              suiteId: "main",
              artifactId: summary.id,
              baselineHash: "b".repeat(64),
              status: "PROMOTED",
            }),
          };
        }
        return { ok: true, json: async () => artifactDetail };
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/artifacts/${summary.id}`]}>
          <Routes>
            <Route path="/artifacts/:artifactId" element={<ArtifactPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const reviewed = await screen.findByLabelText(/I reviewed the run status/);
    fireEvent.click(reviewed);
    fireEvent.click(screen.getByRole("button", { name: "Promote baseline" }));
    await screen.findByText("Baseline already exists.");
    expect(screen.getByText(`Current hash: ${currentHash}`)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Replace this exact baseline/));
    fireEvent.click(screen.getByRole("button", { name: "Confirm overwrite" }));
    await screen.findByText("Baseline promoted and hash-verified.");
    expect(promotions).toBe(2);
  });
});

describe("New Run", () => {
  it("moves keyboard focus to a validation error", async () => {
    const bootstrap = {
      apiVersion: "1.0",
      csrfToken: "token-1",
      capabilities: { readArtifacts: true, runEvaluations: true },
      projects: [
        {
          id: "ecommerce-support",
          name: "E-commerce Support",
          targets: [{ id: "mock", name: "mock" }],
          suites: [{ id: "main", name: "Main" }],
          scenarios: [{ id: "portfolio-pass", name: "Portfolio pass" }],
        },
      ],
      artifacts: [],
    };
    const project = {
      id: "ecommerce-support",
      name: "E-commerce Support",
      targets: [{ id: "mock", provider: "mock", model: "fixture-v1", ready: true }],
      suites: [{ id: "main", name: "Main", caseCount: 64, fixtureSets: [{ id: "passing" }] }],
      scenarios: [
        {
          id: "portfolio-pass",
          name: "Portfolio pass",
          targetId: "mock",
          suiteId: "main",
          fixtureSetId: "passing",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/bootstrap") return { ok: true, json: async () => bootstrap };
        if (path.includes("/projects/") && init?.method !== "POST")
          return { ok: true, json: async () => project };
        return {
          ok: false,
          status: 400,
          json: async () => ({
            type: "about:blank",
            title: "Invalid run request",
            status: 400,
            code: "INVALID_RUN_REQUEST",
            detail: "The selected filters are invalid.",
            correlationId: "request-1",
          }),
        };
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/runs/new?project=ecommerce-support"]}>
          <NewRunPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("passing")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Validate & plan" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("validates and displays an authoritative plan before enabling execution", async () => {
    const bootstrap = {
      apiVersion: "1.0",
      csrfToken: "token-1",
      capabilities: { readArtifacts: true, runEvaluations: true },
      projects: [
        {
          id: "ecommerce-support",
          name: "E-commerce Support",
          targets: [{ id: "mock", name: "mock" }],
          suites: [{ id: "main", name: "Main" }],
          scenarios: [{ id: "refund-regression", name: "Refund regression" }],
        },
      ],
      artifacts: [],
    };
    const project = {
      id: "ecommerce-support",
      name: "E-commerce Support",
      targets: [{ id: "mock", provider: "mock", model: "fixture-v1", ready: true }],
      suites: [
        { id: "main", name: "Main", caseCount: 64, fixtureSets: [{ id: "critical-regression" }] },
      ],
      scenarios: [
        {
          id: "refund-regression",
          name: "Refund regression",
          targetId: "mock",
          suiteId: "main",
          fixtureSetId: "critical-regression",
          filters: { caseIds: ["REFUND_001"] },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/v1/bootstrap") return { ok: true, json: async () => bootstrap };
        if (path.includes("/projects/") && init?.method !== "POST")
          return { ok: true, json: async () => project };
        if (path.endsWith("/validate"))
          return {
            ok: true,
            json: async () => ({
              apiVersion: "1.0",
              valid: true,
              projectId: "ecommerce-support",
              suiteId: "main",
              caseCount: 64,
            }),
          };
        if (path === "/api/v1/runs")
          return {
            ok: true,
            json: async () => ({ apiVersion: "1.0", runId: "run-accepted", status: "ACCEPTED" }),
          };
        return {
          ok: true,
          json: async () => ({
            apiVersion: "1.0",
            projectId: "ecommerce-support",
            suiteId: "main",
            provider: "mock",
            model: "fixture-v1",
            selectedCases: 1,
            maximumCalls: 1,
            preflightCost: "UNAVAILABLE",
          }),
        };
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={["/runs/new?project=ecommerce-support&scenario=refund-regression"]}
        >
          <NewRunPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("REFUND_001")).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Categories/), { target: { value: "refund_policy" } });
    fireEvent.change(screen.getByLabelText(/Severities/), { target: { value: "critical" } });
    fireEvent.change(screen.getByLabelText(/Tags/), { target: { value: "regression" } });
    fireEvent.change(screen.getByLabelText("Concurrency"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Timeout (ms)"), { target: { value: "30000" } });
    fireEvent.change(screen.getByLabelText("Max retries"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate & plan" }));
    await waitFor(() => expect(screen.getByText("Authoritative run plan")).toBeTruthy());
    expect(
      (screen.getByRole("button", { name: "Start evaluation" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Start evaluation" }));
    await waitFor(() =>
      expect(
        (fetch as ReturnType<typeof vi.fn>).mock.calls.some(([path]) => path === "/api/v1/runs"),
      ).toBe(true),
    );
    await expectNoAxeViolations(container);
  });
});

describe("Live Run", () => {
  it("labels progress as preliminary and links the canonical terminal artifact", async () => {
    class EventSourceMock {
      static listeners = new Map<string, EventListener>();
      constructor() {}
      addEventListener(type: string, listener: EventListener) {
        EventSourceMock.listeners.set(type, listener);
      }
      close() {}
    }
    vi.stubGlobal("EventSource", EventSourceMock);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          apiVersion: "1.0",
          runId: "run-1",
          state: "QUALITY_FAILED",
          projectId: "ecommerce-support",
          suiteId: "main",
          selectedCases: 1,
          completedCases: 1,
          startedAt: "2026-09-17T00:00:00.000Z",
          completedAt: "2026-09-17T00:00:01.000Z",
          artifactId: "artifact-12345678",
        }),
      })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/runs/run-1"]}>
          <Routes>
            <Route path="/runs/:runId" element={<LiveRunPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("QUALITY_FAILED")).toBeTruthy());
    EventSourceMock.listeners.get("case.completed")?.(
      new MessageEvent("case.completed", {
        data: JSON.stringify({
          apiVersion: "1.0",
          id: 2,
          runId: "run-1",
          timestamp: "2026-09-17T00:00:00.500Z",
          type: "case.completed",
          caseId: "REFUND_001",
          progress: {
            selected: 1,
            running: 0,
            completed: 1,
            passed: 0,
            failed: 1,
            warning: 0,
            errors: 0,
          },
        }),
      }),
    );
    await waitFor(() => expect(screen.getByText("1 / 1")).toBeTruthy());
    EventSourceMock.listeners.get("run.completed")?.(
      new MessageEvent("run.completed", {
        data: JSON.stringify({
          apiVersion: "1.0",
          id: 3,
          runId: "run-1",
          timestamp: "2026-09-17T00:00:01.000Z",
          type: "run.completed",
          progress: {
            selected: 1,
            running: 0,
            completed: 1,
            passed: 0,
            failed: 1,
            warning: 0,
            errors: 0,
          },
        }),
      }),
    );
    expect(screen.getByText("LIVE RUN · PRELIMINARY")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open result →" }).getAttribute("href")).toBe(
      "/artifacts/artifact-12345678",
    );
    await expectNoAxeViolations(container);
  });

  it("requests cancellation with the session token and renders the safe transition", async () => {
    class EventSourceMock {
      addEventListener() {}
      close() {}
    }
    vi.stubGlobal("EventSource", EventSourceMock);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/v1/bootstrap") {
        return {
          ok: true,
          json: async () => ({
            apiVersion: "1.0",
            csrfToken: "token-1",
            capabilities: { readArtifacts: true, runEvaluations: true },
            projects: [],
            artifacts: [],
          }),
        };
      }
      if (path === "/api/v1/runs/run-1/cancel" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            apiVersion: "1.0",
            runId: "run-1",
            state: "CANCELLING",
            projectId: "ecommerce-support",
            suiteId: "main",
            selectedCases: 20,
            completedCases: 4,
            startedAt: "2026-09-17T00:00:00.000Z",
            safeMessage: "Cancellation requested. Completed evidence will be preserved.",
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          apiVersion: "1.0",
          runId: "run-1",
          state: "RUNNING",
          projectId: "ecommerce-support",
          suiteId: "main",
          selectedCases: 20,
          completedCases: 4,
          startedAt: "2026-09-17T00:00:00.000Z",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/runs/run-1"]}>
          <Routes>
            <Route path="/runs/:runId" element={<LiveRunPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const cancel = await screen.findByRole("button", { name: "Cancel run" });
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.getByText("CANCELLING")).toBeTruthy());
    expect(screen.getByText(/Cancelling safely/)).toBeTruthy();
    expect(screen.getByText(/Cancellation requested/)).toBeTruthy();
    const request = fetchMock.mock.calls.find(([path]) => path === "/api/v1/runs/run-1/cancel");
    expect(request?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "x-csrf-token": "token-1" }),
    });
    await expectNoAxeViolations(container);
  });

  it("coalesces a 500-event progress burst into one animation-frame update", async () => {
    class EventSourceMock {
      static listeners = new Map<string, EventListener>();
      addEventListener(type: string, listener: EventListener) {
        EventSourceMock.listeners.set(type, listener);
      }
      close() {}
    }
    let frame: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("EventSource", EventSourceMock);
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => ({
        ok: true,
        json: async () =>
          String(input) === "/api/v1/bootstrap"
            ? {
                apiVersion: "1.0",
                csrfToken: "token-1",
                capabilities: { readArtifacts: true, runEvaluations: true },
                projects: [],
                artifacts: [],
              }
            : {
                apiVersion: "1.0",
                runId: "run-1",
                state: "CANCELLED",
                projectId: "ecommerce-support",
                suiteId: "main",
                selectedCases: 500,
                completedCases: 0,
                startedAt: "2026-09-17T00:00:00.000Z",
                completedAt: "2026-09-17T00:00:01.000Z",
              },
      })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/runs/run-1"]}>
          <Routes>
            <Route path="/runs/:runId" element={<LiveRunPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("CANCELLED");
    for (let completed = 1; completed <= 500; completed += 1) {
      EventSourceMock.listeners.get("case.completed")?.(
        new MessageEvent("case.completed", {
          data: JSON.stringify({
            apiVersion: "1.0",
            id: completed,
            runId: "run-1",
            timestamp: "2026-09-17T00:00:00.500Z",
            type: "case.completed",
            caseId: `CASE_${completed}`,
            progress: {
              selected: 500,
              running: 500 - completed,
              completed,
              passed: completed,
              failed: 0,
              warning: 0,
              errors: 0,
            },
          }),
        }),
      );
    }
    expect(requestFrame).toHaveBeenCalledTimes(1);
    frame?.(performance.now());
    await screen.findByText("500 / 500");
  });
});

describe("Regression workflows", () => {
  it("renders accessible canonical comparison deltas and critical regressions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/v1/bootstrap") {
          return {
            ok: true,
            json: async () => ({
              apiVersion: "1.0",
              csrfToken: "token-1",
              capabilities: { readArtifacts: true, runEvaluations: true },
              projects: [],
              artifacts: [],
            }),
          };
        }
        if (path === "/api/v1/artifacts") {
          return {
            ok: true,
            json: async () =>
              ["base", "candidate"].map((runId, index) => ({
                id: `artifact-${runId}`,
                runId,
                suiteId: "main",
                status: index === 0 ? "PASSED" : "QUALITY_FAILED",
                startedAt: `2026-09-17T00:00:0${index}.000Z`,
                selectedCases: 1,
                passRate: index === 0 ? 1 : 0,
                errorRate: 0,
              })),
          };
        }
        return {
          ok: true,
          json: async () => ({
            apiVersion: "1.0",
            comparison: {
              schemaVersion: "1.0",
              baselineRunId: "base",
              candidateRunId: "candidate",
              classification: {
                matched: ["REFUND_001"],
                added: [],
                removed: [],
                changed: [],
              },
              overallPassRate: { baseline: 1, candidate: 0, delta: -1 },
              categories: [
                {
                  category: "refund_policy",
                  matchedCaseIds: ["REFUND_001"],
                  passRate: { baseline: 1, candidate: 0, delta: -1 },
                },
              ],
              criticalRegressionCaseIds: ["REFUND_001"],
              gateFailures: [
                {
                  code: "CRITICAL_CASE_REGRESSION",
                  reason: "A critical case newly failed.",
                  affectedCaseIds: ["REFUND_001"],
                },
              ],
              status: "QUALITY_FAILED",
            },
          }),
        };
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ComparePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("base · PASSED")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Baseline"), {
      target: { value: "artifact-base" },
    });
    fireEvent.change(screen.getByLabelText("Candidate"), {
      target: { value: "artifact-candidate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Compare artifacts" }));
    await screen.findByText("CRITICAL_CASE_REGRESSION");
    expect(screen.getAllByText("-100.0 pp")).toHaveLength(2);
    await expectNoAxeViolations(container);
  });

  it("shows an honest empty human-review state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [] })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("No review items");
    await expectNoAxeViolations(container);
  });

  it("links human-review evidence back to the canonical case", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            artifactId: summary.id,
            runId: summary.runId,
            caseId: "REFUND_001",
            category: "refund_policy",
            severity: "CRITICAL",
            verdict: "WARNING",
            confidence: 0.51,
            reasons: ["Human judgment is required."],
          },
        ],
      })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const link = await screen.findByRole("link", { name: "REFUND_001" });
    expect(link.getAttribute("href")).toBe(`/artifacts/${summary.id}/cases/REFUND_001`);
    expect(screen.getByText(/Confidence: 0.510/)).toBeTruthy();
  });
});

describe("case explorer", () => {
  it("combines all filters across 500 cases within the interaction budget", () => {
    const cases = Array.from({ length: 500 }, (_, index) => ({
      caseId: `CASE_${String(index).padStart(3, "0")}`,
      category: index % 2 === 0 ? "refund" : "shipping",
      severity: index % 10 === 0 ? ("CRITICAL" as const) : ("LOW" as const),
      tags: index % 5 === 0 ? ["regression"] : ["smoke"],
      verdict: index % 10 === 0 ? ("FAIL" as const) : ("PASS" as const),
      score: index % 10 === 0 ? 0 : 1,
      evaluations: [
        {
          evaluatorId: index % 10 === 0 ? "policy" : "exact",
          verdict: index % 10 === 0 ? ("FAIL" as const) : ("PASS" as const),
          reason: "Synthetic evidence",
        },
      ],
    }));
    const started = performance.now();
    const filtered = filterArtifactCases(cases, {
      search: "regression",
      verdict: "FAIL",
      category: "refund",
      severity: "CRITICAL",
      evaluator: "policy",
    });
    const elapsed = performance.now() - started;
    expect(filtered).toHaveLength(50);
    expect(elapsed).toBeLessThan(200);
  });
});
