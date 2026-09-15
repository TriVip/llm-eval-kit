import { redactValue, type BaselineComparison, type RunArtifact } from "@llm-eval-kit/core";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function renderHtmlReport(artifact: RunArtifact, comparison?: BaselineComparison): string {
  const safeArtifact = redactValue(artifact) as RunArtifact;
  const rows = safeArtifact.cases
    .map(
      (item) => `<tr data-verdict="${escapeHtml(item.verdict)}">
<td>${escapeHtml(item.caseId)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.severity)}</td>
<td><strong>${escapeHtml(item.verdict)}</strong></td><td>${escapeHtml(item.score ?? "—")}</td>
<td><details><summary>View</summary><pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre></details></td></tr>`,
    )
    .join("\n");
  const deltas = comparison?.categories
    .map(
      ({ category, passRate }) =>
        `<tr><td>${escapeHtml(category)}</td><td>${percent(passRate.baseline)}</td><td>${percent(passRate.candidate)}</td><td>${(passRate.delta * 100).toFixed(2)} pp</td></tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>LLM Evaluation ${escapeHtml(safeArtifact.metadata.runId)}</title>
<style>body{font-family:system-ui;margin:2rem;color:#172033}main{max-width:1200px;margin:auto}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem}.card{padding:1rem;border:1px solid #d8deea;border-radius:.6rem}table{border-collapse:collapse;width:100%;margin:1.25rem 0}th,td{border-bottom:1px solid #d8deea;padding:.65rem;text-align:left;vertical-align:top}pre{white-space:pre-wrap;max-width:52rem}.QUALITY_FAILED,.OPERATIONAL_FAILED{color:#a11}.PASSED{color:#176b36}button{margin:.25rem;padding:.45rem .7rem}</style></head>
<body><main><h1>LLM Evaluation Report</h1><div class="cards">
<div class="card"><small>Status</small><div class="${escapeHtml(safeArtifact.status)}">${escapeHtml(safeArtifact.status)}</div></div>
<div class="card"><small>Pass rate</small><div>${percent(safeArtifact.metrics.passRate)}</div></div>
<div class="card"><small>Cases</small><div>${safeArtifact.metrics.selectedCases}</div></div>
<div class="card"><small>Errors</small><div>${safeArtifact.metrics.errorCases}</div></div></div>
<h2>Gate reasons</h2><ul>${safeArtifact.gateFailures.map((item) => `<li><strong>${escapeHtml(item.code)}</strong>: ${escapeHtml(item.reason)}</li>`).join("") || "<li>None</li>"}</ul>
${comparison === undefined ? "" : `<h2>Baseline deltas</h2><table><thead><tr><th>Category</th><th>Baseline</th><th>Candidate</th><th>Delta</th></tr></thead><tbody>${deltas}</tbody></table>`}
<h2>Case details</h2><div><button data-filter="ALL">All</button><button data-filter="FAIL">Failures</button><button data-filter="ERROR">Errors</button></div>
<table><thead><tr><th>Case</th><th>Category</th><th>Severity</th><th>Verdict</th><th>Score</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table>
<script>document.querySelectorAll('[data-filter]').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('tbody tr[data-verdict]').forEach(function(r){r.hidden=b.dataset.filter!=='ALL'&&r.dataset.filter!==r.dataset.verdict})})})</script>
</main></body></html>\n`;
}
