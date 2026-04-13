"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent } from "@/lib/mock-agents";

type AgentVisualProps = {
  agent: Pick<Agent, "name" | "avatar" | "background" | "avatarFrames" | "blinkFrames" | "frameRate" | "loop">;
  variant: "card" | "modal";
};

const blinkBlockedNames = new Set(["HUNK", "Umbrella Core"]);

export function AgentVisual({ agent, variant }: AgentVisualProps) {
  const baseFrames = useMemo(() => {
    if (agent.avatarFrames && agent.avatarFrames.length > 0) {
      return agent.avatarFrames;
    }

    return [agent.avatar];
  }, [agent.avatar, agent.avatarFrames]);
  const blinkFrames = useMemo(() => agent.blinkFrames ?? [], [agent.blinkFrames]);
  const frameRate = agent.frameRate ?? 6;
  const loop = agent.loop ?? true;
  const canBlink = blinkFrames.length > 0 && !blinkBlockedNames.has(agent.name);
  const [frameIndex, setFrameIndex] = useState(0);
  const [blinkIndex, setBlinkIndex] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);
  const blinkTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setFrameIndex(0);
    setBlinkIndex(0);
    setIsBlinking(false);
  }, [baseFrames, blinkFrames]);

  useEffect(() => {
    if (isBlinking || baseFrames.length <= 1) {
      return;
    }

    const intervalMs = Math.max(1000 / Math.max(frameRate, 1), 80);
    const intervalId = window.setInterval(() => {
      setFrameIndex((currentIndex) => {
        if (currentIndex >= baseFrames.length - 1) {
          return loop ? 0 : currentIndex;
        }

        return currentIndex + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [baseFrames, frameRate, isBlinking, loop]);

  useEffect(() => {
    if (!canBlink) {
      return;
    }

    let cancelled = false;

    const queueBlink = () => {
      const nextBlinkDelay = 2600 + Math.floor(Math.random() * 3400);
      blinkTimeoutRef.current = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setBlinkIndex(0);
        setIsBlinking(true);
      }, nextBlinkDelay);
    };

    queueBlink();

    return () => {
      cancelled = true;
      if (blinkTimeoutRef.current !== null) {
        window.clearTimeout(blinkTimeoutRef.current);
      }
    };
  }, [canBlink]);

  useEffect(() => {
    if (!isBlinking || !canBlink) {
      return;
    }

    const intervalMs = Math.max(1000 / Math.max(frameRate, 1), 70);
    const intervalId = window.setInterval(() => {
      setBlinkIndex((currentIndex) => {
        if (currentIndex >= blinkFrames.length - 1) {
          window.clearInterval(intervalId);
          setIsBlinking(false);
          return 0;
        }

        return currentIndex + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [blinkFrames, canBlink, frameRate, isBlinking]);

  const hasFrameAnimation = baseFrames.length > 1;
  const activeSprite = isBlinking && canBlink ? blinkFrames[blinkIndex] : baseFrames[frameIndex] ?? agent.avatar;
  const rootClassName = [
    "agent-visual",
    variant === "card" ? "agent-visual-card" : "agent-visual-modal",
    hasFrameAnimation ? "agent-visual-frames" : "agent-visual-idle",
    canBlink ? "agent-visual-blink-enabled" : "agent-visual-blink-disabled"
  ].join(" ");
  const spriteClassName = [
    "agent-visual-sprite",
    variant === "card" ? "agent-visual-sprite-card" : "agent-visual-sprite-modal"
  ].join(" ");

  return (
    <div className={rootClassName} aria-hidden="true">
      <img className="agent-room-background" src={agent.background} alt="" />
      <div className="agent-room-shade" />
      <div className="agent-room-floor-glow" />
      <img className={spriteClassName} src={activeSprite} alt="" />
    </div>
  );
}
