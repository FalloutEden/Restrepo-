"use client";

type DropSummary = {
  id: string;
  productTitle: string;
  brand: string;
  status: string;
  sourcePhotoCount: number;
  lifestyleImageCount: number;
  videoCount: number;
  postCount: number;
  createdAt: string;
};

type Props = {
  drops: DropSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function statusClass(status: string): string {
  if (status === "draft") return "cs-status-draft";
  if (status === "generating") return "cs-status-generating";
  if (status === "ready") return "cs-status-ready";
  if (status === "posted") return "cs-status-posted";
  return "cs-status-draft";
}

export function DropList({ drops, selectedId, onSelect }: Props) {
  if (drops.length === 0) {
    return <p className="cs-empty">No drops yet. Create one above.</p>;
  }
  return (
    <div className="cs-drop-list">
      {drops.map((d) => (
        <div
          key={d.id}
          className={`cs-drop-row ${selectedId === d.id ? "cs-active" : ""}`}
          onClick={() => onSelect(d.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelect(d.id);
          }}
        >
          <div>
            <span className="cs-drop-title">{d.productTitle}</span>
            <span className={`cs-drop-status ${statusClass(d.status)}`}>{d.status}</span>
          </div>
          <div className="cs-drop-meta">
            {d.brand} · {d.sourcePhotoCount} source / {d.lifestyleImageCount} ai-img / {d.videoCount} vid / {d.postCount} posts
          </div>
        </div>
      ))}
    </div>
  );
}
