"use client";

import { useCallback, useEffect, useState } from "react";

import type { ContentDrop } from "@/lib/content-studio/types";
import { DropList } from "@/components/content-studio/DropList";
import { DropDetail } from "@/components/content-studio/DropDetail";
import { CreateDropForm } from "@/components/content-studio/CreateDropForm";

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

export function ContentStudioPanel() {
  const [drops, setDrops] = useState<DropSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContentDrop | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshList = useCallback(async () => {
    const r = await fetch("/api/content-studio/drops", { cache: "no-store" });
    const data = (await r.json()) as { drops: DropSummary[] };
    setDrops(data.drops ?? []);
  }, []);

  const refreshSelected = useCallback(async (id: string) => {
    const r = await fetch(`/api/content-studio/drops/${id}`, { cache: "no-store" });
    if (!r.ok) {
      setSelected(null);
      return;
    }
    const data = (await r.json()) as { drop: ContentDrop };
    setSelected(data.drop);
  }, []);

  useEffect(() => {
    void refreshList();
    // Honor ?drop=<id> from URL
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("drop");
    if (fromQuery) setSelectedId(fromQuery);
  }, [refreshList]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    void refreshSelected(selectedId);
  }, [selectedId, refreshSelected]);

  // Auto-poll selected drop while it's generating
  useEffect(() => {
    if (selected?.status !== "generating") return;
    const interval = setInterval(() => {
      if (selectedId) void refreshSelected(selectedId);
      void refreshList();
    }, 3000);
    return () => clearInterval(interval);
  }, [selected?.status, selectedId, refreshSelected, refreshList]);

  const handleCreated = async (id: string) => {
    await refreshList();
    setSelectedId(id);
  };

  const handleAssetsChanged = async () => {
    if (selectedId) await refreshSelected(selectedId);
    await refreshList();
  };

  return (
    <div className="cs-grid">
      <section className="cs-card">
        <h2>Drops</h2>
        <CreateDropForm onCreated={handleCreated} disabled={busy} />
        <DropList
          drops={drops}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id)}
        />
      </section>

      <section className="cs-card">
        <h2>{selected ? selected.productTitle : "Select a drop"}</h2>
        {selected ? (
          <DropDetail
            drop={selected}
            busy={busy}
            setBusy={setBusy}
            onChanged={handleAssetsChanged}
          />
        ) : (
          <p className="cs-empty">
            Pick a drop from the list, or create a new one. A drop is a container for one product&rsquo;s real photos
            plus everything the AI factory generates from them.
          </p>
        )}
      </section>
    </div>
  );
}
