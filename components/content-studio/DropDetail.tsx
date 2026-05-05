"use client";

import { useCallback, useRef, useState } from "react";

import type { ContentDrop, MediaAsset, PlatformPost } from "@/lib/content-studio/types";
import { PLATFORM_SPECS } from "@/lib/content-studio/types";

type Props = {
  drop: ContentDrop;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onChanged: () => void;
};

function statusClass(status: string): string {
  if (status === "draft") return "cs-status-draft";
  if (status === "generating") return "cs-status-generating";
  if (status === "ready") return "cs-status-ready";
  if (status === "posted") return "cs-status-posted";
  return "cs-status-draft";
}

function assetUrl(dropId: string, asset: MediaAsset): string {
  return `/api/content-studio/drops/${dropId}/assets/${asset.filePath.replace(/\\/g, "/")}`;
}

function copy(text: string) {
  void navigator.clipboard.writeText(text).catch(() => undefined);
}

export function DropDetail({ drop, busy, setBusy, onChanged }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourcePhotos = drop.assets.filter((a) => a.kind === "source_photo");
  const lifestyleImages = drop.assets.filter((a) => a.kind === "lifestyle_image");
  const videos = drop.assets.filter((a) => a.kind === "video");

  const upload = useCallback(
    async (files: FileList | File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        const fd = new FormData();
        Array.from(files).forEach((f) => fd.append("files", f));
        const r = await fetch(`/api/content-studio/drops/${drop.id}/upload`, {
          method: "POST",
          body: fd
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Upload failed (${r.status})`);
        }
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload error");
      } finally {
        setBusy(false);
      }
    },
    [drop.id, onChanged, setBusy]
  );

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/content-studio/drops/${drop.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Generation failed (${r.status})`);
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation error");
    } finally {
      setBusy(false);
    }
  }, [drop.id, onChanged, setBusy]);

  const markPosted = useCallback(
    async (postId: string) => {
      const r = await fetch(`/api/content-studio/drops/${drop.id}/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posted: true })
      });
      if (r.ok) onChanged();
    },
    [drop.id, onChanged]
  );

  const renderAsset = (a: MediaAsset) => {
    const url = assetUrl(drop.id, a);
    if (a.kind === "video") {
      return (
        <div key={a.id} className="cs-asset-tile">
          <video className="cs-asset-thumb-video" src={url} controls preload="metadata" />
          <div className="cs-asset-label">{a.source}</div>
        </div>
      );
    }
    return (
      <div key={a.id} className="cs-asset-tile">
        <a href={url} target="_blank" rel="noreferrer">
          <img className="cs-asset-thumb" src={url} alt={a.prompt ?? a.kind} />
        </a>
        <div className="cs-asset-label">{a.kind === "source_photo" ? "source" : a.source}</div>
      </div>
    );
  };

  const renderPost = (p: PlatformPost) => {
    const spec = PLATFORM_SPECS[p.platform];
    const fullCaption = [p.caption, p.hashtags.join(" ")].filter(Boolean).join("\n\n");
    return (
      <div key={p.id} className="cs-post">
        <div className="cs-post-platform">
          {spec.label}
          {p.posted ? " · ✓ posted" : ""}
        </div>
        <div className="cs-post-caption">{p.caption}</div>
        {p.hashtags.length > 0 ? <div className="cs-post-hashtags">{p.hashtags.join(" ")}</div> : null}
        {p.notes ? <div className="cs-post-notes">Note: {p.notes}</div> : null}
        <div className="cs-post-assets">{p.assetIds.length} asset{p.assetIds.length === 1 ? "" : "s"} attached</div>
        <div className="cs-button-row">
          <button type="button" className="cs-button cs-button-secondary" onClick={() => copy(fullCaption)}>
            Copy caption + hashtags
          </button>
          {!p.posted ? (
            <button type="button" className="cs-button" onClick={() => markPosted(p.id)}>
              Mark posted
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="cs-meta-row">
        <span>
          Status: <span className={`cs-drop-status ${statusClass(drop.status)}`}>{drop.status}</span>
        </span>
        <span>Brand: {drop.brandSlug}</span>
        <span>{sourcePhotos.length} source · {lifestyleImages.length} ai-img · {videos.length} video · {drop.posts.length} posts</span>
      </div>

      <div className="cs-section-title">Source photos</div>
      <div
        className={`cs-upload-zone ${dragOver ? "cs-drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files) void upload(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <p style={{ margin: 0 }}>
          Drop product photos here or <strong>click to browse</strong>
        </p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
          Phone photos are fine. PNG / JPG / WebP. Take 5-10 angles per product for best results.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
          }}
        />
      </div>
      {sourcePhotos.length > 0 ? <div className="cs-asset-grid">{sourcePhotos.map(renderAsset)}</div> : null}

      <div className="cs-button-row" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="cs-button"
          onClick={generate}
          disabled={busy || sourcePhotos.length === 0 || drop.status === "generating"}
        >
          {drop.status === "generating" ? "Generating..." : "Generate AI content"}
        </button>
      </div>

      {error ? <p style={{ color: "salmon", fontSize: 12, marginTop: 8 }}>{error}</p> : null}

      {lifestyleImages.length > 0 ? (
        <>
          <div className="cs-section-title">AI lifestyle images</div>
          <div className="cs-asset-grid">{lifestyleImages.map(renderAsset)}</div>
        </>
      ) : null}

      {videos.length > 0 ? (
        <>
          <div className="cs-section-title">AI videos</div>
          <div className="cs-asset-grid">{videos.map(renderAsset)}</div>
        </>
      ) : null}

      {drop.posts.length > 0 ? (
        <>
          <div className="cs-section-title">Platform posts</div>
          {drop.posts.map(renderPost)}
        </>
      ) : null}

      {drop.log.length > 0 ? (
        <>
          <div className="cs-section-title">Generation log</div>
          <div className="cs-log">
            {drop.log
              .slice()
              .reverse()
              .map((l, i) => (
                <div
                  key={i}
                  className={`cs-log-line ${l.level === "warn" ? "cs-log-warn" : l.level === "error" ? "cs-log-error" : ""}`}
                >
                  [{new Date(l.ts).toLocaleTimeString()}] {l.message}
                </div>
              ))}
          </div>
        </>
      ) : null}
    </>
  );
}
