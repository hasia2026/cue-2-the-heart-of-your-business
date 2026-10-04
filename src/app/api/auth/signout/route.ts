import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/signin", req.url));
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
