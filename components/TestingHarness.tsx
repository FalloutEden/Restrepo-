"use client";

import type { WorkflowRunLog, WorkflowRunMetrics } from "@/lib/dataset-models";

type TestingHarnessProps = {
  isBusy: boolean;
  runLabel: string;
  errorMessage: string;
  selectedDatasetCount: number;
  selectedWorkflowName: string;
  tokenLoad: number;
  tokenLimit: number;
  batchCount: number;
  startupWarnings: string[];
  startupErrors: string[];
  logs: WorkflowRunLog[];
  metrics: WorkflowRunMetrics | null;
  onRun: () => void;
  onExport: () => void;
};

export function TestingHarness({
  isBusy,
  runLabel,
  errorMessage,
  selectedDatasetCount,
  selectedWorkflowName,
  tokenLoad,
  tokenLimit,
  batchCount,
  startupWarnings,
  startupErrors,
  logs,
  metrics,
  onRun,
  onExport
}: TestingHarnessProps) {
  return (
    <section className="archive-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">Testing Harness</span>
          <h2 className="section-title">Run real workflows on selected datasets, inspect logs, and export the audit trail</h2>
          <p className="section-copy">
            This harness executes the live automation pipeline against your selected datasets and workflow chain. It surfaces logs, heuristic
            metrics, and approval readiness so you can tune the system before committing more volume toward the $56k/month target.
          </p>
        </div>
      </div>

      <div className="report-section-grid">
        <section className="detail-card">
          <h3>Run Controls</h3>
          <p className="detail-body">Workflow: {selectedWorkflowName}</p>
          <p className="detail-body">Run label: {runLabel}</p>
          <p className="detail-body">Selected datasets: {selectedDatasetCount}</p>
          <p className="detail-body">
            Estimated token load: {tokenLoad.toLocaleString()} / {tokenLimit.toLocaleString()}
          </p>
          <p className={`detail-body ${tokenLoad > tokenLimit ? "warning-copy" : ""}`}>
            {tokenLoad > tokenLimit
              ? `The runtime will batch this run automatically in about ${batchCount} passes.`
              : `This run should fit in about ${batchCount} batch${batchCount === 1 ? "" : "es"}.`}
          </p>
          <div className="export-actions">
            <button type="button" className="mission-run-button" disabled={isBusy || selectedDatasetCount === 0 || startupErrors.length > 0} onClick={onRun}>
              {isBusy ? "Workflow Running" : "Run Workflow Test"}
            </button>
            <button type="button" className="export-button" disabled={logs.length === 0 && !metrics} onClick={onExport}>
              Export Results
            </button>
          </div>
          {errorMessage ? (
            <div className="dataset-error-shell">
              <p className="detail-body">Issue: {errorMessage}</p>
              <p className="detail-body">Action: Retry the workflow, change datasets, or adjust the workflow stages and goal.</p>
            </div>
          ) : null}
          {startupErrors.length > 0 ? (
            <div className="dataset-error-shell">
              <p className="detail-body">Fatal startup checks:</p>
              {startupErrors.map((error) => (
                <p key={error} className="detail-body">
                  {error}
                </p>
              ))}
            </div>
          ) : null}
          {startupWarnings.length > 0 ? (
            <div className="dataset-error-shell">
              <p className="detail-body">Startup checks:</p>
              {startupWarnings.map((warning) => (
                <p key={warning} className="detail-body">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </section>

        <section className="detail-card">
          <h3>Key Metrics</h3>
          {metrics ? (
            <div className="catalogue-metrics-grid">
              <p className="detail-body">Accuracy proxy: {metrics.accuracyProxy}%</p>
              <p className="detail-body">Average confidence: {metrics.averageConfidence}%</p>
              <p className="detail-body">Conversion readiness: {metrics.conversionReadiness}%</p>
              <p className="detail-body">Dataset coverage: {metrics.datasetCoverage}%</p>
              <p className="detail-body">
                Revenue estimate: ${metrics.revenueEstimateLow.toLocaleString()} - ${metrics.revenueEstimateHigh.toLocaleString()}
              </p>
              <p className="detail-body">Draft builds: {metrics.builtDraftCount}</p>
              <p className="detail-body">Approval ready: {metrics.approvalReadyCount}</p>
              <p className="detail-body">Batches used: {metrics.batchCount}</p>
              <p className="detail-body">Rate-limit retries: {metrics.throttledCallCount}</p>
              <p className="detail-body">Failed agents: {metrics.failedAgentCount}</p>
            </div>
          ) : (
            <p className="detail-body">Run a workflow test to populate live logs and metrics.</p>
          )}
        </section>
      </div>

      <section className="detail-card">
        <h3>Execution Logs</h3>
        {logs.length === 0 ? (
          <p className="detail-body">No logs yet. Run the workflow test to inspect the research, validation, design, and listing stages.</p>
        ) : (
          <div className="log-list">
            {logs.map((log) => (
              <article key={log.id} className="log-card">
                <div className="runner-card-header">
                  <span className={`runner-chip ${log.level === "error" ? "runner-chip-rejected" : log.level === "warning" ? "runner-chip-pending" : "runner-chip-approved"}`}>
                    {log.stage}
                  </span>
                  <span className="field-label">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="detail-body">{log.message}</p>
                {log.action ? <p className="detail-body">Action: {log.action}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
