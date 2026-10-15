// Shared capture classification + auto-filing. One home for the rules so
// notes, pasted AI chats, and OCR'd images all land in the same folders.
import { sql } from "@/lib/db";

export type CaptureClass = { kind: string; tags: string[] };

const RULES: { match: RegExp; kind: string; tags: string[] }[] = [
  { match: /\bchatgpt\b|\bclaude\b|\bgemini\b|\bcopilot\b|\bperplexity\b|\b(as an? ai\b|large language|prompt:|assistant:)|\bchat (gpt\s*4|with an? (ai|assistant|bot))\b/i,
    kind: "AI_CHAT", tags: ["ai-chat"] },
  { match: /handbook|policy|pto|benefit|warranty|refund/i, kind: "POLICY", tags: ["policy"] },
  { match: /sop|procedure|process|onboarding|checklist/i, kind: "PROCEDURE", tags: ["procedure", "operations"] },
  { match: /contract|agreement|msa|proposal|deal/i, kind: "CONTRACT", tags: ["contract", "legal"] },
  { match: /invoice|receipt|payment|statement/i, kind: "RECORD", tags: ["finance"] },
  { match: /estimate|quote|appraisal/i, kind: "RECORD", tags: ["sales"] },
  { match: /\.xlsx|\.csv|sheet|roster|inventory/i, kind: "SPREADSHEET", tags: ["data"] },
];

// Folder names per document kind — the "auto Google Drive" mapping. Kinds not
// listed file into "Captured" (a general inbox folder).
export const FOLDER_FOR_KIND: Record<string, string> = {
  AI_CHAT: "AI Chats",
  POLICY: "Policies & Procedures",
  PROCEDURE: "Policies & Procedures",
  CONTRACT: "Contracts",
  RECORD: "Invoices & Receipts",
  SPREADSHEET: "Spreadsheets & Data",
  MEDIA: "Images & Media",
};

export function classifyCapture(text: string): CaptureClass {
  const rule = RULES.find((r) => r.match.test(text));
  return { kind: rule?.kind ?? "OTHER", tags: rule?.tags ?? [] };
}

/** Find-or-create the org's auto folder for a kind, by folder name.
 *  Concurrent first-captures could insert twice; on a unique-key error we
 *  re-select so two simultaneous uploads can't create duplicate folders. */
export async function fileToFolder(
  orgId: string,
  kind: string,
): Promise<{ id: string; name: string } | null> {
  const name = FOLDER_FOR_KIND[kind] ?? "Captured";
  const [existing] = await sql`
    select id, name from departments where organization_id = ${orgId} and name = ${name} limit 1`;
  if (existing) return existing as { id: string; name: string };
  try {
    const [created] = await sql`
      insert into departments (organization_id, name) values (${orgId}, ${name}) returning id, name`;
    return (created as { id: string; name: string }) ?? null;
  } catch {
    const [raced] = await sql`
      select id, name from departments where organization_id = ${orgId} and name = ${name} limit 1`;
    return (raced as { id: string; name: string }) ?? null;
  }
}
