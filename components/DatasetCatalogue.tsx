"use client";

import type { ChangeEvent } from "react";
import type { DatasetCatalogueEntry, DatasetKind } from "@/lib/dataset-models";
import type { CommerceChannel } from "@/lib/market-intelligence";

type DatasetCatalogueProps = {
  datasets: DatasetCatalogueEntry[];
  selectedDatasetKeys: string[];
  searchValue: string;
  kindFilter: DatasetKind | "all";
  channelFilter: CommerceChannel | "all";
  selectedTokenLoad: number;
  tokenLimit: number;
  estimatedBatchCount: number;
  onSearchChange: (value: string) => void;
  onKindFilterChange: (value: DatasetKind | "all") => void;
  onChannelFilterChange: (value: CommerceChannel | "all") => void;
  onToggleDataset: (datasetKey: string) => void;
  onSelectVisible: () => void;
  onClearSelection: () => void;
};

export function DatasetCatalogue({
  datasets,
  selectedDatasetKeys,
  searchValue,
  kindFilter,
  channelFilter,
  selectedTokenLoad,
  tokenLimit,
  estimatedBatchCount,
  onSearchChange,
  onKindFilterChange,
  onChannelFilterChange,
  onToggleDataset,
  onSelectVisible,
  onClearSelection
}: DatasetCatalogueProps) {
  return (
    <section className="archive-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">Data Catalogue</span>
          <h2 className="section-title">Browse the full training library and choose which datasets feed the agents</h2>
          <p className="section-copy">
            The catalogue includes jobs, gigs, print-on-demand evidence, Shopify signals, quality guidance, and instruction-style corpus
            metadata. Select the datasets you want the workflow to use, then run the real automation pipeline on those inputs.
          </p>
        </div>
      </div>

      <div className="catalogue-toolbar">
        <label className="field-block">
          <span className="field-label">Search</span>
          <input
            className="mission-input"
            value={searchValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)}
            placeholder="Search datasets, tags, workflows, or channels"
          />
        </label>

        <label className="field-block">
          <span className="field-label">Kind</span>
          <select
            className="mission-input mission-select"
            value={kindFilter}
            onChange={(event) => onKindFilterChange(event.target.value as DatasetKind | "all")}
          >
            <option value="all">All Kinds</option>
            <option value="market_evidence">Market Evidence</option>
            <option value="job_vocabulary">Job Vocabulary</option>
            <option value="quality_guidance">Quality Guidance</option>
            <option value="agent_guidance">Agent Guidance</option>
          </select>
        </label>

        <label className="field-block">
          <span className="field-label">Channel</span>
          <select
            className="mission-input mission-select"
            value={channelFilter}
            onChange={(event) => onChannelFilterChange(event.target.value as CommerceChannel | "all")}
          >
            <option value="all">All Channels</option>
            <option value="etsy">Etsy</option>
            <option value="fiverr">Fiverr</option>
            <option value="print_on_demand">Print on Demand</option>
            <option value="content">Content</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>

      <div className="export-actions">
        <button type="button" className="export-button" onClick={onSelectVisible}>
          Select Visible Datasets
        </button>
        <button type="button" className="export-button" onClick={onClearSelection}>
          Clear Selection
        </button>
        <p className="detail-body">Selected datasets: {selectedDatasetKeys.length}</p>
        <p className="detail-body">
          Estimated token load: {selectedTokenLoad.toLocaleString()} / {tokenLimit.toLocaleString()}
        </p>
        <p className={`detail-body ${selectedTokenLoad > tokenLimit ? "warning-copy" : ""}`}>
          {selectedTokenLoad > tokenLimit
            ? `Selection exceeds the per-minute target. The workflow will split it into about ${estimatedBatchCount} batches automatically.`
            : `Current selection fits within the per-minute target and will use about ${estimatedBatchCount} batch${estimatedBatchCount === 1 ? "" : "es"}.`}
        </p>
      </div>

      <div className="catalogue-grid">
        {datasets.map((dataset) => {
          const isSelected = selectedDatasetKeys.includes(dataset.key);

          return (
            <article key={dataset.key} className={`detail-card catalogue-card ${isSelected ? "catalogue-card-selected" : ""}`}>
              <div className="runner-card-header">
                <div>
                  <span className="field-label">{dataset.kind.replace(/_/g, " ")}</span>
                  <h3 className="task-title">{dataset.title}</h3>
                </div>
                <span className={`runner-chip ${dataset.loaded ? "runner-chip-approved" : "runner-chip-rejected"}`}>
                  {dataset.loaded ? "Loaded" : "Unavailable"}
                </span>
              </div>

              <p className="detail-body">{dataset.description}</p>
              <p className="detail-body">Why it matters: {dataset.emphasis}</p>
              <p className="detail-body">Examples: {dataset.exampleCount}</p>
              <p className="detail-body">Estimated tokens: {dataset.estimatedTokens.toLocaleString()}</p>
              <p className="detail-body">Channels: {dataset.channelCoverage.join(", ") || "Not inferred yet"}</p>
              <p className="detail-body">Workflow hints: {dataset.workflowHints.join(", ")}</p>
              {dataset.error ? (
                <div className="dataset-error-shell">
                  <p className="detail-body">Issue: {dataset.error}</p>
                  <p className="detail-body">Action: Check the file path, confirm valid JSON, then retry the workflow.</p>
                </div>
              ) : null}

              <div className="listing-tag-grid">
                {dataset.tags.map((tag) => (
                  <span key={tag} className="listing-tag-chip">
                    {tag}
                  </span>
                ))}
              </div>

              {dataset.previewItems.length > 0 ? (
                <div className="catalogue-preview-list">
                  {dataset.previewItems.map((preview) => (
                    <div key={`${dataset.key}-${preview.title}`} className="catalogue-preview-item">
                      <span className="field-label">{preview.channel}</span>
                      <p className="detail-body">{preview.title}</p>
                      <p className="detail-body">{preview.note}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                className="export-button"
                disabled={!dataset.loaded}
                onClick={() => onToggleDataset(dataset.key)}
              >
                {isSelected ? "Remove From Run" : "Use In Run"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
