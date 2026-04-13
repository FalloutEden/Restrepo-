"use client";

import { useEffect, useState } from "react";
import type { PublishQueueItem } from "@/lib/missions";

type PublishQueueViewProps = {
  queue: PublishQueueItem[];
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
};

export function PublishQueueView({ queue, onApprove, onReject }: PublishQueueViewProps) {
  const [queueItems, setQueueItems] = useState<PublishQueueItem[]>([]);

  const approveItem = (id: number) => {
    const updated = queueItems.map((item) => (item.id === id ? { ...item, status: "approved" as const } : item));
    setQueueItems(updated);
    window.localStorage.setItem("publishQueue", JSON.stringify(updated));
    onApprove(id);
  };

  useEffect(() => {
    const data = JSON.parse(window.localStorage.getItem("publishQueue") || "[]") as PublishQueueItem[];
    setQueueItems(data);
  }, []);

  useEffect(() => {
    setQueueItems(queue);
  }, [queue]);

  useEffect(() => {
    console.log("QUEUE LOADED", queueItems);
  }, [queueItems]);

  return (
    <section className="archive-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">Approval Queue</span>
          <h2 className="section-title">Review Etsy listings before any future publishing step</h2>
        </div>
      </div>

      {queueItems.length === 0 ? (
        <div className="empty-shell">
          <h3 className="runner-title">Queue empty</h3>
          <p className="detail-body">Completed Etsy pipeline runs can stage one listing draft here for approval without posting anywhere.</p>
        </div>
      ) : (
        <div className="archive-grid">
          {queueItems.map((item) => (
            <div key={item.id} className="queue-card detail-card archive-card">
              <p className="detail-body">
                <strong>{item.title}</strong>
              </p>
              <p className="detail-body">Status: {item.status}</p>

              <div className="export-actions">
                <button type="button" className="export-button" onClick={() => approveItem(item.id)}>
                  Approve
                </button>
                <button type="button" className="export-button" onClick={() => onReject(item.id)}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
