import { NextRequest, NextResponse } from "next/server";
import { appendEvent } from "@/lib/tracking";

export const runtime = "nodejs";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { session, page, action, identity, element, data } = body;
    if (!session || !page || !action) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }
    appendEvent({ session, page, action, identity, element, data });

    // Mirror to backend (fire-and-forget)
    if (BACKEND_URL) {
      fetch(`${BACKEND_URL}/api/v1/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session, page, action, identity, element, data }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
