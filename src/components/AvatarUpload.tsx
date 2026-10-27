"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadAvatar, removeAvatar } from "@/app/(app)/settings/actions";

/**
 * Ambassador photo upload — shared by the onboarding wizard and the
 * Settings → AI Ambassador section (same server action the Workspace Studio
 * persona tab uses: PNG/JPEG/WebP ≤ 200 KB). Photo beats the emoji wherever
 * the persona renders.
 */
export default function AvatarUpload({ currentUrl }: { currentUrl: string | null }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const router = useRouter();

  async function submit() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("avatar", file);
      const res = await uploadAvatar(fd);
      if (res.ok) {
        setMsg("Photo saved — it now fronts every page.");
        setFile(null);
        startTransition(() => router.refresh());
      } else {
        setMsg(res.error ?? "Upload failed.");
      }
    } catch {
      setMsg("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMsg(null);
    try {
      await removeAvatar();
      setMsg("Photo removed — back to the emoji.");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] p-3">
      <label className="label" htmlFor="obAvatarPhoto">Ambassador photo (optional)</label>
      <p className="muted mb-2 text-xs">
        PNG, JPEG or WebP up to 200 KB — shown wherever your Ambassador appears.
        Leave off to keep the emoji.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="obAvatarPhoto"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="input !py-1.5 text-xs"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setMsg(null);
          }}
        />
        <button type="button" disabled={!file || busy || pending} onClick={submit} className="btn-primary !py-1.5 text-xs">
          {busy ? "Uploading…" : "Upload photo"}
        </button>
        {currentUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentUrl} alt="Current Ambassador photo" className="h-8 w-8 rounded-full object-cover" />
            <button type="button" disabled={busy || pending} onClick={remove} className="btn-ghost !py-1.5 text-xs">
              Remove
            </button>
          </>
        )}
      </div>
      {msg && <p className="mt-1.5 text-xs text-navy-300">{msg}</p>}
    </div>
  );
}
