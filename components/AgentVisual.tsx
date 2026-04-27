"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent } from "@/lib/mock-agents";

type AgentVisualProps = {
  agent: Pick<Agent, "name" | "avatar" | "background" | "avatarFrames" | "blinkFrames" | "frameRate" | "loop" | "status">;
  variant: "card" | "modal";
};

const blinkBlockedNames = new Set(["HUNK", "Umbrella Core"]);

// How far left/right the sprite travels (as a fraction of container width)
const PATROL_RANGE = 0.24;

// Pixels-per-second patrol speed by status
const statusSpeed: Record<Agent["status"], number> = {
  Running:   0.22,
  Retrying:  0.36,
  Idle:      0.06,
  Completed: 0.10,
  Blocked:   0.018,
  Failed:    0.05,
  Error:     0.09,
};

// Seconds to pause at each wall before reversing
const statusPause: Record<Agent["status"], number> = {
  Running:   0.5,
  Retrying:  0.15,
  Idle:      4.5,
  Completed: 2.4,
  Blocked:   10.0,
  Failed:    4.0,
  Error:     2.0,
};

export function AgentVisual({ agent, variant }: AgentVisualProps) {
  // ── Frame animation ────────────────────────────────────────────────────────
  const baseFrames = useMemo(() => {
    if (agent.avatarFrames && agent.avatarFrames.length > 0) return agent.avatarFrames;
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
    if (isBlinking || baseFrames.length <= 1) return;
    const ms = Math.max(1000 / Math.max(frameRate, 1), 80);
    const id = window.setInterval(() => {
      setFrameIndex((i) => (i >= baseFrames.length - 1 ? (loop ? 0 : i) : i + 1));
    }, ms);
    return () => window.clearInterval(id);
  }, [baseFrames, frameRate, isBlinking, loop]);

  useEffect(() => {
    if (!canBlink) return;
    let cancelled = false;
    const queue = () => {
      blinkTimeoutRef.current = window.setTimeout(() => {
        if (cancelled) return;
        setBlinkIndex(0);
        setIsBlinking(true);
      }, 2600 + Math.floor(Math.random() * 3400));
    };
    queue();
    return () => {
      cancelled = true;
      if (blinkTimeoutRef.current !== null) window.clearTimeout(blinkTimeoutRef.current);
    };
  }, [canBlink]);

  useEffect(() => {
    if (!isBlinking || !canBlink) return;
    const ms = Math.max(1000 / Math.max(frameRate, 1), 70);
    const id = window.setInterval(() => {
      setBlinkIndex((i) => {
        if (i >= blinkFrames.length - 1) {
          window.clearInterval(id);
          setIsBlinking(false);
          return 0;
        }
        return i + 1;
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [blinkFrames, canBlink, frameRate, isBlinking]);

  // ── Patrol movement system ─────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const spriteRef    = useRef<HTMLImageElement>(null);
  const bgRef        = useRef<HTMLImageElement>(null);
  const glowRef      = useRef<HTMLDivElement>(null);
  const hoveredRef   = useRef(false);
  // Keep latest status accessible inside the rAF loop without restarting it
  const statusRef = useRef(agent.status);
  statusRef.current = agent.status;

  // Persist patrol state across re-renders without triggering them
  const patrol = useRef({
    posX:      (Math.random() * 2 - 1) * PATROL_RANGE,
    dir:       (Math.random() > 0.5 ? 1 : -1) as 1 | -1,
    pauseTime: Math.random() * 2.5,
    stepPhase: Math.random() * Math.PI * 2,
  });

  useEffect(() => {
    const container = containerRef.current;
    const sprite    = spriteRef.current;
    const bg        = bgRef.current;
    const glow      = glowRef.current;
    if (!container || !sprite || !bg || !glow) return;

    const s = patrol.current;

    const onEnter = () => { hoveredRef.current = true; };
    const onLeave = () => { hoveredRef.current = false; };
    container.addEventListener("mouseenter", onEnter);
    container.addEventListener("mouseleave", onLeave);

    let lastTs = performance.now();
    let raf: number;

    const tick = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;

      const status    = statusRef.current;
      const speed     = statusSpeed[status];
      const basePause = statusPause[status];
      const hovered   = hoveredRef.current;

      if (hovered) {
        // Walk back toward center smoothly
        s.posX += (0 - s.posX) * Math.min(dt * 4, 1);
        s.stepPhase += 0.7 * dt;
      } else if (s.pauseTime > 0) {
        s.pauseTime -= dt;
        s.stepPhase += 0.85 * dt; // gentle idle sway while standing
      } else {
        s.posX      += s.dir * speed * dt;
        s.stepPhase += speed * 14 * dt;

        if (s.posX >= PATROL_RANGE) {
          s.posX      = PATROL_RANGE;
          s.dir       = -1;
          s.pauseTime = basePause * (0.7 + Math.random() * 0.6);
        } else if (s.posX <= -PATROL_RANGE) {
          s.posX      = -PATROL_RANGE;
          s.dir       = 1;
          s.pauseTime = basePause * (0.7 + Math.random() * 0.6);
        }
      }

      const isWalking = !hovered && s.pauseTime <= 0;
      const bob       = Math.abs(Math.sin(s.stepPhase)) * (isWalking ? -5 : -3);
      const lean      = isWalking ? s.dir * Math.min(speed * 18, 3.5) : 0;
      // Flip to face direction of travel; face camera when hovered
      const flipX     = hovered ? 1 : (s.dir === -1 ? -1 : 1);
      const tx        = s.posX * 100; // convert to % of container

      // Drive transforms directly — zero React re-renders per frame
      sprite.style.transform = `translateX(calc(-50% + ${tx}%)) translateY(${bob}px) scaleX(${flipX}) rotate(${lean}deg)`;
      glow.style.transform   = `translateX(calc(-50% + ${tx}%))`;
      // Parallax: bg drifts opposite at ~12% of sprite travel, scaled up to avoid edge gaps
      bg.style.transform     = `translateX(${-tx * 0.12}%) scale(1.14)`;

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener("mouseenter", onEnter);
      container.removeEventListener("mouseleave", onLeave);
    };
  }, []); // runs once — status updates flow through statusRef

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasFrameAnimation = baseFrames.length > 1;
  const activeSprite = isBlinking && canBlink
    ? blinkFrames[blinkIndex]
    : baseFrames[frameIndex] ?? agent.avatar;

  const rootClassName = [
    "agent-visual",
    variant === "card" ? "agent-visual-card" : "agent-visual-modal",
    hasFrameAnimation ? "agent-visual-frames" : "agent-visual-idle",
    canBlink ? "agent-visual-blink-enabled" : "agent-visual-blink-disabled",
    `agent-status-${agent.status.toLowerCase()}`,
  ].join(" ");

  const spriteClassName = [
    "agent-visual-sprite",
    variant === "card" ? "agent-visual-sprite-card" : "agent-visual-sprite-modal",
  ].join(" ");

  return (
    <div ref={containerRef} className={rootClassName} aria-hidden="true">
      <img ref={bgRef} className="agent-room-background" src={agent.background} alt="" />
      <div className="agent-room-shade" />
      <div className="agent-room-scanlines" />
      <div ref={glowRef} className="agent-room-floor-glow" />
      <img ref={spriteRef} className={spriteClassName} src={activeSprite} alt="" />
    </div>
  );
}
