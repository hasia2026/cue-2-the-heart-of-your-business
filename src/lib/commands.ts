// Natural-language command parsing for the "type what you want" bar.
// Deterministic rules only — no LLM: it runs offline, costs nothing, never
// hallucinates a customer name, and every parsed field is shown to the user
// for confirmation before anything is written. The bar drafts; the human
// confirms. This file never touches the database.

export type CommandKind = "JOB" | "ESTIMATE" | "VISIT";

export type ParsedCommand = {
  raw: string;
  kind: CommandKind;
  /** Candidate customer text, e.g. "summit air" — matched against real names by the caller. */
  customerQuery: string | null;
  amount: number | null;
  address: string | null;
  /** ISO timestamp (server-local clock) when a visit/date phrase was present, else null. */
  when: string | null;
  /** Input left after removing command verbs, customer clause, money, address and date/time spans — the title material. */
  leftover: string;
};

export type ParsedWhenSpan = { date: Date; span: string };
type Span = { start: number; end: number; text: string };

// ─── Intent ──────────────────────────────────────────────────────────────────
const ESTIMATE_RE = /\b(quotes?|estimates?|bids?|proposals?)\b/i;
const VISIT_RE = /\b(visits?|appointments?|reschedul\w*|schedul\w*|rebook|book a)\b/i;

// ─── Money ───────────────────────────────────────────────────────────────────
// "$1,250" / "$1250.50" / "$1.2k" / "2500 dollars|usd|bucks". Bare numbers are
// never money — "Friday 9am" and "unit 3" must not become prices.
const MONEY_RE =
  /\$(\d[\d,]*(?:\.\d{1,2})?)\s*(k\b)?|\$\s*(\d+(?:\.\d+)?)\s*k\b|\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:usd|dollars|bucks)\b/gi;

function extractMoney(text: string): { amount: number | null; spans: Span[] } {
  const spans: Span[] = [];
  let amount: number | null = null;
  for (const m of text.matchAll(MONEY_RE)) {
    spans.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text: m[0] });
    const kMulti = m[2] ?? m[3];
    let n: number | undefined = Number(String(m[1] ?? m[4]).replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    if (kMulti) n *= 1000;
    amount = n; // last money phrase wins
  }
  return { amount, spans };
}

// ─── When (date + time) ──────────────────────────────────────────────────────
// Am/pm is REQUIRED so "at 12 Maple St" is never parsed as noon — only a
// suffixed time ("3pm", "9:30 am") counts as a clock time.
const TIME_RE = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b|\bnoon\b/i;
const DAY_RE = /\b(today|tonight|tomorrow|sunday|sun|monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|friday|fri|saturday|sat)\b/i;
const WEEKDAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, tues: 2, weds: 3, thurs: 4, thur: 4 };

/**
 * Parses date/time mentions: today, tonight, tomorrow, weekday names (next
 * occurrence, times before 8am count PM-preferring "at 3" → 15:00 — the draft
 * card always shows the resolved time so one glance corrects any guess).
 */
export function parseWhen(text: string, now = new Date()): ParsedWhenSpan | null {
  const dayM = text.match(DAY_RE);
  const timeM = text.match(TIME_RE);
  if (!dayM && !timeM) return null;

  const base = new Date(now);
  let hour = 9;
  let minute = 0;
  let explicitSuffix = false;

  if (timeM) {
    if (/^noon$/i.test(timeM[0])) {
      hour = 12;
    } else {
      const h = Number(timeM[1]);
      const min = Number(timeM[2] ?? 0);
      const suffix = (timeM[3] ?? "").toLowerCase();
      explicitSuffix = suffix.length > 0;
      hour = h;
      minute = min;
      if (suffix.startsWith("p") && h < 12) hour += 12;
      else if (suffix.startsWith("a") && h === 12) hour = 0;
    }
  }

  if (dayM) {
    const word = dayM[1].toLowerCase();
    if (word.startsWith("tom")) base.setDate(base.getDate() + 1);
    else if (!word.startsWith("tod")) { // today/tonight keep the same day
      const target = WEEKDAYS[word.slice(0, 3)];
      if (target !== undefined) {
        let delta = (target - base.getDay() + 7) % 7;
        if (delta === 0) delta = 7; // "Friday" said on a Friday means next Friday
        base.setDate(base.getDate() + delta);
      }
    }
    if (word === "tonight" && !explicitSuffix && hour === 9) hour = 18;
  }

  base.setHours(hour, minute, 0, 0);
  const spanEnd = Math.max(timeM ? (timeM.index ?? 0) + timeM[0].length : 0, dayM ? (dayM.index ?? 0) + dayM[0].length : 0);
  const spanStart = Math.min(timeM ? timeM.index ?? spanEnd : spanEnd, dayM ? dayM.index ?? spanEnd : spanEnd);
  const span = spanEnd > spanStart ? text.slice(spanStart, spanEnd) : "";
  return { date: base, span };
}

