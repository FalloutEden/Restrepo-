import { NextResponse } from "next/server";

import {
  readOperatorState,
  readActivity,
  listProposals,
  listHumanTasks,
  listConversations
} from "@/lib/operator-state";
import { resolveTenantContext } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Scope every read to the caller's tenant. A tenant bearer (btk_*) sees
    // only its own state; founder/admin sees the legacy founder state. Without
    // this, any tenant bearer would read the founder's proposals/tasks/log.
    const { tenantId } = await resolveTenantContext(request);
    const [state, activity, pendingProposals, decidedProposals, openTasks, conversations] =
      await Promise.all([
        readOperatorState(tenantId),
        readActivity(80, tenantId),
        listProposals({ status: "pending" }, tenantId),
        listProposals(undefined, tenantId).then((all) =>
          all.filter((p) => p.status !== "pending").slice(0, 20)
        ),
        listHumanTasks({ status: "open" }, tenantId),
        listConversations(tenantId)
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
