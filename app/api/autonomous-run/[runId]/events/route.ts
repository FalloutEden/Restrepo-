import { getAutonomousRunEvents, getAutonomousRunRecord } from "@/lib/autonomous-run-store";

export const runtime = "nodejs";
// Keep the SSE connection alive for up to 5 minutes
export const maxDuration = 300;

function encode(data: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const { searchParams } = new URL(request.url);
  let cursor = Number(searchParams.get("cursor") ?? "0");

  // Verify run exists
  const initial = await getAutonomousRunRecord(runId);
  if (!initial) {
    return new Response(JSON.stringify({ error: `Run ${runId} not found` }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Track the in-flight poll timeout so a single abort handler can cancel it.
      // (Previously each poll iteration added its own { once: true } abort listener,
      // which leaked until the AbortSignal actually fired — Node warns at 11.)
      let pollTimeout: ReturnType<typeof setTimeout> | null = null;
      let pollResolve: (() => void) | null = null;

      const aborted = () => {
        if (pollTimeout) {
          clearTimeout(pollTimeout);
          pollTimeout = null;
        }
        if (pollResolve) {
          pollResolve();
          pollResolve = null;
        }
        try { controller.close(); } catch { /* already closed */ }
      };

      request.signal.addEventListener("abort", aborted, { once: true });

      try {
        // Poll for new events every 800ms, close when run completes or fails
        while (!request.signal.aborted) {
          const payload = await getAutonomousRunEvents(runId, cursor);
          if (!payload) break;

          if (payload.events.length > 0) {
            controller.enqueue(encode(payload));
            cursor = payload.nextCursor;
          }

          // Stop streaming when terminal state reached
          if (payload.status === "completed" || payload.status === "failed") {
            controller.enqueue(encode({ ...payload, done: true }));
            break;
          }

          // Wait before next poll. The shared abort handler above can cancel us.
          await new Promise<void>((resolve) => {
            pollResolve = resolve;
            pollTimeout = setTimeout(() => {
              pollTimeout = null;
              pollResolve = null;
              resolve();
            }, 800);
          });
        }
      } catch {
        // Client disconnected — normal
      } finally {
        request.signal.removeEventListener("abort", aborted);
        if (pollTimeout) clearTimeout(pollTimeout);
        try { controller.close(); } catch { /* already closed */ }
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
