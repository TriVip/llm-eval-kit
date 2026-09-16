import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { getArtifact, getArtifacts, getBootstrap, getProject } from "./api.js";
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
            Inspect canonical LLM evaluation results, risk gates, and reviewed demo scenarios from
            one local, read-only workspace.
          </p>
        </div>
        <div className="hero__signal" aria-label="Studio status">
          <span>READ ONLY</span>
          <strong>Secure local evidence</strong>
          <small>Execution arrives in Sprint 8</small>
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
          <strong>OFF</strong>
          <small>Read-only boundary</small>
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
            <div className="scenario" key={scenario.id}>
              <span className="scenario__index">
                {String(project.data.scenarios.indexOf(scenario) + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{scenario.name}</strong>
                <small>
                  {scenario.targetId} · {scenario.suiteId}
                </small>
              </span>
            </div>
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
          Run the CLI to create canonical evidence, then restart this read-only Studio.
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
  const query = useQuery({
    queryKey: ["artifact", artifactId],
    queryFn: () => getArtifact(artifactId),
    retry: false,
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <NotFoundPage title="Artifact not found" />;
  const { summary } = query.data;
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
          This read-only slice confirms artifact identity and canonical metrics. Case-level
          investigation is deliberately scheduled for Sprint 8. Raw provider responses remain
          omitted.
        </p>
      </Panel>
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
