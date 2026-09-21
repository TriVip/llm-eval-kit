import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { StudioRunRequest } from "@llm-eval-kit/api-contracts";

import {
  artifactDownloadUrl,
  compareArtifacts,
  getArtifact,
  getArtifacts,
  getBootstrap,
  getProject,
  getReviewItems,
  getRun,
  cancelRun,
  planRun,
  startRun,
  subscribeToRun,
  promoteBaseline,
  validateRun,
  type ArtifactCase,
  StudioRequestError,
} from "./api.js";
import { EmptyState, Eyebrow, LoadingState, Panel, StatusBadge } from "./components.js";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function OverviewPage() {
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  if (bootstrap.isPending) return <LoadingState />;
  if (bootstrap.isError)
    return (
      <EmptyState title="Studio is unavailable">
        Check that the local API is running, then retry.
      </EmptyState>
    );
  const project = bootstrap.data.projects[0];
  return (
    <div className="page">
      <header className="hero">
        <div>
          <Eyebrow>AI QUALITY ENGINEERING / LOCAL CONSOLE</Eyebrow>
          <h1>Evidence before confidence.</h1>
          <p>
            Run reviewed LLM evaluation scenarios and investigate canonical risk evidence from one
            secure local workspace.
          </p>
        </div>
        <div className="hero__signal" aria-label="Studio status">
          <span>EXECUTION READY</span>
          <strong>Secure local evaluation</strong>
          <small>Mock runs · canonical evidence</small>
        </div>
      </header>

      <section className="metric-grid" aria-label="Workspace summary">
        <div>
          <span>Registered projects</span>
          <strong>{bootstrap.data.projects.length}</strong>
          <small>Manifest validated</small>
        </div>
        <div>
          <span>Canonical artifacts</span>
          <strong>{bootstrap.data.artifacts.length}</strong>
          <small>Schema-valid only</small>
        </div>
        <div>
          <span>Execution</span>
          <strong>{bootstrap.data.capabilities.runEvaluations ? "ON" : "OFF"}</strong>
          <small>One bounded run at a time</small>
        </div>
      </section>

      {project === undefined ? (
        <EmptyState title="No project registered">
          Add a reviewed Studio manifest under the configured workspace.
        </EmptyState>
      ) : (
        <ProjectPanel projectId={project.id} />
      )}

      <Panel
        title="Recent evaluation evidence"
        action={<Link to="/artifacts">View all artifacts →</Link>}
      >
        {bootstrap.data.artifacts.length === 0 ? (
          <div className="inline-empty">
            No persisted run artifacts yet. CLI evidence will appear here after the API restarts.
          </div>
        ) : (
          <ArtifactTable artifacts={bootstrap.data.artifacts.slice(0, 5)} />
        )}
      </Panel>
    </div>
  );
}

