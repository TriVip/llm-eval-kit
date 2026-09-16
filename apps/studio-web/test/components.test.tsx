// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { getArtifact, getArtifacts } from "../src/api.js";
import { EmptyState, LoadingState, StatusBadge } from "../src/components.js";
import { ArtifactPage, ArtifactsPage, OverviewPage } from "../src/pages.js";
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
      capabilities: { readArtifacts: true, runEvaluations: false },
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
    expect(screen.getByText("Execution arrives in Sprint 8")).toBeTruthy();
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
      json: async () => ({ summary, artifact: {} }),
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
      vi.fn(async () => ({ ok: true, json: async () => ({ summary, artifact: {} }) })),
    );
    await expect(getArtifact(summary.id)).resolves.toMatchObject({ summary: { runId: "run-1" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    await expect(getArtifacts()).rejects.toThrow("Studio request failed (500)");
  });
});
