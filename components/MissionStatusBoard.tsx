"use client";

import type { Mission, MissionArtifact, MissionTask } from "@/lib/missions";

type MissionStatusBoardProps = {
  mission: Mission | null;
  tasks: MissionTask[];
  artifacts: MissionArtifact[];
  onApproveForOutbound: () => void;
};

function getMissionProgress(tasks: MissionTask[]) {
  if (tasks.length === 0) {
    return 0;
  }

  const completed = tasks.filter((task) => task.status === "Completed").length;
  return Math.round((completed / tasks.length) * 100);
}

export function MissionStatusBoard({ mission, tasks, artifacts, onApproveForOutbound }: MissionStatusBoardProps) {
  const progress = getMissionProgress(tasks);
  const completedCount = tasks.filter((task) => task.status === "Completed").length;
  const runningTask = tasks.find((task) => task.status === "Running") ?? null;

  return (
    <section className="status-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">Live Pipeline State</span>
          <h2 className="section-title">Etsy workflow execution board</h2>
        </div>
        <div className="mission-progress-card">
          <span className="stat-label">Pipeline Progress</span>
          <span className="stat-value">{progress}%</span>
        </div>
      </div>

      {mission ? (
        <div className="runner-grid">
          <article className="runner-card runner-card-primary">
            <div className="runner-card-header">
              <div>
                <span className="field-label">Current Pipeline</span>
                <h3 className="runner-title">{mission.title}</h3>
              </div>
              <span className={`runner-chip runner-chip-${mission.status.toLowerCase()}`}>{mission.status}</span>
            </div>

            <p className="runner-body">{mission.goal}</p>

            <div className="progress-bar" aria-hidden="true">
              <span className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>

            <div className="mission-meta-grid">
              <div className="detail-card">
                <h3>Timeline</h3>
                <p className="detail-body">
                  Created {mission.createdAt}
                  <br />
                  Started {mission.startedAt ?? "Awaiting launch"}
                  <br />
                  Completed {mission.completedAt ?? "Still running"}
                </p>
              </div>
              <div className="detail-card">
                <h3>Execution Mode</h3>
                <p className="detail-body">
                  Mode {mission.executionMode}
                  <br />
                  Approval {mission.approvalStatus === "granted" ? "Granted" : "Not granted"}
                </p>
                {mission.status === "Completed" && !mission.approved ? (
                  <div className="export-actions">
                    <button type="button" className="export-button" onClick={onApproveForOutbound}>
                      Approve Product
                    </button>
                  </div>
                ) : null}
                {mission.approved ? <p className="detail-body">Approved for future publishing</p> : null}
              </div>
              <div className="detail-card">
                <h3>Recommended Next Action</h3>
                <p className="detail-body">{mission.recommendedNextAction}</p>
              </div>
            </div>
          </article>

          <aside className="runner-side-column">
            <section className="detail-card">
              <h3>Current Step</h3>
              <p className="detail-body">
                {runningTask ? `${runningTask.assignedAgent}: ${runningTask.title}` : "No active step. Pipeline may be queued or complete."}
              </p>
            </section>

            <section className="detail-card">
              <h3>Runner Totals</h3>
              <p className="detail-body">
                {completedCount}/{tasks.length} tasks complete
                <br />
                {artifacts.length} artifacts prepared
              </p>
            </section>

            <section className="detail-card">
              <h3>Constraints</h3>
              <div className="constraint-list">
                {mission.constraints.map((constraint) => (
                  <span key={constraint} className="constraint-chip">
                    {constraint}
                  </span>
                ))}
              </div>
            </section>
          </aside>
        </div>
      ) : (
        <div className="empty-shell">
          <h3 className="runner-title">No pipeline running yet</h3>
          <p className="detail-body">
            Use the workflow above to issue an Etsy product objective. The system will pass one listing through
            research, concept creation, listing generation, and approval packaging.
          </p>
        </div>
      )}

      <div className="task-grid">
        {tasks.map((task) => (
          <article key={task.id} className="task-card">
            <div className="runner-card-header">
              <div>
                <span className="field-label">{task.assignedAgent}</span>
                <h3 className="task-title">{task.title}</h3>
              </div>
              <span className={`runner-chip runner-chip-${task.status.toLowerCase()}`}>{task.status}</span>
            </div>
            <p className="detail-body">{task.description}</p>
            <p className="task-output">{task.outputSummary}</p>
            <span className="agent-meta">Mode {task.executionMode}</span>
            {task.error ? <p className="detail-body">{task.error}</p> : null}
            <span className="agent-meta">
              {task.completedAt ? `Completed ${task.completedAt}` : task.startedAt ? `Started ${task.startedAt}` : "Queued for runner"}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
