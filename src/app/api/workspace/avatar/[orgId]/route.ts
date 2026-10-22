import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Public avatar route, mirroring /api/workspace/logo/[orgId]: the row only
// ever contains a PNG/JPEG/WebP an authenticated writer uploaded (≤200 KB),
// and the response is immutable for an hour. Photo beats the emoji wherever
// the Ambassador persona renders.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const rows = await sql`
    select mime, data from workspace_avatars where organization_id = ${orgId}`;
  if (!rows.length) return new NextResponse("Not found", { status: 404 });
  const { mime, data } = rows[0] as { mime: string; data: Buffer };
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": mime,
      "cache-control": "public, max-age=3600",
    },
  });
}
