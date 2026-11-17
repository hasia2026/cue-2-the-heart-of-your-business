// Industry vocabulary — page labels adapt to the org's vertical instead of
// always speaking dealership. Resolved from business_profiles.industry; the
// auto pack is the default so existing orgs see zero change.
// White-labeling: business_profiles.label_overrides (jsonb map of Vocab key →
// string) wins over the pack default for any key the org has set. Edited from
// Settings → Vocabulary.
import { sql } from "./db";

export type Vocab = {
  // Canonical industry key — page copy (e.g. the intake exercise) branches on
  // this, so it must never be inferred from the editable pack label.
  packId: "AUTO_DEALERSHIP" | "AUTO_REPAIR" | "HOME_SERVICES" | "SALON" | "OTHER";
  pack: string;
  pipelineSub: string;
  inventoryTitle: string;
  inventoryEmpty: string;
  serviceTitle: string;
  serviceEmpty: string;
  // Dashboard: pack chip shown under the tagline.
  dashPack: string;
  // Compass dimension label overrides (English). null → keep the i18n default
  // (the auto pack's wording lives in i18n.ts for all locales).
  dimPipeline: string | null;
  dimInventory: string | null;
};

// Editable keys, exposed to the Settings form in this order.
export const VOCAB_LABELS: [keyof Vocab & string, string][] = [
  ["pack", "Industry pack name"],
  ["dashPack", "Dashboard pack chip"],
  ["pipelineSub", "Pipeline page subtitle"],
  ["inventoryTitle", "Inventory section title"],
  ["inventoryEmpty", "Inventory empty state"],
  ["serviceTitle", "Service section title"],
  ["serviceEmpty", "Service empty state"],
  ["dimPipeline", "Compass: pipeline dimension"],
  ["dimInventory", "Compass: inventory dimension"],
];

const AUTO: Vocab = {
  packId: "AUTO_DEALERSHIP",
  pack: "Auto Dealership",
  pipelineSub: "Leads, deals, inventory, and service work in one view — the Auto Dealership pack surface.",
  inventoryTitle: "Inventory (oldest first)",
  inventoryEmpty: "No available inventory.",
  serviceTitle: "Service orders",
  serviceEmpty: "No service orders.",
  dashPack: "Auto Dealership pack",
  dimPipeline: null,
  dimInventory: null,
};

// Generic fallback for orgs whose industry is neither of the built packs
// (blank, OTHER, RETAIL, SALON, …). Honest labels instead of pretending to be
// an auto dealership — the open-needs-no-vertical copy works for any business.
const GENERIC: Vocab = {
  packId: "OTHER",
  pack: "Generic",
  pipelineSub: "Leads, deals, inventory, and service work in one view — your industry pack surface.",
  inventoryTitle: "Inventory (oldest first)",
  inventoryEmpty: "No available inventory.",
  serviceTitle: "Service orders",
  serviceEmpty: "No service orders.",
  dashPack: "Generic pack",
  dimPipeline: null,
  dimInventory: null,
};

const REPAIR: Vocab = {
  packId: "AUTO_REPAIR",
  pack: "Auto Repair",
  pipelineSub: "Service enquiries, estimates, repair orders, and parts in one view — the Auto Repair pack surface.",
  inventoryTitle: "Parts shelf (oldest first)",
  inventoryEmpty: "No parts on the shelf.",
  serviceTitle: "Repair orders",
  serviceEmpty: "No repair orders.",
  dashPack: "Auto Repair pack",
  dimPipeline: "Estimate pipeline",
  dimInventory: "Parts shelf",
};

const SALON: Vocab = {
  packId: "SALON",
  pack: "Salon & Beauty",
  pipelineSub: "Booking requests, service tickets, retail, and rebooking in one view — the Salon & Beauty pack surface.",
  inventoryTitle: "Retail shelf (oldest first)",
  inventoryEmpty: "No retail products on the shelf.",
  serviceTitle: "Service tickets",
  serviceEmpty: "No service tickets.",
  dashPack: "Salon & Beauty pack",
  dimPipeline: "Booking pipeline",
  dimInventory: "Retail shelf",
};

const HVAC: Vocab = {
  packId: "HOME_SERVICES",
  pack: "Home Services (HVAC)",
  pipelineSub: "Quote requests, replacement jobs, equipment quotes, and service calls in one view — the Home Services pack surface.",
  inventoryTitle: "Equipment quotes (oldest first)",
  inventoryEmpty: "No open equipment quotes.",
  serviceTitle: "Service calls",
  serviceEmpty: "No service calls.",
  dashPack: "Home Services (HVAC) pack",
  dimPipeline: "Quote pipeline",
  dimInventory: "Equipment quotes",
};

/** Canonical industry key. Profile edits and imports have historically
 *  written "HOME SERVICES", "home_services" or "Home Services (HVAC)" — all
 *  of those must resolve to the same pack instead of silently falling back to
 *  the generic (dealership-flavoured) defaults. */
export function normalizeIndustry(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  const key = s.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (key.startsWith("HOME_SERVICE")) return "HOME_SERVICES";
  if (key.startsWith("AUTO_DEALER") || key.startsWith("CAR_DEALER") || key === "DEALERSHIP") return "AUTO_DEALERSHIP";
  if (/REPAIR|MECHANIC|AUTO_SERVICE|AUTO_SHOP|SERVICE_SHOP/.test(key)) return "AUTO_REPAIR";
  if (/SALON|BEAUTY|SPA|NAIL/.test(key)) return "SALON";
  return key;
}

export const INDUSTRY_PACKS: { value: string; label: string }[] = [
  { value: "AUTO_DEALERSHIP", label: "Auto Dealership" },
  { value: "AUTO_REPAIR", label: "Auto Repair (independent shop)" },
  { value: "HOME_SERVICES", label: "Home Services (HVAC)" },
  { value: "SALON", label: "Salon & Beauty" },
  { value: "OTHER", label: "Custom / other (Generic pack + per-label overrides)" },
];

export async function getVocab(orgId: string): Promise<Vocab> {
  const [row] = await sql`
    select industry, label_overrides from business_profiles where organization_id = ${orgId}`;
  const industry = normalizeIndustry(row?.industry);
  const base =
    industry === "HOME_SERVICES" ? HVAC :
    industry === "AUTO_DEALERSHIP" ? AUTO :
    industry === "AUTO_REPAIR" ? REPAIR :
    industry === "SALON" ? SALON :
    GENERIC;
  const overrides = (row?.label_overrides ?? {}) as Partial<Record<keyof Vocab, unknown>>;
  const vocab = { ...base };
  for (const [key] of VOCAB_LABELS) {
    const v = overrides[key];
    if (key === "dimPipeline" || key === "dimInventory") {
      // null explicitly resets to the i18n default; blank string clears an override.
      (vocab[key] as string | null) =
        v === null ? null : typeof v === "string" && v.trim() ? v.trim() : base[key];
    } else if (typeof v === "string" && v.trim()) {
      (vocab[key] as string) = v.trim();
    }
  }
  return vocab;
}
