import { runOperator, type AgentEvent } from "@/lib/operator-agent";
import { newId } from "@/lib/operator-state";

export const runtime = "nodejs";
// Long-running streaming response — opt out of static caching.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { conversationId?: string; message?: string };
  try {
    body = (await request.json()) as { conversationId?: string; message?: string };
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) {
    return new Response("Missing 'message' field", { status: 400 });
  }
  const conversationId = body.conversationId?.trim() || newId("conv");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent | { kind: "conversation_id"; id: string }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      send({ kind: "conversation_id", id: conversationId });

      try {
        await runOperator({
          conversationId,
          userMessage: message,
          source: "chat",
          onEvent: send
        });
      } catch (error) {
        send({
          kind: "error",
          message: error instanceof Error ? error.message : "Unknown operator error"
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
