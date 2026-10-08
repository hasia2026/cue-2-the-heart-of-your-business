"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { hashPassword, createSessionCookie } from "@/lib/auth";
import { sendMail, mailerConnected } from "@/lib/mailer";
import { logAudit } from "@/lib/audit";

const TTL_MS = 60 * 60 * 1000; // 60 minutes

function appOrigin(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return "http://localhost:3210";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function buildResetUrl(token: string): string {
  return `${appOrigin()}/reset-password?token=${token}`;
}

// ── Shared form state ───────────────────────────────────────────────────────
// Errors come back as state, not thrown — production Next.js redacts thrown
// server-action messages, so the friendly text must travel as data.
export type ResetFormState = { error: string | null };

// ── Step 1: request a reset link ────────────────────────────────────────────
// Always reports the same neutral outcome whether or not the account exists —
// never leaks which emails are registered.
export async function requestPasswordResetAction(
  _prev: ResetFormState,
  fd: FormData,
): Promise<ResetFormState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address first." };

  if (!mailerConnected()) {
    return {
      error:
        "Email is not connected yet. On the server set RESEND_API_KEY (free tier works) and MAIL_FROM, then retry.",
    };
  }

  const [user] = await sql`select id, name from users where email = ${email}`;
  if (user) {
    const token = randomBytes(32).toString("base64url");
    await sql`
      insert into password_resets (user_id, token_hash, expires_at)
      values (${user.id}, ${hashToken(token)}, now() + interval '60 minutes')`;
    const sent = await sendMail({
      to: email,
      subject: "Reset your CUE password",
      text: [
        `Hi ${user.name || "there"},`,
        "",
        "Use this single-use link to set a new CUE password (valid 60 minutes):",
        buildResetUrl(token),
        "",
        "If you didn't request this, you can ignore this email — your password stays unchanged.",
        "— CUE, The Heart of Your Business",
      ].join("\n"),
    });
    if (!sent.sent) {
      const detail = sent.error ?? "unknown error";
      if (detail.includes("only send testing emails to your own email address")) {
        return {
          error:
            "Resend sandbox mode delivers only to your own account email until a domain is verified (resend.com/domains). " +
            "For the demo, request the link for the Resend account's own address; verify a domain to email customers.",
        };
      }
      return { error: `Email provider rejected the message: ${detail}` };
    }
    const [mem] = await sql`select organization_id from members where user_id = ${user.id} limit 1`;
    if (mem) {
      await logAudit({ organizationId: mem.organization_id, actorId: user.id, action: "PASSWORD_RESET_REQUESTED", detail: email });
    }
  }
  // Uniform response for both cases — no registration-status leak.
  redirect("/signin?reset=sent");
}

// ── Step 2: consume the token and set a new password ───────────────────────
export async function resetPasswordAction(
  _prev: ResetFormState,
  fd: FormData,
): Promise<ResetFormState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (password !== confirm) return { error: "Passwords do not match" };

  const [row] = await sql`
    select pr.id, pr.user_id, u.email
    from password_resets pr
    join users u on u.id = pr.user_id
    where pr.token_hash = ${hashToken(token)}
      and pr.used_at is null
      and pr.expires_at > now()
    limit 1`;
  if (!row) return { error: "This reset link is invalid or has expired. Request a new one." };

  await sql.begin(async (tx) => {
    await tx`update users set password_hash = ${hashPassword(password)} where id = ${row.user_id}`;
    await tx`update password_resets set used_at = now() where id = ${row.id} and used_at is null`;
    await tx`delete from password_resets where user_id = ${row.user_id}`;
  });

  await logResetCompletedAudit(row.user_id, row.email);
  await createSessionCookie(row.user_id);
  redirect("/dashboard");
}

async function logResetCompletedAudit(userId: string, email: string): Promise<void> {
  const [mem] = await sql`select organization_id from members where user_id = ${userId} limit 1`;
  if (mem) {
    await logAudit({ organizationId: mem.organization_id, actorId: userId, action: "PASSWORD_RESET_COMPLETED", detail: email });
  }
}
