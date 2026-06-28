import { NextRequest, NextResponse } from "next/server";
import { deleteSubscription } from "../../../lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    await deleteSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
