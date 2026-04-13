import { NextResponse } from "next/server";
import { mockAgents } from "@/lib/mock-agents";

export function GET() {
  return NextResponse.json({ agents: mockAgents });
}
