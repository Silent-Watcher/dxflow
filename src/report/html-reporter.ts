import { writeFile } from "node:fs/promises";
import type { ScenarioReport, StepResult } from "../types.js";

/** Renders a self-contained HTML report (inline CSS, inline SVG chart, no external assets). */
export function renderHtmlReport(report: ScenarioReport): string {
  const rows = report.steps.map((step, index) => renderStepRow(step, index)).join("\n");
  const chart = renderTimingChart(report.steps);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Scenario Report: ${escapeHtml(report.scenarioName)}</title>
<style>
  :root {
    --pass: #16a34a;
    --fail: #dc2626;
    --bg: #f8fafc;
    --border: #e2e8f0;
    --text: #0f172a;
    --muted: #64748b;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 2rem;
    background: var(--bg);
    color: var(--text);
  }
  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
  .meta { color: var(--muted); margin-bottom: 1.5rem; font-size: 0.9rem; }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.8rem;
    color: white;
  }
  .badge.passed { background: var(--pass); }
  .badge.failed { background: var(--fail); }
  .summary {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .stat {
    background: white;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1rem;
  }
  .stat .label { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .value { font-size: 1.4rem; font-weight: 700; margin-top: 0.25rem; }
  table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  th, td { text-align: left; padding: 0.6rem 0.9rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
  th { background: #f1f5f9; color: var(--muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  tr:last-child td { border-bottom: none; }
  .status-pass { color: var(--pass); font-weight: 600; }
  .status-fail { color: var(--fail); font-weight: 600; }
  .error-detail { color: var(--fail); font-size: 0.8rem; margin-top: 0.25rem; }
  .chart-section { margin: 2rem 0; }
  .chart-section h2 { font-size: 1rem; margin-bottom: 0.75rem; }
</style>
</head>
<body>
  <h1>${escapeHtml(report.scenarioName)}</h1>
  <div class="meta">
    ${escapeHtml(report.manifestPath)} &middot;
    <span class="badge ${report.success ? "passed" : "failed"}">${report.success ? "PASSED" : "FAILED"}</span>
  </div>

  <div class="summary">
    <div class="stat"><div class="label">Total steps</div><div class="value">${report.summary.totalSteps}</div></div>
    <div class="stat"><div class="label">Passed</div><div class="value">${report.summary.passedSteps}</div></div>
    <div class="stat"><div class="label">Failed</div><div class="value">${report.summary.failedSteps}</div></div>
    <div class="stat"><div class="label">Avg duration</div><div class="value">${report.summary.averageDurationMs.toFixed(0)}ms</div></div>
    <div class="stat"><div class="label">Total time</div><div class="value">${report.totalDurationMs}ms</div></div>
  </div>

  <div class="chart-section">
    <h2>Step duration (ms)</h2>
    ${chart}
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>Step</th><th>Method</th><th>URL</th><th>Status</th><th>Duration</th><th>Result</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>
`;
}

function renderStepRow(step: StepResult, index: number): string {
  const statusLabel = step.response ? String(step.response.status) : "ERR";
  const resultClass = step.success ? "status-pass" : "status-fail";
  const resultLabel = step.success ? "PASS" : "FAIL";
  const errorBlock = step.error
    ? `<div class="error-detail">${escapeHtml(step.error)}</div>`
    : "";

  return `      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(step.name ?? step.id)}</td>
        <td>${escapeHtml(step.request.method)}</td>
        <td>${escapeHtml(step.request.url)}</td>
        <td>${escapeHtml(statusLabel)}</td>
        <td>${step.timing.durationMs}ms</td>
        <td class="${resultClass}">${resultLabel}${errorBlock}</td>
      </tr>`;
}

function renderTimingChart(steps: StepResult[]): string {
  if (steps.length === 0) {
    return "<p>No steps were executed.</p>";
  }

  const width = 720;
  const barHeight = 28;
  const gap = 8;
  const labelWidth = 160;
  const chartWidth = width - labelWidth - 80;
  const height = steps.length * (barHeight + gap);
  const maxDuration = Math.max(...steps.map((step) => step.timing.durationMs), 1);

  const bars = steps
    .map((step, index) => {
      const y = index * (barHeight + gap);
      const barWidth = Math.max((step.timing.durationMs / maxDuration) * chartWidth, 2);
      const color = step.success ? "#16a34a" : "#dc2626";
      const label = escapeHtml(step.name ?? step.id);
      return `
    <text x="0" y="${y + barHeight / 2 + 4}" font-size="12" fill="#0f172a">${label}</text>
    <rect x="${labelWidth}" y="${y}" width="${barWidth.toFixed(1)}" height="${barHeight}" fill="${color}" rx="4" />
    <text x="${labelWidth + barWidth + 8}" y="${y + barHeight / 2 + 4}" font-size="12" fill="#64748b">${step.timing.durationMs}ms</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${bars}
  </svg>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Writes the HTML report to the given file path, creating/overwriting it. */
export async function writeHtmlReport(report: ScenarioReport, outputPath: string): Promise<void> {
  await writeFile(outputPath, renderHtmlReport(report), "utf-8");
}
