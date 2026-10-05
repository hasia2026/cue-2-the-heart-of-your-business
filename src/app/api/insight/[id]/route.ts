import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getInsightBundle } from "@/lib/intelligence";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const bundle = await getInsightBundle(session.organizationId, id);
  if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(bundle);
}
