"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = `CU3-${randomBytes(3).toString("hex").toUpperCase()}`;
    const [row] = await sql`select 1 from partners where code = ${code}`;
    if (!row) return code;
  }
  throw new Error("Could not generate a unique partner code");
}

export async function createPartnerAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!name || !email.includes("@")) throw new Error("Name and a valid email are required");

  const [existing] = await sql`select code from partners where email = ${email}`;
  if (existing) redirect(`/partners?code=${existing.code}`);

  const code = await uniqueCode();
  await sql`insert into partners (name, email, code) values (${name}, ${email}, ${code})`;
  redirect(`/partners?code=${code}`);
}
