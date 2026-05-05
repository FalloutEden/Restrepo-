import { NextResponse } from "next/server";

import {
  readOperatorState,
  readActivity,
  listProposals,
  listHumanTasks,
  listConversations
} from "@/lib/operator-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [state, activity, pendingProposals, decidedProposals, openTasks, conversations] =
      await Promise.all([
        readOperatorState(),
        readActivity(80),
        listProposals({ status: "pending" }),
        listProposals().then((all) => all.filter((p) => p.status !== "pending").slice(0, 20)),
        listHumanTasks({ status: "open" }),
        listConversations()
      ]);

    return NextResponse.json({
      state,
      activity,
      pendingProposals,
      recentDecisions: decidedProposals,
      openTasks,
      conversations: conversations.slice(0, 20)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load operator state." },
      { status: 500 }
    );
  }
}
