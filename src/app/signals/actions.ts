"use server";

import { revalidatePath } from "next/cache";
import { requireSessionAction } from "@/lib/auth";
import {
  createWatch,
  setWatchActive,
  deleteWatch,
  convertSignalToLead,
  convertSignalToInsight,
  setSignalStatus,
  respondToReview,
} from "@/lib/signals";

function refresh() {
  revalidatePath("/signals");
  revalidatePath("/dashboard");
}

export async function createWatchAction(formData: FormData) {
  const session = await requireSessionAction();
  const name = String(formData.get("name") ?? "").trim();
  const keywords = String(formData.get("keywords") ?? "").trim();
  const geography = String(formData.get("geography") ?? "").trim();
  const sourceHint = String(formData.get("sourceHint") ?? "").trim();
  if (!name || !keywords) throw new Error("Watch name and keywords are required");
  await createWatch(session.organizationId, { name, keywords, geography, sourceHint }, session.user.id);
  refresh();
  return { ok: true };
}

export async function toggleWatchAction(watchId: string, active: boolean) {
  const session = await requireSessionAction();
  await setWatchActive(session.organizationId, watchId, active, session.user.id);
  refresh();
  return { ok: true };
}

export async function deleteWatchAction(watchId: string) {
  const session = await requireSessionAction();
  await deleteWatch(session.organizationId, watchId, session.user.id);
  refresh();
  return { ok: true };
}

export async function convertToLeadAction(signalId: string) {
  const session = await requireSessionAction();
  const result = await convertSignalToLead(session.organizationId, signalId, session.user.id);
  refresh();
  return result;
}

export async function convertToInsightAction(signalId: string) {
  const session = await requireSessionAction();
  const result = await convertSignalToInsight(session.organizationId, signalId, session.user.id);
  refresh();
  return result;
}

export async function dismissSignalAction(signalId: string) {
  const session = await requireSessionAction();
  await setSignalStatus(session.organizationId, signalId, "DISMISSED", session.user.id);
  refresh();
  return { ok: true };
}

export async function respondReviewAction(reviewId: string, text: string) {
  const session = await requireSessionAction();
  const trimmed = text.trim();
  if (trimmed.length < 2) throw new Error("Write a response first");
  await respondToReview(session.organizationId, reviewId, trimmed, session.user.id);
  refresh();
  return { ok: true };
}
