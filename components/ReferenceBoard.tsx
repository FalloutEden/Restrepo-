"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { CommerceChannel, ResearchExample, ResearchExampleStatus } from "@/lib/market-intelligence";

type ReferenceBoardProps = {
  examples: ResearchExample[];
  selectedChannel: CommerceChannel;
  onSaveExample: (entry: Omit<ResearchExample, "id" | "createdAt">) => void;
  onSetStatus: (id: string, status: ResearchExampleStatus) => void;
};

type ReferenceFormState = Omit<ResearchExample, "id" | "createdAt">;

function createInitialState(channel: CommerceChannel): ReferenceFormState {
  return {
    title: "",
    url: "",
    screenshotDataUrl: "",
    channel,
    niche: "",
    productFormat: "printable",
    targetBuyer: "",
    deliverableType: "digital download",
    whatLooksGood: "",
    sellabilityNotes: "",
    visualStyleNotes: "",
    styleComments: "",
    notes: "",
    status: "approved"
  };
}

export function ReferenceBoard({ examples, selectedChannel, onSaveExample, onSetStatus }: ReferenceBoardProps) {
  const [form, setForm] = useState<ReferenceFormState>(() => createInitialState(selectedChannel));
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    setForm((current) => ({ ...current, channel: selectedChannel }));
  }, [selectedChannel]);

  const updateField = <K extends keyof ReferenceFormState>(key: K, value: ReferenceFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleScreenshotUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateField("screenshotDataUrl", typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setStatusMessage("Add a title before saving the reference example.");
      return;
    }

    onSaveExample({
      ...form,
      title: form.title.trim(),
      url: form.url.trim(),
      niche: form.niche.trim(),
      targetBuyer: form.targetBuyer.trim(),
      deliverableType: form.deliverableType.trim(),
      whatLooksGood: form.whatLooksGood.trim(),
      sellabilityNotes: form.sellabilityNotes.trim(),
      visualStyleNotes: form.visualStyleNotes.trim(),
      styleComments: form.styleComments.trim(),
      notes: form.notes.trim()
    });
    setForm(createInitialState(selectedChannel));
    setStatusMessage("Reference example saved to the research board.");
  };

  return (
    <section className="archive-shell">
      <div className="status-header">
        <div>
          <span className="eyebrow">Reference Board</span>
          <h2 className="section-title">Save examples, notes, screenshots, and URLs the research engine should learn from</h2>
        </div>
      </div>

      <div className="reference-board-grid">
        <form className="detail-card reference-board-form" onSubmit={handleSubmit}>
          <label className="field-block">
            <span className="field-label">Title</span>
            <input className="mission-input" value={form.title} onChange={(event) => updateField("title", event.target.value)} />
          </label>

          <label className="field-block">
            <span className="field-label">Product URL</span>
            <input className="mission-input" value={form.url} onChange={(event) => updateField("url", event.target.value)} />
          </label>

          <div className="mission-form-row">
            <label className="field-block">
              <span className="field-label">Channel</span>
              <select className="mission-input mission-select" value={form.channel} onChange={(event) => updateField("channel", event.target.value as CommerceChannel)}>
                <option value="all">All Channels</option>
                <option value="etsy">Etsy</option>
                <option value="fiverr">Fiverr</option>
                <option value="print_on_demand">Print on Demand</option>
                <option value="content">Content</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="field-block">
              <span className="field-label">Status</span>
              <select className="mission-input mission-select" value={form.status} onChange={(event) => updateField("status", event.target.value as ResearchExampleStatus)}>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="review">Review</option>
              </select>
            </label>
          </div>

          <div className="mission-form-row">
            <label className="field-block">
              <span className="field-label">Niche</span>
              <input className="mission-input" value={form.niche} onChange={(event) => updateField("niche", event.target.value)} />
            </label>

            <label className="field-block">
              <span className="field-label">Format</span>
              <input className="mission-input" value={form.productFormat} onChange={(event) => updateField("productFormat", event.target.value)} />
            </label>
          </div>

          <div className="mission-form-row">
            <label className="field-block">
              <span className="field-label">Target Buyer</span>
              <input className="mission-input" value={form.targetBuyer} onChange={(event) => updateField("targetBuyer", event.target.value)} />
            </label>

            <label className="field-block">
              <span className="field-label">Deliverable Type</span>
              <input className="mission-input" value={form.deliverableType} onChange={(event) => updateField("deliverableType", event.target.value)} />
            </label>
          </div>

          <label className="field-block">
            <span className="field-label">What Looks Good</span>
            <textarea className="mission-input mission-textarea mission-textarea-compact" rows={3} value={form.whatLooksGood} onChange={(event) => updateField("whatLooksGood", event.target.value)} />
          </label>

          <label className="field-block">
            <span className="field-label">What Sells / Why It Might Sell</span>
            <textarea className="mission-input mission-textarea mission-textarea-compact" rows={3} value={form.sellabilityNotes} onChange={(event) => updateField("sellabilityNotes", event.target.value)} />
          </label>

          <label className="field-block">
            <span className="field-label">Visual Style Notes</span>
            <textarea className="mission-input mission-textarea mission-textarea-compact" rows={3} value={form.visualStyleNotes} onChange={(event) => updateField("visualStyleNotes", event.target.value)} />
          </label>

          <label className="field-block">
            <span className="field-label">Style Comments</span>
            <textarea className="mission-input mission-textarea mission-textarea-compact" rows={3} value={form.styleComments} onChange={(event) => updateField("styleComments", event.target.value)} />
          </label>

          <label className="field-block">
            <span className="field-label">Notes</span>
            <textarea className="mission-input mission-textarea mission-textarea-compact" rows={3} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
          </label>

          <label className="field-block">
            <span className="field-label">Screenshot</span>
            <input type="file" accept="image/*" onChange={handleScreenshotUpload} />
          </label>

          {form.screenshotDataUrl ? (
            <div className="reference-board-preview">
              <img src={form.screenshotDataUrl} alt="Reference screenshot preview" className="mockup-preview-image" />
            </div>
          ) : null}

          <button type="submit" className="export-button">Save Reference Example</button>
          {statusMessage ? <p className="detail-body">{statusMessage}</p> : null}
        </form>

        <div className="reference-board-list">
          {examples.length === 0 ? (
            <div className="detail-card">
              <p className="detail-body">No reference examples saved yet. Add product URLs, screenshots, notes, and style comments here to influence future generations.</p>
            </div>
          ) : (
            examples.map((example) => (
              <article key={example.id} className="detail-card reference-example-card">
                <div className="runner-card-header">
                  <div>
                    <span className="field-label">{example.channel}</span>
                    <h3 className="task-title">{example.title}</h3>
                  </div>
                  <span className={`runner-chip ${example.status === "approved" ? "runner-chip-approved" : example.status === "rejected" ? "runner-chip-rejected" : "runner-chip-running"}`}>
                    {example.status}
                  </span>
                </div>
                {example.screenshotDataUrl ? (
                  <div className="reference-board-preview">
                    <img src={example.screenshotDataUrl} alt={example.title} className="mockup-preview-image" />
                  </div>
                ) : null}
                <p className="detail-body">Niche: {example.niche || "Not specified"}</p>
                <p className="detail-body">Format: {example.productFormat}</p>
                <p className="detail-body">Target buyer: {example.targetBuyer || "Not specified"}</p>
                <p className="detail-body">Deliverable type: {example.deliverableType}</p>
                {example.url ? <p className="detail-body">URL: {example.url}</p> : null}
                <p className="detail-body">What looks good: {example.whatLooksGood || "-"}</p>
                <p className="detail-body">Why it might sell: {example.sellabilityNotes || "-"}</p>
                <p className="detail-body">Visual style notes: {example.visualStyleNotes || "-"}</p>
                <p className="detail-body">Style comments: {example.styleComments || "-"}</p>
                {example.notes ? <p className="detail-body">Notes: {example.notes}</p> : null}
                <div className="export-actions" aria-label={`Status controls for ${example.title}`}>
                  <button type="button" className="export-button" onClick={() => onSetStatus(example.id, "approved")}>Approve</button>
                  <button type="button" className="export-button" onClick={() => onSetStatus(example.id, "rejected")}>Reject</button>
                  <button type="button" className="export-button" onClick={() => onSetStatus(example.id, "review")}>Review</button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
