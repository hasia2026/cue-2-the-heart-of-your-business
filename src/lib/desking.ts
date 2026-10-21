// Desking profitometer — parses the store's OWN discount-authority policy doc
// (the one captured in /capture) into per-role dollar caps, then compares each
// deal's discount against the seller's authority with a plain-language
// warning. Rules of thumb parsed, not hardcoded: if the manager rewrites the
// policy doc and re-captures it, the numbers update without a code change.
import { sql } from "./db";

export type AuthorityBand = { role: string; cap: number };
export type DealAuthorityCheck = {
  dealId: string;
  discount: number;
  maxBand: AuthorityBand | null;
  needsSignoff: boolean;
  bandLabel: string;
};

/** Parse sentences like "Sales consultants may discount up to $500.
 *  Managers up to $1,800. Beyond $1,800 requires GM sign-off. Used units
 *  60+ days on lot: additional $1,000 authority." */
export function parseAuthorityBands(text: string): AuthorityBand[] {
  if (!text) return [];
  const bands: AuthorityBand[] = [];
  // "X may discount up to $N", "X up to $N", "X authority: $N"
  const roleRe =
    /([A-Za-z][A-Za-z\s/&-]{2,40}?)\s+(?:may\s+)?(?:discount\s+up\s+to|up\s+to|authority[^.]{0,20}?)\s+\$?([\d,]+(?:\.\d{2})?)/gi;
  // Pick the cheapest word out of "consultant", "manager", "GM", "owner" etc.
  const canonical = (raw: string): string | null => {
    const t = raw.toLowerCase().trim();
    if (/consultant|sales|advisor/.test(t)) return "CONSULTANT";
    if (/office manager|sales manager|manager/.test(t)) return "MANAGER";
    if (/\bgm\b|general manager/.test(t)) return "GM";
    if (/owner/.test(t)) return "OWNER";
    if (/finance|f&i/.test(t)) return "FINANCE";
    return null;
  };
  for (const m of text.matchAll(roleRe)) {
    const role = canonical(m[1]);
    if (!role) continue;
    const cap = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(cap) || cap <= 0) continue;
    // Later sentences for the same role override earlier ones (a re-captured
    // policy doc usually bumps the number rather than adding a second cap).
    const prev = bands.find((b) => b.role === role);
    if (prev) prev.cap = cap;
    else bands.push({ role, cap });
  }
  return bands;
}

function bandFor(bands: AuthorityBand[], role: string): AuthorityBand | null {
  const order = ["CONSULTANT", "MANAGER", "GM", "OWNER"];
  // The banded policy is cumulative: a MANAGER inherits the CONSULTANT cap
  // plus their own banded headroom. Simplest honest read: the store's
  // written cap for the role, ordered by the org chart ladder above.
  const idx = order.indexOf(role);
  return idx >= 0 ? bands.find((b) => b.role === role) ?? null : null;
}

/** Loads the org's discount-authority doc + one deal, evaluates the
 *  discount against the matching role band. */
export async function checkDealAuthority(
  orgId: string,
  dealId: string,
  sellerRole: string
): Promise<DealAuthorityCheck | null> {
  const [doc] = await sql`
    select id, title, extracted_text from documents
    where organization_id = ${orgId}
      and (title ilike '%discount%' or title ilike '%authority%' or extracted_text ilike '%discount up to%')
      and extracted_text is not null
    order by uploaded_at desc limit 1`;
  if (!doc) return null;
  const bands = parseAuthorityBands(doc.extracted_text ?? "");
  if (!bands.length) return null;

  const [deal] = await sql`
    select d.id, d.front_gross, d.back_gross, v.cost, d.amount
    from deals d left join vehicles v on v.id = d.vehicle_id
    where d.id = ${dealId} and d.organization_id = ${orgId}`;
  if (!deal) return null;

  // Discount = vehicle cost minus front gross (the seller gnawed into the
  // front margin). Not negative: a deal could be re-priced upward.
  const cost = Number(deal.cost ?? 0);
  const front = Number(deal.front_gross ?? 0);
  const discount = Math.max(0, cost - front);

  const maxBand = bandFor(bands, sellerRole);
  return {
    dealId: String(deal.id),
    discount,
    maxBand,
    needsSignoff: maxBand ? discount > maxBand.cap : false,
    bandLabel: maxBand
      ? `${sellerRole.toLowerCase()} authority: $${maxBand.cap.toLocaleString()}`
      : `${sellerRole.toLowerCase()} authority: not in policy`,
  };
}
