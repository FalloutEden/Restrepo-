"use client";

import type { Agent } from "@/lib/mock-agents";
import {
  buildMissionRecord,
  type Mission,
  type MissionArtifact,
  type MissionRecord,
  type MissionTask
} from "@/lib/missions";

type MissionExecutionSnapshot = {
  mission: Mission;
  tasks: MissionTask[];
  artifacts: MissionArtifact[];
};

type MissionExecutionOptions = {
  mission: Mission;
  tasks: MissionTask[];
  agents: Agent[];
  onUpdate: (snapshot: MissionExecutionSnapshot) => void;
  onFinish: (record: MissionRecord) => void;
};

const DISALLOWED_OUTBOUND_PATTERNS = [
  /\bpublish\b/i,
  /\bpost\b/i,
  /\bsend\b/i,
  /\bmessage\b/i,
  /\bupload\b/i,
  /\bdeploy\b/i,
  /\bbuy\b/i,
  /\bsell\b/i,
  /\bcreate account\b/i
] as const;

function createTimestamp(date: Date) {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function cloneTask(task: MissionTask): MissionTask {
  return {
    ...task,
    artifacts: task.artifacts.map((artifact) => ({
      ...artifact,
      details: [...artifact.details]
    }))
  };
}

function detectMissionBlocker(mission: Mission) {
  if (mission.executionMode === "internal" || mission.executionMode === "local") {
    return null;
  }

  if (mission.executionMode !== "outbound") {
    return null;
  }

  if (mission.approved) {
    return null;
  }

  const source = `${mission.goal}\n${mission.constraints.join("\n")}`;
  const match = DISALLOWED_OUTBOUND_PATTERNS.find((pattern) => pattern.test(source));
  if (match) {
    return "Mission blocked by safety rules. Outbound actions require outbound mode plus explicit approval.";
  }

  return "Mission blocked because outbound mode requires explicit approval before execution can begin.";
}

function completeTask(task: MissionTask, timestamp: string): MissionTask {
  return {
    ...task,
    status: "Completed",
    completedAt: timestamp,
    outputSummary: task.plannedOutputSummary,
    error: undefined
  };
}

export function runMissionExecution({ mission, tasks, agents, onUpdate, onFinish }: MissionExecutionOptions) {
  const timeouts = new Set<number>();
  let cancelled = false;
  let currentMission: Mission = { ...mission };
  let currentTasks = tasks.map(cloneTask);
  let currentArtifacts: MissionArtifact[] = [];

  const emitUpdate = () => {
    if (cancelled) {
      return;
    }

    onUpdate({
      mission: currentMission,
      tasks: currentTasks.map(cloneTask),
      artifacts: currentArtifacts.map((artifact) => ({ ...artifact, details: [...artifact.details] }))
    });
  };

  const finishMission = (missionState: Mission, taskState: MissionTask[], artifactState: MissionArtifact[]) => {
    currentMission = missionState;
    currentTasks = taskState;
    currentArtifacts = artifactState;
    emitUpdate();
    onFinish(buildMissionRecord(currentMission, currentTasks, agents, currentArtifacts));
  };

  const schedule = (callback: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      timeouts.delete(timeoutId);
      callback();
    }, delayMs);
    timeouts.add(timeoutId);
  };

  const beginTask = (taskIndex: number) => {
    if (cancelled) {
      return;
    }

    const task = currentTasks[taskIndex];
    if (!task) {
      const completedAt = createTimestamp(new Date());
      finishMission(
        {
          ...currentMission,
          status: "Completed",
          completedAt,
          summary: `${currentMission.executionMode} Etsy pipeline completed locally. One listing package, its supporting artifacts, and approval notes were preserved for review.`,
          recommendedNextAction: "Review the final Etsy listing, inspect each agent handoff, and approve only if the product is ready."
        },
        currentTasks,
        currentArtifacts
      );
      return;
    }

    const startedAt = createTimestamp(new Date());
    currentTasks = currentTasks.map((entry, index) =>
      index === taskIndex
        ? {
            ...entry,
            status: "Running",
            startedAt,
            outputSummary: `Running ${entry.title.toLowerCase()} in ${entry.executionMode} mode.`,
            error: undefined
          }
        : entry
    );
    currentMission = {
      ...currentMission,
      status: "Running",
      summary: `${task.assignedAgent} is executing ${task.title.toLowerCase()} in ${task.executionMode} mode.`,
      recommendedNextAction: "Pipeline execution is in progress. Monitor the task handoff before launching another run."
    };
    emitUpdate();

    schedule(() => {
      if (cancelled) {
        return;
      }

      try {
        const completedAt = createTimestamp(new Date());
        const finishedTask = completeTask(currentTasks[taskIndex], completedAt);
        currentTasks = currentTasks.map((entry, index) => (index === taskIndex ? finishedTask : entry));
        currentArtifacts = [...currentArtifacts, ...finishedTask.artifacts];
        currentMission = {
          ...currentMission,
          summary: `${finishedTask.assignedAgent} completed ${finishedTask.title.toLowerCase()}.`,
          recommendedNextAction:
            taskIndex === currentTasks.length - 1
              ? "Finalizing the Etsy listing packet."
              : "Pipeline execution continues across the queued task list."
        };
        emitUpdate();
        beginTask(taskIndex + 1);
      } catch (error) {
        const completedAt = createTimestamp(new Date());
        const message = error instanceof Error ? error.message : "Task execution failed during local processing.";
        currentTasks = currentTasks.map((entry, index) =>
          index === taskIndex
            ? {
                ...entry,
                status: "Failed",
                completedAt,
                outputSummary: "Local execution failed before the task could complete.",
                error: message
              }
            : entry
        );

        finishMission(
          {
            ...currentMission,
            status: "Failed",
            completedAt,
            summary: "Etsy pipeline execution failed locally. Partial outputs were preserved for review.",
            recommendedNextAction: "Inspect the failed task, review the listing payload, and retry once the local issue is resolved."
          },
          currentTasks,
          currentArtifacts
        );
      }
    }, 1200 + taskIndex * 150);
  };

  schedule(() => {
    if (cancelled) {
      return;
    }

    const startedAt = createTimestamp(new Date());
    currentMission = {
      ...currentMission,
      status: "Running",
      startedAt,
      summary: "Local Etsy pipeline executor is live and preparing the first task.",
      recommendedNextAction: "Pipeline execution has started. Monitor the board for live task updates."
    };
    emitUpdate();

    const missionBlocker = detectMissionBlocker(currentMission);
    if (missionBlocker) {
      const completedAt = createTimestamp(new Date());
      const blockedTasks = currentTasks.map((task) => ({
        ...task,
        status: "Blocked" as const,
        completedAt,
        outputSummary: "Execution blocked before this task could start.",
        error: missionBlocker
      }));

      finishMission(
        {
          ...currentMission,
          status: "Blocked",
          completedAt,
          summary: "Pipeline blocked by local safety guardrails before execution could continue.",
          recommendedNextAction: "Revise the pipeline request so it stays approval-safe, then rerun."
        },
        blockedTasks,
        []
      );
      return;
    }

    beginTask(0);
  }, 500);

  return () => {
    cancelled = true;
    timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeouts.clear();
  };
}
