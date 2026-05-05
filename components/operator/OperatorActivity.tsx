"use client";

import type { ActivityEntry } from "@/lib/operator-state";

type Props = {
  entries: ActivityEntry[];
};

export function OperatorActivity({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="operator-empty">No activity yet.</p>;
  }
  return (
    <div className="operator-activity-feed">
      {entries.map((entry, idx) => (
        <div key={`${entry.timestamp}-${idx}`} className="operator-activity-entry">
          <span className="operator-activity-time">
            {new Date(entry.timestamp).toLocaleTimeString()} · {entry.kind}
          </span>
          <span className="operator-activity-msg">{entry.message}</span>
        </div>
      ))}
    </div>
  );
}