// ─── Address ─────────────────────────────────────────────────────────────────
// "at 4422 Cedar Ave" / "at 12 Maple St apt 3". Requires a street number plus a
// street-type word so "at Summit Air" is never mistaken for a property.
const ADDR_RE =
  /\b(?:at|address|property)\s+((?:\d+[a-z]?\s+)?(?:[a-z0-9 .#'/-])*(?:st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|ct|court|way|hwy|highway|ter|terrace|pl|place|cir|circle|pkwy|parkway|trl|trail)\b\.?(?:\s+(?:apt|unit|ste|suite|#)\s*[\w-]+)?)/i;

// ─── Filler ──────────────────────────────────────────────────────────────────
const LEAD_RE =
  /^(?:hey|ok|okay|please|hi)?[,\s]*(?:cue)?[,\s]*(?:(?:new|add|create|open|start|schedule|book|make|do)\s+)*(?:(?:a|an|the)\s+)?(?:(?:upcoming|another)\s+)?\s*(jobs?|estimates?|quotes?|bids?|proposals?|visits?|appointments?|work\s*orders?)\b[\s,:]*(?:for\s+|on\s+|at\s+|to\s*)?/i;

/** Removes housekeeping/filler words from a leftover title fragment. */
function tidyTitle(s: string): string {
  return s
    .replace(/^\s*(?:for|on|at|to|of)\s+/i, "")
    .replace(/\s*[,;:]?\s*(?:please|thanks|thank you|asap|urgently)\.?\s*$/i, "")
    .replace(/\b(?:for|on|at|to|of)\s*$/i, "") // straggling preposition — \b keeps “thermostat” whole
    .replace(/["“”'’]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,.;]+$/, "")
    .replace(/^[\s,.;]+/, "")
    .trim();
}

function dropSpans(text: string, spans: Span[]): string {
  let out = "";
  let cursor = 0;
  for (const sp of spans.sort((a, b) => a.start - b.start)) {
    if (sp.start < cursor) continue;
    out += text.slice(cursor, sp.start) + " ";
    cursor = sp.end;
  }
  out += text.slice(cursor);
  return out;
}

export function parseCommand(input: string): ParsedCommand {
  const raw = input.trim();
  const lower = raw.toLowerCase();
  const kind: CommandKind = VISIT_RE.test(lower)
    ? "VISIT"
    : ESTIMATE_RE.test(lower)
      ? "ESTIMATE"
      : "JOB";

  let working = raw;

  // Money
  const { amount, spans: moneySpans } = extractMoney(working);
  working = dropSpans(working, moneySpans);

  // When
  const parsedWhen = parseWhen(working);
  if (parsedWhen?.span) working = working.replace(parsedWhen.span, " ");

  // Address
  const addrM = working.match(ADDR_RE);
  const address = addrM ? tidyTitle(addrM[1]) : null;
  if (addrM) working = working.replace(addrM[0], " ");

  // Lead verbs ("new job for", "add a visit for", "schedule appointment for"…)
  const leadM = working.match(LEAD_RE);
  if (leadM) working = working.slice((leadM.index ?? 0) + leadM[0].length);

  // Customer clause: the remaining fragment is searched directly against real
  // names by the caller (leading token windows), so "new job for Summit Air
  // LLC replace heater" finds Summit and keeps "replace heater" as the title.
  const leftover = tidyTitle(working);
  const customerQuery = leftover || null;

  return {
    raw,
    kind,
    customerQuery: customerQuery ? customerQuery.slice(0, 80) : null,
    amount,
    address: address ? address.slice(0, 200) : null,
    when: parsedWhen ? parsedWhen.date.toISOString() : null,
    leftover: leftover.slice(0, 200),
  };
}

/**
 * Turns the leftover fragments + matched customer into a job title. The
 * customer's own name is removed from the leftover so "Summit Air $500 replace
 * heater" becomes "replace heater", not "Summit Air replace heater".
 */
export function buildTitle(leftover: string, customerName: string, kind: CommandKind, _customerQuery: string | null): string {
  let s = tidyTitle(leftover);
  void _customerQuery;
  if (customerName && customerName.trim()) {
    // Remove the full name, then any of its own words — "Jane install new
    // furnace" with customer "Jane Smith" loses just "Jane".
    const nameEsc = customerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$").replace(/\s+/g, "\\s+");
    s = s.replace(new RegExp(`\\b${nameEsc}\\b`, "gi"), " ");
    for (const word of customerName.toLowerCase().split(/\s+/)) {
      if (word.length >= 3) {
        s = s.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$")}\\b`, "gi"), " ");
      }
    }
  }
  s = tidyTitle(s).slice(0, 160);
  if (!s) {
    const word = kind === "ESTIMATE" ? "Estimate" : kind === "VISIT" ? "Visit" : "Job";
    s = `${word} — ${customerName}`.slice(0, 160);
  }
  return s;
}

/**
 * Matches a free-text candidate against real customer names (already fetched).
 * Strategy: exact full-name containment wins, then full-word prefix tokens.
 * Returns every tie so the caller can ask instead of guessing.
 */
export function matchCustomerDrafts(
  query: string | null,
  customers: { id: string; name: string; address: string | null }[]
): { id: string; name: string; address: string | null }[] {
  if (!query) return [];
  const q = query.toLowerCase().replace(/["“”'’,.]/g, " ").replace(/\s{2,}/g, " ").trim();
  if (q.length < 2) return [];

  const norm = (s: string) => s.toLowerCase().replace(/\s{2,}/g, " ").trim();

  // 1) full-name containment either direction ("summit air" ↔ "Summit Air LLC")
  const contains = customers.filter((c) => {
    const n = norm(c.name);
    return n.length >= 2 && (q.includes(n) || n.includes(q));
  });
  if (contains.length) {
    const best = contains.slice().sort((a, b) => b.name.length - a.name.length);
    const longest = best[0].name.length;
    const finalists = best.filter((c) => c.name.length >= longest - 2);
    if (finalists.length === 1) return finalists;
    return finalists.slice(0, 6);
  }

  // 2) leading token windows, longest first (1–3 tokens). The candidate often
  // carries work words ("Jane install new furnace"), so walk the windows and
  // take the LONGEST window that still matches a real name.
  const CONNECT = new Set(["for", "on", "at", "to", "of", "and"]);
  const tokens = q.split(" ").filter(Boolean);
  const pick = (hits: typeof customers) => {
    const uniq = hits.filter((c, i) => hits.findIndex((x) => x.id === c.id) === i);
    return uniq.length === 1 ? uniq : uniq.slice(0, 6);
  };
  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    const window = tokens.slice(0, len).join(" ");
    const hits = customers.filter((c) => {
      const n = norm(c.name);
      return n === window || n.split(" ").some((w) => w === window || w.startsWith(window));
    });
    if (hits.length) return pick(hits);
  }
  // 3) trailing window ("tune up for John") — last meaningful tokens only,
  // connectors dropped so "… for John" scans just "john".
  const tailTokens = tokens.slice().reverse().filter((w) => !CONNECT.has(w));
  for (let len = Math.min(2, tailTokens.length); len >= 1; len--) {
    const window = tailTokens.slice(0, len).reverse().join(" ");
    const hits = customers.filter((c) => {
      const n = norm(c.name);
      return n === window || n.split(" ").some((w) => w === window || w.startsWith(window));
    });
    if (hits.length) return pick(hits);
  }
  return [];
}
