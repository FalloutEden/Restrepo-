"use client";

import type { AutomationStage, WorkflowTemplate } from "@/lib/dataset-models";

type WorkflowStudioProps = {
  templates: WorkflowTemplate[];
  selectedTemplateId: string;
  workflowStages: AutomationStage[];
  workflowUsage: Record<string, number>;
  onSelectTemplate: (templateId: string) => void;
  onMoveStage: (index: number, direction: -1 | 1) => void;
  onRemoveStage: (index: number) => void;
  onAddStage: (stage: AutomationStage) => void;
  onResetStages: () => void;
};

const AVAILABLE_STAGES: AutomationStage[] = ["research", "validate", "design", "list"];

export function WorkflowStudio({
  templates,
  selectedTemplateId,
  workflowStages,
  workflowUsage,
  onSelectTemplate,
  onMoveStage,
  onRemoveStage,
  onAddStage,
  onResetStages
}: WorkflowStudioProps) {
  return (
    <section className="archive-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">Workflow Templates</span>
          <h2 className="section-title">Launch one-click workflows or customize the agent chain for power-user control</h2>
          <p className="section-copy">
            Choose a ready-made workflow for high-demand gigs, trending designs, or validation and listing. Then adjust the research, validate,
            design, and list stages to fit your own automation chain.
          </p>
        </div>
      </div>

      <div className="catalogue-grid">
        {templates.map((template) => {
          const usageCount = workflowUsage[template.id] ?? 0;
          const isSelected = template.id === selectedTemplateId;

          return (
            <article key={template.id} className={`detail-card catalogue-card ${isSelected ? "catalogue-card-selected" : ""}`}>
              <div className="runner-card-header">
                <div>
                  <span className="field-label">{template.defaultChannel}</span>
                  <h3 className="task-title">{template.name}</h3>
                </div>
                <span className={`runner-chip ${usageCount > 0 ? "runner-chip-approved" : "runner-chip-pending"}`}>
                  {usageCount > 0 ? `Used ${usageCount}x` : "New"}
                </span>
              </div>

              <p className="detail-body">{template.description}</p>
              <p className="detail-body">Outcome: {template.outcome}</p>
              <p className="detail-body">Primary metric: {template.heroMetric}</p>

              <div className="listing-tag-grid">
                {template.recommendedDatasetTags.map((tag) => (
                  <span key={tag} className="listing-tag-chip">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="workflow-stage-strip">
                {template.stages.map((stage) => (
                  <span key={`${template.id}-${stage}`} className="runner-chip runner-chip-running">
                    {stage}
                  </span>
                ))}
              </div>

              <button type="button" className="export-button" onClick={() => onSelectTemplate(template.id)}>
                {isSelected ? "Template Active" : "Use Template"}
              </button>
            </article>
          );
        })}
      </div>

      <section className="detail-card workflow-editor-shell">
        <div className="runner-card-header">
          <div>
            <span className="field-label">Workflow Editor</span>
            <h3 className="task-title">Customize the agent chain</h3>
          </div>
          <button type="button" className="export-button" onClick={onResetStages}>
            Reset Chain
          </button>
        </div>

        <div className="workflow-stage-editor">
          {workflowStages.map((stage, index) => (
            <div key={`${stage}-${index}`} className="workflow-stage-card">
              <span className="runner-chip runner-chip-running">{stage}</span>
              <div className="export-actions">
                <button type="button" className="export-button" disabled={index === 0} onClick={() => onMoveStage(index, -1)}>
                  Move Up
                </button>
                <button
                  type="button"
                  className="export-button"
                  disabled={index === workflowStages.length - 1}
                  onClick={() => onMoveStage(index, 1)}
                >
                  Move Down
                </button>
                <button
                  type="button"
                  className="export-button"
                  disabled={workflowStages.length <= 1}
                  onClick={() => onRemoveStage(index)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="export-actions">
          {AVAILABLE_STAGES.map((stage) => (
            <button key={stage} type="button" className="export-button" onClick={() => onAddStage(stage)}>
              Add {stage}
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
