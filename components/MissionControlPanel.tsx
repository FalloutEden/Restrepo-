"use client";

import type { ChangeEvent, FormEvent } from "react";
import type { ExecutionMode, Mission, MissionPriority } from "@/lib/missions";

type MissionControlPanelProps = {
  goal: string;
  constraints: string;
  priority: MissionPriority;
  executionMode: ExecutionMode;
  outboundApproved: boolean;
  activeMission: Mission | null;
  onGoalChange: (value: string) => void;
  onConstraintsChange: (value: string) => void;
  onPriorityChange: (value: MissionPriority) => void;
  onExecutionModeChange: (value: ExecutionMode) => void;
  onOutboundApprovedChange: (value: boolean) => void;
  onSubmit: () => void;
};

export function MissionControlPanel({
  goal,
  constraints,
  priority,
  executionMode,
  outboundApproved,
  activeMission,
  onGoalChange,
  onConstraintsChange,
  onPriorityChange,
  onExecutionModeChange,
  onOutboundApprovedChange,
  onSubmit
}: MissionControlPanelProps) {
  const isRunning = activeMission?.status === "Running" || activeMission?.status === "Queued";

  return (
    <section className="mission-panel">
      <div className="mission-panel-copy">
        <span className="eyebrow">Etsy Automation Workflow</span>
        <h2 className="section-title">Issue one digital Etsy product objective and let the pipeline assemble a ready-to-review listing.</h2>
        <p className="section-copy">
          The workflow runs four steps in order: research, product concept, listing generation, and approval packaging.
          Publishing stays blocked until you explicitly approve the product.
        </p>
      </div>

      <form
        className="mission-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="field-block">
          <span className="field-label">Product Goal</span>
          <textarea
            className="mission-input mission-textarea"
            value={goal}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onGoalChange(event.target.value)}
            placeholder="Generate one Etsy digital product listing for planners, trackers, templates, or printable kits..."
            rows={5}
          />
        </label>

        <div className="mission-form-row">
          <label className="field-block">
            <span className="field-label">Constraints</span>
            <textarea
              className="mission-input mission-textarea mission-textarea-compact"
              value={constraints}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onConstraintsChange(event.target.value)}
              placeholder="Digital products only. Return one listing only. Include title, full description, 13 tags, price, product contents, file delivery description, and mockup prompt."
              rows={4}
            />
          </label>

          <label className="field-block">
            <span className="field-label">Priority</span>
            <select
              className="mission-input mission-select"
              value={priority}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => onPriorityChange(event.target.value as MissionPriority)}
            >
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Standard">Standard</option>
            </select>

            <span className="field-label">Execution Mode</span>
            <select
              className="mission-input mission-select"
              value={executionMode}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => onExecutionModeChange(event.target.value as ExecutionMode)}
            >
              <option value="internal">Internal</option>
              <option value="local">Local</option>
              <option value="outbound">Outbound</option>
            </select>

            {executionMode === "outbound" ? (
              <label className="approval-checkbox">
                <input
                  type="checkbox"
                  checked={outboundApproved}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => onOutboundApprovedChange(event.target.checked)}
                />
                <span>Outbound approval granted for this mission</span>
              </label>
            ) : null}

            <div className="approval-guard">
              <span className="guard-title">Approval Boundary</span>
              <p className="guard-copy">
                Internal and local modes remain approval-safe. Any future outbound publishing step still requires outbound mode and explicit approval.
              </p>
            </div>
          </label>
        </div>

        <div className="mission-form-footer">
          <div className="mission-callout">
            <span className="field-label">Launch Surface</span>
            <p className="mission-callout-copy">
              Start here to generate one digital Etsy listing package. The workflow output will appear below and then move into the archive after completion.
            </p>
          </div>

          <button type="submit" className="mission-run-button" disabled={isRunning || !goal.trim()}>
            {isRunning ? "Mission Running" : "Run Mission"}
          </button>
        </div>
      </form>
    </section>
  );
}
