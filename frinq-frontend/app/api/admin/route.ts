import { NextRequest, NextResponse } from "next/server";
import { readAllEvents, buildSummaries, buildFunnelCounts } from "@/lib/tracking";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const key = req.nextUrl.searchParams.get("key");
  if (key !== adminKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const events = readAllEvents();
  const sessions = buildSummaries(events).sort(
    (a, b) => b.lastSeen.localeCompare(a.lastSeen)
  );
  const funnel = buildFunnelCounts(events);
  return NextResponse.json({ sessions, funnel, totalEvents: events.length });
}
