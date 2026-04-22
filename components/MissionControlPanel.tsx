"use client";

import type { ChangeEvent, FormEvent } from "react";
import type { CommerceChannel } from "@/lib/market-intelligence";
import type { ExecutionMode, Mission, MissionPriority } from "@/lib/missions";

type MissionControlPanelProps = {
  goal: string;
  constraints: string;
  channel: CommerceChannel;
  priority: MissionPriority;
  executionMode: ExecutionMode;
  outboundApproved: boolean;
  activeMission: Mission | null;
  isBusy?: boolean;
  onGoalChange: (value: string) => void;
  onConstraintsChange: (value: string) => void;
  onChannelChange: (value: CommerceChannel) => void;
  onPriorityChange: (value: MissionPriority) => void;
  onExecutionModeChange: (value: ExecutionMode) => void;
  onOutboundApprovedChange: (value: boolean) => void;
  onSubmit: () => void;
};

export function MissionControlPanel({
  goal,
  constraints,
  channel,
  priority,
  executionMode,
  outboundApproved,
  activeMission,
  isBusy = false,
  onGoalChange,
  onConstraintsChange,
  onChannelChange,
  onPriorityChange,
  onExecutionModeChange,
  onOutboundApprovedChange,
  onSubmit
}: MissionControlPanelProps) {
  const isRunning = isBusy || activeMission?.status === "Running" || activeMission?.status === "Queued";

  return (
    <section className="mission-panel">
      <div className="mission-panel-copy">
        <span className="eyebrow">Autonomous Commerce System</span>
        <h2 className="section-title">Issue one broad command and let the OpenAI agent group run research, validate, design, and list workflows on your selected datasets.</h2>
        <p className="section-copy">
          The workflow now uses a server-side OpenAI runtime for orchestration, planning, and structured outputs. It researches references,
          feedback, and selected dataset catalogues, splits large inputs into token-safe batches, runs the eight-agent group with retry-aware
          orchestration, builds only the strongest draft candidates, and always waits for approval before any future outbound step.
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
          <span className="field-label">Autonomous Goal</span>
          <textarea
            className="mission-input mission-textarea"
            value={goal}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onGoalChange(event.target.value)}
            placeholder="Research and create jobs across all supported channels for sellable products or services."
            rows={5}
          />
        </label>

        <div className="mission-form-row">
          <label className="field-block">
            <span className="field-label">Research Guardrails</span>
            <textarea
              className="mission-input mission-textarea mission-textarea-compact"
              value={constraints}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onConstraintsChange(event.target.value)}
              placeholder="Never publish automatically. Keep printable generation, spreadsheet generation, listing generation, feedback learning, and approval review intact."
              rows={4}
            />
          </label>

          <label className="field-block">
            <span className="field-label">Channel Scope</span>
            <select
              className="mission-input mission-select"
              value={channel}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => onChannelChange(event.target.value as CommerceChannel)}
            >
              <option value="all">All Channels</option>
              <option value="etsy">Etsy</option>
              <option value="fiverr">Fiverr</option>
              <option value="print_on_demand">Print on Demand</option>
              <option value="content">Content</option>
              <option value="other">Other</option>
            </select>

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
                <span>Outbound approval granted for future manual steps</span>
              </label>
            ) : null}

            <div className="approval-guard">
              <span className="guard-title">Confidence Policy</span>
              <p className="guard-copy">
                Opportunities under 90 confidence stay in research or validation. Opportunities at 90 or higher can be built into drafts and
                moved toward design, listing, and approval. Automatic publishing always stays blocked.
              </p>
            </div>
          </label>
        </div>

        <div className="mission-form-footer">
          <div className="mission-callout">
            <span className="field-label">Run Behavior</span>
            <p className="mission-callout-copy">
              One run can create multiple opportunity jobs. The system will use the chosen workflow stages and selected datasets to research,
              validate, design, and prepare listing-ready drafts before placing them into review-ready queues.
            </p>
          </div>

          <button type="submit" className="mission-run-button" disabled={isRunning || !goal.trim()}>
            {isRunning ? "Agent Group Running" : "Run OpenAI Agent Group"}
          </button>
        </div>
      </form>
    </section>
  );
}
