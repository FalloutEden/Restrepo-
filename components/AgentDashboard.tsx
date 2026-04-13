"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgentCard } from "@/components/AgentCard";
import { AgentDetailModal } from "@/components/AgentDetailModal";
import { MissionArchive } from "@/components/MissionArchive";
import { MissionControlPanel } from "@/components/MissionControlPanel";
import { MorningReportView } from "@/components/MorningReportView";
import { MissionStatusBoard } from "@/components/MissionStatusBoard";
import { PublishQueueView } from "@/components/PublishQueueView";
import { runMissionExecution } from "@/lib/mission-executor";
import type { Agent } from "@/lib/mock-agents";
import {
  createPublishQueueItem,
  createMissionDraft,
  createMissionTasks,
  hydrateAgentsForMission,
  type ExecutionMode,
  type MissionPriority,
  type MissionRecord,
  type RunnerState
} from "@/lib/missions";

type AgentDashboardProps = {
  agents: Agent[];
};

export function AgentDashboard({ agents }: AgentDashboardProps) {
  const cancelExecutionRef = useRef<(() => void) | null>(null);
  const [missionGoal, setMissionGoal] = useState(
    "Generate one Etsy digital product listing in planners, trackers, templates, or printable kits that is ready for approval and later publishing."
  );
  const [missionConstraints, setMissionConstraints] = useState(
    "No live Etsy publishing.\nNo account changes or outbound actions.\nOnly digital Etsy products.\nReturn one complete listing with title, description, 13 tags, price, product contents, file delivery description, and mockup prompt."
  );
  const [missionPriority, setMissionPriority] = useState<MissionPriority>("High");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("local");
  const [outboundApproved, setOutboundApproved] = useState(false);
  const [runnerState, setRunnerState] = useState<RunnerState>({
    activeMission: null,
    tasks: [],
    artifacts: [],
    report: null,
    archive: [],
    publishQueue: []
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const liveAgents = useMemo(
    () => hydrateAgentsForMission(agents, runnerState.tasks, runnerState.activeMission),
    [agents, runnerState.activeMission, runnerState.tasks]
  );

  const selectedAgent = liveAgents.find((agent) => agent.id === selectedAgentId) ?? null;

  const runningCount = liveAgents.filter((agent) => agent.status === "Running").length;
  const healthyCount = liveAgents.filter((agent) => agent.status !== "Error").length;
  const totalQueueDepth = liveAgents.reduce((sum, agent) => sum + agent.queueDepth, 0);
  const currentMorningRecord: MissionRecord | null =
    runnerState.report && runnerState.activeMission
      ? {
          mission: runnerState.activeMission,
          tasks: runnerState.tasks,
          artifacts: runnerState.artifacts,
          report: runnerState.report
        }
      : null;

  useEffect(() => {
    const savedArchive = window.localStorage.getItem("umbrella-mission-archive");
    if (!savedArchive) {
      return;
    }

    try {
      const parsed = JSON.parse(savedArchive) as RunnerState["archive"];
      setRunnerState((current) => ({ ...current, archive: parsed }));
    } catch {
      window.localStorage.removeItem("umbrella-mission-archive");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("umbrella-mission-archive", JSON.stringify(runnerState.archive));
  }, [runnerState.archive]);

  useEffect(() => {
    const savedQueue = window.localStorage.getItem("publishQueue");
    if (!savedQueue) {
      return;
    }

    try {
      setRunnerState((current) => ({ ...current, publishQueue: JSON.parse(savedQueue) as RunnerState["publishQueue"] }));
    } catch {
      window.localStorage.removeItem("publishQueue");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("publishQueue", JSON.stringify(runnerState.publishQueue));
  }, [runnerState.publishQueue]);

  useEffect(() => {
    return () => {
      cancelExecutionRef.current?.();
      cancelExecutionRef.current = null;
    };
  }, []);

  const handleRunMission = () => {
    if (runnerState.activeMission && (runnerState.activeMission.status === "Queued" || runnerState.activeMission.status === "Running")) {
      return;
    }

    cancelExecutionRef.current?.();
    const mission = {
      ...createMissionDraft(missionGoal, missionConstraints, missionPriority, executionMode),
      approved: executionMode === "outbound" ? outboundApproved : false
    };
    const tasks = createMissionTasks(mission);

    setRunnerState((current) => ({
      ...current,
      activeMission: mission,
      tasks,
      artifacts: [],
      report: null
    }));

    cancelExecutionRef.current = runMissionExecution({
      mission,
      tasks,
      agents,
      onUpdate: (snapshot) => {
        setRunnerState((current) => ({
          ...current,
          activeMission: snapshot.mission,
          tasks: snapshot.tasks,
          artifacts: snapshot.artifacts
        }));
      },
      onFinish: (record) => {
        cancelExecutionRef.current = null;
        setRunnerState((current) => ({
          ...current,
          activeMission: record.mission,
          tasks: record.tasks,
          artifacts: record.artifacts,
          report: record.report,
          archive: [record, ...current.archive]
        }));
      }
    });
  };

  const handleSendToPublishQueue = (record: MissionRecord) => {
    const item = createPublishQueueItem(record);
    const existing = JSON.parse(window.localStorage.getItem("publishQueue") || "[]") as RunnerState["publishQueue"];
    existing.push(item);
    window.localStorage.setItem("publishQueue", JSON.stringify(existing));
    console.log("QUEUE ITEM ADDED", item);

    setRunnerState((current) => ({
      ...current,
      publishQueue: existing
    }));
  };

  const handleApproveForOutbound = () => {
    setRunnerState((current) => {
      if (!current.activeMission) {
        return current;
      }

      const approvedMission = {
        ...current.activeMission,
        approved: true,
        approvalStatus: "granted" as const
      };
      const updatedArchive = current.archive.map((entry) =>
        entry.mission.id === approvedMission.id
          ? {
              ...entry,
              mission: approvedMission
            }
          : entry
      );

      return {
        ...current,
        activeMission: approvedMission,
        archive: updatedArchive,
        report: current.report
      };
    });
  };

  const handlePublishQueueStatusChange = (id: number, status: "approved" | "rejected") => {
    setRunnerState((current) => {
      const nextQueue = current.publishQueue.map((item) => (item.id === id ? { ...item, status } : item));
      window.localStorage.setItem("publishQueue", JSON.stringify(nextQueue));
      return {
        ...current,
        publishQueue: nextQueue
      };
    });
  };

  const isCurrentMissionQueuedForPublish = currentMorningRecord
    ? runnerState.publishQueue.some((item) => item.missionId === currentMorningRecord.mission.id)
    : false;

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <span className="eyebrow">Etsy Pipeline Console</span>
        <h1 className="hero-title">Generate one approval-ready Etsy listing through a staged agent workflow.</h1>
        <p className="hero-copy">
          The system now runs as a digital Etsy product pipeline: research one digital product, shape the product
          contents, write one complete listing, and hold it for approval before any publishing step.
        </p>

        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-label">Active Agents</span>
            <span className="stat-value">{runningCount}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Healthy Agents</span>
            <span className="stat-value">{healthyCount}/8</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Queued Tasks</span>
            <span className="stat-value">{totalQueueDepth}</span>
          </div>
        </div>
      </section>

      <MissionControlPanel
        goal={missionGoal}
        constraints={missionConstraints}
        priority={missionPriority}
        executionMode={executionMode}
        outboundApproved={outboundApproved}
        activeMission={runnerState.activeMission}
        onGoalChange={setMissionGoal}
        onConstraintsChange={setMissionConstraints}
        onPriorityChange={setMissionPriority}
        onExecutionModeChange={setExecutionMode}
        onOutboundApprovedChange={setOutboundApproved}
        onSubmit={handleRunMission}
      />

      <MissionStatusBoard
        mission={runnerState.activeMission}
        tasks={runnerState.tasks}
        artifacts={runnerState.artifacts}
        onApproveForOutbound={handleApproveForOutbound}
      />

      <MorningReportView
        record={currentMorningRecord}
        onSendToPublishQueue={handleSendToPublishQueue}
        isQueuedForPublish={isCurrentMissionQueuedForPublish}
      />

      <MissionArchive archive={runnerState.archive} />

      <PublishQueueView
        queue={runnerState.publishQueue}
        onApprove={(id) => handlePublishQueueStatusChange(id, "approved")}
        onReject={(id) => handlePublishQueueStatusChange(id, "rejected")}
      />

      <section className="dashboard-grid" aria-label="Agent dashboard">
        {liveAgents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} onClick={() => setSelectedAgentId(agent.id)} />
        ))}
      </section>

      {selectedAgent ? <AgentDetailModal agent={selectedAgent} onClose={() => setSelectedAgentId(null)} /> : null}
    </main>
  );
}
