"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Bubble =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; text: string }
  | { kind: "error"; text: string };

type Props = {
  onTurnComplete?: () => void;
};

const STORAGE_KEY = "operator-conversation-id";

export function OperatorChat({ onTurnComplete }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [streaming, setStreaming] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setConversationId(saved);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [bubbles]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || streaming) return;
    setDraft("");
    setStreaming(true);
    setBubbles((prev) => [...prev, { kind: "user", text: message }]);

    try {
      const response = await fetch("/api/operator/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message })
      });
      if (!response.ok || !response.body) {
        throw new Error(`Operator request failed (${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // SSE parse loop. Each `data:` line is one JSON-encoded AgentEvent.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const block of events) {
          const line = block.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(json);
          } catch {
            continue;
          }
          if (event.kind === "conversation_id" && typeof event.id === "string") {
            setConversationId(event.id);
            window.localStorage.setItem(STORAGE_KEY, event.id);
          } else if (event.kind === "tool_call" && typeof event.name === "string") {
            setBubbles((prev) => [
              ...prev,
              { kind: "tool", text: `→ ${String(event.name)}(${JSON.stringify(event.input)})` }
            ]);
          } else if (event.kind === "tool_result" && typeof event.name === "string") {
            setBubbles((prev) => [
              ...prev,
              {
                kind: "tool",
                text: `← ${String(event.name)}: ${String(event.resultPreview ?? "")}`
              }
            ]);
          } else if (event.kind === "text_done" && typeof event.text === "string") {
            setBubbles((prev) => [...prev, { kind: "assistant", text: String(event.text) }]);
          } else if (event.kind === "error" && typeof event.message === "string") {
            setBubbles((prev) => [...prev, { kind: "error", text: String(event.message) }]);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown chat error";
      setBubbles((prev) => [...prev, { kind: "error", text: message }]);
    } finally {
      setStreaming(false);
      onTurnComplete?.();
    }
  }, [conversationId, draft, onTurnComplete, streaming]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const handleClear = () => {
    setBubbles([]);
    setConversationId(null);
    window.localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <>
      <div className="operator-chat-log" ref={logRef}>
        {bubbles.length === 0 ? (
          <p className="operator-empty">
            Start a conversation. Try: "What's worth doing today?" or "Source 3 new doorbell SKUs for LockLayer."
          </p>
        ) : (
          bubbles.map((b, idx) => (
            <div
              key={idx}
              className={`operator-bubble operator-bubble-${b.kind === "user" ? "user" : b.kind === "assistant" ? "assistant" : b.kind === "tool" ? "tool" : "error"}`}
            >
              {b.text}
            </div>
          ))
        )}
        {streaming ? <p className="operator-meta">Operator is thinking...</p> : null}
      </div>
      <div className="operator-input-row">
        <textarea
          className="operator-input"
          placeholder="Ask the operator. Enter to send, Shift+Enter for newline."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
        />
        <button
          type="button"
          className="operator-button"
          onClick={() => void send()}
          disabled={streaming || draft.trim().length === 0}
        >
          Send
        </button>
      </div>
      <div className="operator-button-row">
        <button
          type="button"
          className="operator-button operator-button-secondary"
          onClick={handleClear}
        >
          Start new conversation
        </button>
        <span className="operator-meta" style={{ alignSelf: "center" }}>
          {conversationId ? `Conversation: ${conversationId}` : "No conversation yet"}
        </span>
      </div>
    </>
  );
}