function ProjectPanel({ projectId }: { projectId: string }) {
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
  });
  if (project.isPending) return <LoadingState label="Loading project" />;
  if (project.isError)
    return (
      <EmptyState title="Project unavailable">
        The registered project could not be loaded.
      </EmptyState>
    );
  return (
    <Panel title={project.data.name} action={<span className="mono">{project.data.id}</span>}>
      <div className="project-grid">
        <div>
          <h3>Targets</h3>
          {project.data.targets.map((target) => (
            <div className="resource-row" key={target.id}>
              <span>
                <strong>{target.id}</strong>
                <small>
                  {target.provider} / {target.model}
                </small>
              </span>
              <span className={target.ready ? "ready" : "not-ready"}>
                {target.ready ? "Ready" : "Not configured"}
              </span>
            </div>
          ))}
        </div>
        <div>
          <h3>Suites</h3>
          {project.data.suites.map((suite) => (
            <div className="resource-row" key={suite.id}>
              <span>
                <strong>{suite.name}</strong>
                <small>{suite.caseCount} reviewed cases</small>
              </span>
              <span className="mono">{suite.id}</span>
            </div>
          ))}
        </div>
        <div>
          <h3>Guided scenarios</h3>
          {project.data.scenarios.map((scenario) => (
            <Link
              className="scenario"
              key={scenario.id}
              to={`/runs/new?project=${project.data.id}&scenario=${scenario.id}`}
            >
              <span className="scenario__index">
                {String(project.data.scenarios.indexOf(scenario) + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{scenario.name}</strong>
                <small>
                  {scenario.targetId} · {scenario.suiteId}
                </small>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function ArtifactTable({ artifacts }: { artifacts: Awaited<ReturnType<typeof getArtifacts>> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Status</th>
            <th>Cases</th>
            <th>Pass rate</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {artifacts.map((artifact) => (
            <tr key={artifact.id}>
              <td>
                <Link className="mono" to={`/artifacts/${artifact.id}`}>
                  {artifact.runId}
                </Link>
              </td>
              <td>
                <StatusBadge status={artifact.status} />
              </td>
              <td>{artifact.selectedCases}</td>
              <td>{percent(artifact.passRate)}</td>
              <td>{new Date(artifact.startedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ArtifactsPage() {
  const artifacts = useQuery({ queryKey: ["artifacts"], queryFn: getArtifacts });
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Eyebrow>CANONICAL EVIDENCE</Eyebrow>
          <h1>Artifacts</h1>
          <p>Only schema-valid runs contained by the configured report root are indexed.</p>
        </div>
      </header>
      {artifacts.isPending ? (
        <LoadingState />
      ) : artifacts.isError ? (
        <EmptyState title="Artifacts unavailable">
          The local artifact index could not be loaded.
        </EmptyState>
      ) : artifacts.data.length === 0 ? (
        <EmptyState title="No artifacts found">
          Start a Studio run, or restart the API after creating canonical evidence with the CLI.
        </EmptyState>
      ) : (
        <Panel title={`${artifacts.data.length} indexed runs`}>
          <ArtifactTable artifacts={artifacts.data} />
        </Panel>
      )}
    </div>
  );
}

export function ArtifactPage() {
  const { artifactId = "" } = useParams();
  const [search, setSearch] = useState("");
  const [verdict, setVerdict] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [severity, setSeverity] = useState("ALL");
  const [evaluator, setEvaluator] = useState("ALL");
  const [confirmed, setConfirmed] = useState(false);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [currentHash, setCurrentHash] = useState<string>();
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const query = useQuery({
    queryKey: ["artifact", artifactId],
    queryFn: () => getArtifact(artifactId),
    retry: false,
  });
  const promote = useMutation({
    mutationFn: async (overwrite: boolean) => {
      const summary = query.data?.summary;
      const projectId = summary?.projectId ?? bootstrap.data?.projects[0]?.id;
      if (projectId === undefined || summary?.suiteId === undefined || bootstrap.data === undefined)
        throw new Error("Baseline target is unavailable.");
      return promoteBaseline(
        {
          artifactId,
          projectId,
          suiteId: summary.suiteId,
          ...(overwrite && currentHash !== undefined
            ? { overwrite: true, expectedCurrentHash: currentHash }
            : {}),
        },
        bootstrap.data.csrfToken,
      );
    },
    onError: (error) => {
      if (error instanceof StudioRequestError && error.problem.code === "BASELINE_EXISTS") {
        const hash = error.problem.currentHash;
        if (typeof hash === "string") setCurrentHash(hash);
      }
    },
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <NotFoundPage title="Artifact not found" />;
  const { summary, artifact } = query.data;
  const categories = [...new Set(artifact.cases.map((item) => item.category))].sort();
  const severities = [...new Set(artifact.cases.map((item) => item.severity))].sort();
  const evaluators = [
    ...new Set(artifact.cases.flatMap((item) => item.evaluations.map((item) => item.evaluatorId))),
  ].sort();
  const cases = filterArtifactCases(artifact.cases, {
    search,
    verdict,
    category,
    severity,
    evaluator,
  });
  return (
    <div className="page">
      <Link className="back-link" to="/artifacts">
        ← Artifacts
      </Link>
      <header className="page-header">
        <div>
          <Eyebrow>RUN EVIDENCE</Eyebrow>
          <h1 className="mono">{summary.runId}</h1>
        </div>
        <StatusBadge status={summary.status} />
      </header>
      <section className="metric-grid">
        <div>
          <span>Selected cases</span>
          <strong>{summary.selectedCases}</strong>
        </div>
        <div>
          <span>Pass rate</span>
          <strong>{percent(summary.passRate)}</strong>
        </div>
        <div>
          <span>Error rate</span>
          <strong>{percent(summary.errorRate)}</strong>
        </div>
      </section>
      <Panel title="Evidence boundary">
        <p className="prose">
          Canonical metrics are rendered without recalculation. Raw provider responses remain
          omitted.
        </p>
      </Panel>
      <Panel title="Canonical files">
        <div className="action-row">
          <a className="secondary-link" href={artifactDownloadUrl(artifactId, "run-json")}>
            Download run.json
          </a>
          <a className="secondary-link" href={artifactDownloadUrl(artifactId, "human-review")}>
            Download review queue
          </a>
          {query.data.files?.includes("html-report") === true && (
            <a className="secondary-link" href={artifactDownloadUrl(artifactId, "html-report")}>
              Open HTML report
            </a>
          )}
          {query.data.files?.includes("redacted-logs") === true && (
            <a className="secondary-link" href={artifactDownloadUrl(artifactId, "redacted-logs")}>
              Download redacted logs
            </a>
          )}
        </div>
      </Panel>
      <Panel title="Explicit baseline promotion">
        <p className="prose">
          Promote only after reviewing this {summary.status} artifact. This action never runs
          automatically.
        </p>
        <label className="confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I reviewed the run status and quality-gate evidence.
        </label>
        {currentHash !== undefined && (
          <div className="conflict" role="alert">
            <strong>Baseline already exists.</strong>
            <span className="mono">Current hash: {currentHash}</span>
            <label className="confirmation">
              <input
                type="checkbox"
                checked={overwriteConfirmed}
                onChange={(event) => setOverwriteConfirmed(event.target.checked)}
              />
              Replace this exact baseline after a second review.
            </label>
          </div>
        )}
        <button
          type="button"
          className={currentHash === undefined ? "primary-button" : "danger-button"}
          disabled={
            !confirmed || promote.isPending || (currentHash !== undefined && !overwriteConfirmed)
          }
          onClick={() => promote.mutate(currentHash !== undefined)}
        >
          {currentHash === undefined ? "Promote baseline" : "Confirm overwrite"}
        </button>
        {promote.isSuccess && <p role="status">Baseline promoted and hash-verified.</p>}
        {promote.isError && currentHash === undefined && (
          <p className="form-error" role="alert">
            {promote.error.message}
          </p>
        )}
      </Panel>
      {artifact.gateFailures.length > 0 && (
        <Panel title="Quality gate failures">
          <div className="gate-list">
            {artifact.gateFailures.map((failure) => (
              <div className="gate" key={failure.code}>
                <strong className="mono">{failure.code}</strong>
                <span>{failure.reason}</span>
                <small>{failure.affectedCaseIds.join(", ")}</small>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel title={`${cases.length} of ${artifact.cases.length} cases`}>
        <div className="filters" aria-label="Case filters">
          <label>
            Search cases
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ID, category, severity"
            />
          </label>
          <label>
            Verdict
            <select value={verdict} onChange={(event) => setVerdict(event.target.value)}>
              {["ALL", "PASS", "FAIL", "WARNING", "ERROR"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option>ALL</option>
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Severity
            <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
              <option>ALL</option>
              {severities.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Evaluator
            <select value={evaluator} onChange={(event) => setEvaluator(event.target.value)}>
              <option>ALL</option>
              {evaluators.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <CaseTable artifactId={artifactId} cases={cases} />
      </Panel>
    </div>
  );
}

export function ComparePage() {
  const artifacts = useQuery({ queryKey: ["artifacts"], queryFn: getArtifacts });
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const [baselineId, setBaselineId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const comparison = useMutation({
    mutationFn: async () => {
      if (bootstrap.data === undefined) throw new Error("Session is not ready.");
      return compareArtifacts(candidateId, baselineId, bootstrap.data.csrfToken);
    },
  });
  if (artifacts.isPending || bootstrap.isPending) return <LoadingState />;
  if (artifacts.isError || bootstrap.isError)
    return <EmptyState title="Comparison unavailable">Reload the local Studio.</EmptyState>;
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Eyebrow>REGRESSION CONTROL</Eyebrow>
          <h1>Compare evidence</h1>
          <p>All classifications and deltas come from the canonical SDK comparison engine.</p>
        </div>
      </header>
      {artifacts.data.length < 2 ? (
        <EmptyState title="Two artifacts required">
          Run the passing and regression scenarios first.
        </EmptyState>
      ) : (
        <Panel title="Candidate and baseline">
          <div className="comparison-form">
            <label>
              Baseline
              <select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}>
                <option value="">Select baseline</option>
                {artifacts.data.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.runId} · {item.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Candidate
              <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
                <option value="">Select candidate</option>
                {artifacts.data.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.runId} · {item.status}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              type="button"
              disabled={baselineId === "" || candidateId === "" || comparison.isPending}
              onClick={() => comparison.mutate()}
            >
              Compare artifacts
            </button>
          </div>
        </Panel>
      )}
      {comparison.isError && (
        <p className="form-error" role="alert">
          {comparison.error.message}
        </p>
      )}
      {comparison.data !== undefined && (
        <ComparisonResult comparison={comparison.data.comparison} />
      )}
    </div>
  );
}

function ComparisonResult({
  comparison,
}: {
  comparison: Awaited<ReturnType<typeof compareArtifacts>>["comparison"];
}) {
  return (
    <>
      <section className="metric-grid" aria-label="Comparison summary">
        <div>
          <span>Status</span>
          <strong>{comparison.status}</strong>
        </div>
        <div>
          <span>Pass-rate delta</span>
          <strong>{(comparison.overallPassRate.delta * 100).toFixed(1)} pp</strong>
        </div>
        <div>
          <span>Critical regressions</span>
          <strong>{comparison.criticalRegressionCaseIds.length}</strong>
        </div>
      </section>
      <Panel title="Case classification">
        <div className="classification-grid">
          {Object.entries(comparison.classification).map(([label, ids]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{ids.length}</strong>
              <small>{ids.join(", ") || "None"}</small>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Category deltas">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Baseline</th>
                <th>Candidate</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {comparison.categories.map((item) => (
                <tr key={item.category}>
                  <td>{item.category}</td>
                  <td>{percent(item.passRate.baseline)}</td>
                  <td>{percent(item.passRate.candidate)}</td>
                  <td>{(item.passRate.delta * 100).toFixed(1)} pp</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {comparison.gateFailures.length > 0 && (
        <Panel title="Regression gate failures">
          <div className="gate-list">
            {comparison.gateFailures.map((failure) => (
              <div className="gate" key={failure.code}>
                <strong>{failure.code}</strong>
                <span>{failure.reason}</span>
                <small>{failure.affectedCaseIds.join(", ")}</small>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

export function ReviewPage() {
  const review = useQuery({ queryKey: ["review-items"], queryFn: getReviewItems });
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Eyebrow>HUMAN IN THE LOOP</Eyebrow>
          <h1>Review queue</h1>
          <p>Low-confidence model-based warnings that require human judgment.</p>
        </div>
      </header>
      {review.isPending ? (
        <LoadingState />
      ) : review.isError ? (
        <EmptyState title="Review queue unavailable">Retry after the API recovers.</EmptyState>
      ) : review.data.length === 0 ? (
        <EmptyState title="No review items">
          No model-based warning currently needs review.
        </EmptyState>
      ) : (
        <Panel title={`${review.data.length} items require review`}>
          <div className="review-list">
            {review.data.map((item) => (
              <article className="evaluation" key={`${item.artifactId}:${item.caseId}`}>
                <header>
                  <Link to={`/artifacts/${item.artifactId}/cases/${item.caseId}`}>
                    {item.caseId}
                  </Link>
                  <span>{item.severity}</span>
                </header>
                <p>{item.reasons.join(" ")}</p>
                <small>
                  Confidence: {item.confidence?.toFixed(3) ?? "Unavailable"} · {item.category}
                </small>
              </article>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

export function filterArtifactCases(
  cases: ArtifactCase[],
  filters: {
    search: string;
    verdict: string;
    category: string;
    severity: string;
    evaluator: string;
  },
): ArtifactCase[] {
  const search = filters.search.trim().toLowerCase();
  return cases.filter(
    (item) =>
      (filters.verdict === "ALL" || item.verdict === filters.verdict) &&
      (filters.category === "ALL" || item.category === filters.category) &&
      (filters.severity === "ALL" || item.severity === filters.severity) &&
      (filters.evaluator === "ALL" ||
        item.evaluations.some(({ evaluatorId }) => evaluatorId === filters.evaluator)) &&
      (search === "" ||
        `${item.caseId} ${item.category} ${item.severity} ${(item.tags ?? []).join(" ")} ${item.evaluations.map(({ evaluatorId }) => evaluatorId).join(" ")}`
          .toLowerCase()
          .includes(search)),
  );
}

function CaseTable({ artifactId, cases }: { artifactId: string; cases: ArtifactCase[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Case</th>
            <th>Verdict</th>
            <th>Category</th>
            <th>Severity</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((item) => (
            <tr key={item.caseId}>
              <td>
                <Link className="mono" to={`/artifacts/${artifactId}/cases/${item.caseId}`}>
                  {item.caseId}
                </Link>
              </td>
              <td>
                <span className={`case-verdict case-verdict--${item.verdict.toLowerCase()}`}>
                  {item.verdict}
                </span>
              </td>
              <td>{item.category}</td>
              <td>{item.severity}</td>
              <td>{item.score?.toFixed(3) ?? "Unavailable"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CasePage() {
  const { artifactId = "", caseId = "" } = useParams();
  const query = useQuery({
    queryKey: ["artifact", artifactId],
    queryFn: () => getArtifact(artifactId),
    retry: false,
  });
  if (query.isPending) return <LoadingState />;
  const item = query.data?.artifact.cases.find((candidate) => candidate.caseId === caseId);
  if (query.isError || item === undefined) return <NotFoundPage title="Case not found" />;
  return (
    <div className="page">
      <Link className="back-link" to={`/artifacts/${artifactId}`}>
        ← Result
      </Link>
      <header className="page-header">
        <div>
          <Eyebrow>CASE EVIDENCE</Eyebrow>
          <h1 className="mono">{item.caseId}</h1>
          <p>
            {item.category} · {item.severity}
          </p>
        </div>
        <span className={`case-verdict case-verdict--${item.verdict.toLowerCase()}`}>
          {item.verdict}
        </span>
      </header>
      <Panel title="Response boundary">
        <p className="evidence-text">{item.generation?.text ?? "Response unavailable."}</p>
      </Panel>
      <Panel title={`${item.evaluations.length} evaluator results`}>
        <div className="evaluation-list">
          {item.evaluations.map((evaluation) => (
            <article key={evaluation.evaluatorId} className="evaluation">
              <header>
                <strong className="mono">{evaluation.evaluatorId}</strong>
                <span className={`case-verdict case-verdict--${evaluation.verdict.toLowerCase()}`}>
                  {evaluation.verdict}
                </span>
              </header>
              <p>{evaluation.reason}</p>
              {evaluation.evidence === undefined ? (
                <small>Evidence unavailable.</small>
              ) : (
                <pre>{JSON.stringify(evaluation.evidence, null, 2)}</pre>
              )}
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function NewRunPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const projectId = params.get("project") ?? bootstrap.data?.projects[0]?.id ?? "";
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: projectId.length > 0,
  });
  const scenarioId = params.get("scenario");
  const scenario =
    project.data?.scenarios.find(({ id }) => id === scenarioId) ?? project.data?.scenarios[0];
  const [targetId, setTargetId] = useState("");
  const [suiteId, setSuiteId] = useState("");
  const [fixtureSetId, setFixtureSetId] = useState("");
  const [caseIds, setCaseIds] = useState("");
  const [categories, setCategories] = useState("");
  const [severities, setSeverities] = useState("");
  const [tags, setTags] = useState("");
  const [concurrency, setConcurrency] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("");
  const [maxRetries, setMaxRetries] = useState("");
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof planRun>>>();
  const planErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scenario === undefined) return;
    setTargetId(scenario.targetId);
    setSuiteId(scenario.suiteId);
    setFixtureSetId(scenario.fixtureSetId ?? "");
    setCaseIds(scenario.filters?.caseIds?.join(", ") ?? "");
    setCategories(scenario.filters?.categories?.join(", ") ?? "");
    setSeverities(scenario.filters?.severities?.join(", ") ?? "");
    setTags(scenario.filters?.tags?.join(", ") ?? "");
  }, [scenario]);

  const list = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const input = useMemo<StudioRunRequest>(() => {
    const filters = {
      ...(caseIds.trim() === "" ? {} : { caseIds: list(caseIds) }),
      ...(categories.trim() === "" ? {} : { categories: list(categories) }),
      ...(severities.trim() === ""
        ? {}
        : {
            severities: list(severities) as Array<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">,
          }),
      ...(tags.trim() === "" ? {} : { tags: list(tags) }),
    };
    const executionOverrides = {
      ...(concurrency === "" ? {} : { concurrency: Number(concurrency) }),
      ...(timeoutMs === "" ? {} : { timeoutMs: Number(timeoutMs) }),
      ...(maxRetries === "" ? {} : { maxRetries: Number(maxRetries) }),
    };
    return {
      projectId,
      targetId,
      suiteId,
      ...(fixtureSetId === "" ? {} : { fixtureSetId }),
      ...(Object.keys(filters).length === 0 ? {} : { filters }),
      ...(Object.keys(executionOverrides).length === 0 ? {} : { executionOverrides }),
    };
  }, [
    caseIds,
    categories,
    concurrency,
    fixtureSetId,
    maxRetries,
    projectId,
    severities,
    suiteId,
    tags,
    targetId,
    timeoutMs,
  ]);
  const planMutation = useMutation({
    mutationFn: async () => {
      const token = bootstrap.data?.csrfToken;
      if (token === undefined) throw new Error("Session is not ready.");
      await validateRun(input, token);
      return planRun(input, token);
    },
    onSuccess: setPlan,
  });
  const runMutation = useMutation({
    mutationFn: async () => {
      const token = bootstrap.data?.csrfToken;
      if (token === undefined) throw new Error("Session is not ready.");
      return startRun(input, token);
    },
    onSuccess: ({ runId }) => navigate(`/runs/${runId}`),
  });
  useEffect(() => {
    if (planMutation.isError) planErrorRef.current?.focus();
  }, [planMutation.isError]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    planMutation.mutate();
  };
  if (bootstrap.isPending || project.isPending) return <LoadingState />;
  if (bootstrap.isError || project.isError || project.data === undefined)
    return (
      <EmptyState title="Run setup unavailable">
        The registered project could not be loaded.
      </EmptyState>
    );
  const selectedSuite = project.data.suites.find(({ id }) => id === suiteId);
  const selectedTarget = project.data.targets.find(({ id }) => id === targetId);
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Eyebrow>CONTROLLED EXECUTION</Eyebrow>
          <h1>New run</h1>
          <p>Select only registered resources. Validation and planning make zero provider calls.</p>
        </div>
      </header>
      <form className="run-form" onSubmit={submit}>
        <label>
          Target
          <select
            value={targetId}
            onChange={(event) => {
              setTargetId(event.target.value);
              setPlan(undefined);
            }}
          >
            {project.data.targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.id} · {target.model} · {target.ready ? "Ready" : "Not configured"}
              </option>
            ))}
          </select>
        </label>
        {selectedTarget?.ready === false && (
          <div className="form-error" role="alert">
            This provider is not configured on the server. Add its environment credential and
            restart Studio; credentials are never entered in the browser.
          </div>
        )}
        <label>
          Suite
          <select
            value={suiteId}
            onChange={(event) => {
              setSuiteId(event.target.value);
              setPlan(undefined);
            }}
          >
            {project.data.suites.map((suite) => (
              <option key={suite.id} value={suite.id}>
                {suite.name} · {suite.caseCount} cases
              </option>
            ))}
          </select>
        </label>
        <label>
          Fixture set
          <select
            value={fixtureSetId}
            onChange={(event) => {
              setFixtureSetId(event.target.value);
              setPlan(undefined);
            }}
          >
            <option value="">None</option>
            {selectedSuite?.fixtureSets.map((fixture) => (
              <option key={fixture.id} value={fixture.id}>
                {fixture.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Case IDs <span>(comma-separated)</span>
          <input
            value={caseIds}
            onChange={(event) => {
              setCaseIds(event.target.value);
              setPlan(undefined);
            }}
            placeholder="REFUND_001"
          />
        </label>
        <label>
          Categories <span>(comma-separated)</span>
          <input
            value={categories}
            onChange={(event) => {
              setCategories(event.target.value);
              setPlan(undefined);
            }}
            placeholder="refund_policy"
          />
        </label>
        <label>
          Severities <span>(LOW, MEDIUM, HIGH, CRITICAL)</span>
          <input
            value={severities}
            onChange={(event) => {
              setSeverities(event.target.value.toUpperCase());
              setPlan(undefined);
            }}
            placeholder="CRITICAL"
          />
        </label>
        <label>
          Tags <span>(comma-separated)</span>
          <input
            value={tags}
            onChange={(event) => {
              setTags(event.target.value);
              setPlan(undefined);
            }}
            placeholder="regression, policy"
          />
        </label>
        <fieldset className="run-form__overrides">
          <legend>Execution overrides</legend>
          <label>
            Concurrency
            <input
              type="number"
              min="1"
              max="100"
              value={concurrency}
              onChange={(event) => {
                setConcurrency(event.target.value);
                setPlan(undefined);
              }}
            />
          </label>
          <label>
            Timeout (ms)
            <input
              type="number"
              min="100"
              max="600000"
              value={timeoutMs}
              onChange={(event) => {
                setTimeoutMs(event.target.value);
                setPlan(undefined);
              }}
            />
          </label>
          <label>
            Max retries
            <input
              type="number"
              min="0"
              max="10"
              value={maxRetries}
              onChange={(event) => {
                setMaxRetries(event.target.value);
                setPlan(undefined);
              }}
            />
          </label>
        </fieldset>
        {planMutation.isError && (
          <div className="form-error" role="alert" tabIndex={-1} ref={planErrorRef}>
            Validation failed. Review the registered selections and filters.
          </div>
        )}
        <div className="form-actions">
          <button type="submit" disabled={planMutation.isPending || selectedTarget?.ready !== true}>
            Validate & plan
          </button>
          <button
            type="button"
            className="primary"
            disabled={plan === undefined || runMutation.isPending || selectedTarget?.ready !== true}
            onClick={() => runMutation.mutate()}
          >
            Start evaluation
          </button>
        </div>
      </form>
      {plan !== undefined && (
        <Panel title="Authoritative run plan">
          <div className="metric-grid compact">
            <div>
              <span>Selected</span>
              <strong>{plan.selectedCases}</strong>
            </div>
            <div>
              <span>Maximum calls</span>
              <strong>{plan.maximumCalls}</strong>
            </div>
            <div>
              <span>Cost</span>
              <strong>{plan.preflightCost === "UNAVAILABLE" ? "N/A" : "READY"}</strong>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

export function LiveRunPage() {
  const { runId = "" } = useParams();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState({ selected: 0, running: 0, completed: 0 });
  const [connection, setConnection] = useState<"CONNECTED" | "DISCONNECTED">("CONNECTED");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const pendingProgress = useRef<
    { selected: number; running: number; completed: number } | undefined
  >(undefined);
  const progressFrame = useRef<number | undefined>(undefined);
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => getRun(runId),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state !== undefined &&
        [
          "CANCELLED",
          "COMPLETED",
          "QUALITY_FAILED",
          "OPERATIONAL_FAILED",
          "INTERNAL_FAILED",
        ].includes(state)
        ? false
        : 1000;
    },
    retry: false,
  });
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const token = bootstrap.data?.csrfToken;
      if (token === undefined) throw new Error("Session is not ready.");
      return cancelRun(runId, token);
    },
    onSuccess: (snapshot) => queryClient.setQueryData(["run", runId], snapshot),
  });
  useEffect(() => {
    const scheduleProgress = (next: { selected: number; running: number; completed: number }) => {
      pendingProgress.current = next;
      if (progressFrame.current !== undefined) return;
      progressFrame.current = window.requestAnimationFrame(() => {
        if (pendingProgress.current !== undefined) setProgress(pendingProgress.current);
        pendingProgress.current = undefined;
        progressFrame.current = undefined;
      });
    };
    const unsubscribe = subscribeToRun(
      runId,
      (event) => {
        scheduleProgress({
          selected: event.progress.selected,
          running: event.progress.running,
          completed: event.progress.completed,
        });
        if (["run.completed", "run.failed", "snapshot.required"].includes(event.type))
          void queryClient.invalidateQueries({ queryKey: ["run", runId] });
      },
      setConnection,
    );
    return () => {
      unsubscribe();
      if (progressFrame.current !== undefined) window.cancelAnimationFrame(progressFrame.current);
      progressFrame.current = undefined;
      pendingProgress.current = undefined;
    };
  }, [connectionAttempt, queryClient, runId]);
  if (run.isPending) return <LoadingState label="Connecting to run" />;
  if (run.isError) return <NotFoundPage title="Run not found" />;
  const snapshot = run.data;
  const total = progress.selected || snapshot.selectedCases;
  const completed = Math.max(progress.completed, snapshot.completedCases);
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Eyebrow>LIVE RUN · PRELIMINARY</Eyebrow>
          <h1 className="mono">{snapshot.runId}</h1>
          <p>Progress is observational. The final artifact remains authoritative.</p>
        </div>
        <span className="run-state">{snapshot.state}</span>
      </header>
      <Panel title="Execution progress">
        <progress max={Math.max(1, total)} value={completed} aria-label="Completed cases" />
        <div className="progress-copy" aria-live="polite">
          <strong>
            {completed} / {total}
          </strong>
          <span>{progress.running} running</span>
        </div>
      </Panel>
      {connection === "DISCONNECTED" && (
        <div className="form-error" role="alert">
          Live updates are temporarily disconnected. The canonical run continues on the server.
          <button
            type="button"
            onClick={() => {
              setConnection("CONNECTED");
              setConnectionAttempt((value) => value + 1);
              void queryClient.invalidateQueries({ queryKey: ["run", runId] });
            }}
          >
            Reconnect
          </button>
        </div>
      )}
      {["CREATED", "VALIDATING", "READY", "RUNNING"].includes(snapshot.state) && (
        <button
          type="button"
          className="danger-button"
          disabled={cancelMutation.isPending || bootstrap.isPending}
          onClick={() => cancelMutation.mutate()}
        >
          Cancel run
        </button>
      )}
      {snapshot.state === "CANCELLING" && (
        <p className="prose" role="status">
          Cancelling safely. Completed evidence will be preserved.
        </p>
      )}
      {snapshot.safeMessage !== undefined && (
        <div className="form-error" role="alert">
          {snapshot.safeMessage}
        </div>
      )}
      {snapshot.artifactId !== undefined && (
        <Panel title="Canonical evidence ready">
          <Link className="primary-link" to={`/artifacts/${snapshot.artifactId}`}>
            Open result →
          </Link>
        </Panel>
      )}
    </div>
  );
}

export function NotFoundPage({ title = "Page not found" }: { title?: string }) {
  return (
    <div className="page">
      <EmptyState title={title}>
        The requested local resource does not exist or is no longer indexed.{" "}
        <Link to="/">Return to Overview</Link>.
      </EmptyState>
    </div>
  );
}
