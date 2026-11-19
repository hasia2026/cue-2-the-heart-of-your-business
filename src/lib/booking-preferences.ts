// Booking-rule preferences shared by the 24-hour cadence and the Field Ops UI.
//
// This module is deliberately independent of the booking-policy evaluator:
// reading which rules are on must not require deposits, snapshots or
// enforcement. The evaluator can build on these definitions later.
import { sql } from "./db";

export type BookingRuleKey =
  | "confirm_24h"
  | "arrival_window"
  | "deposit_new_customer"
  | "no_show_fee";

export type BookingRules = {
  confirm24h: boolean;
  arrivalWindow: boolean;
  depositNewCustomer: boolean;
  noShowFee: boolean;
  depositAmount: number;
  noShowFeeAmount: number;
};

export const BOOKING_RULE_DEFAULTS: BookingRules = {
  // Automatic customer messages are opt-in. The other three rules affect
  // local workflow and drafts, so their defaults are safe without a send.
  confirm24h: false,
  arrivalWindow: true,
  depositNewCustomer: false,
  noShowFee: false,
  depositAmount: 50,
  noShowFeeAmount: 75,
};

export const BOOKING_RULE_KEYS: BookingRuleKey[] = [
  "confirm_24h",
  "arrival_window",
  "deposit_new_customer",
  "no_show_fee",
];

export const DEFAULT_RULE_THRESHOLDS: Record<string, number> = {
  deposit_new_customer: BOOKING_RULE_DEFAULTS.depositAmount,
  no_show_fee: BOOKING_RULE_DEFAULTS.noShowFeeAmount,
};

function positiveMoney(raw: unknown, fallback: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fallback;
}

/** Read the org's rules once; absent rows mean the safe product defaults. */
export async function getBookingRules(orgId: string): Promise<BookingRules> {
  const rows = (await sql`
    select rule_key, enabled, threshold from field_ops_rules
    where organization_id = ${orgId}`) as unknown as {
    rule_key: string;
    enabled: boolean;
    threshold: unknown;
  }[];
  const map = new Map(rows.map((r) => [r.rule_key, r]));
  const enabled = (key: BookingRuleKey, fallback: boolean) =>
    map.has(key) ? Boolean(map.get(key)?.enabled) : fallback;
  return {
    confirm24h: enabled("confirm_24h", BOOKING_RULE_DEFAULTS.confirm24h),
    arrivalWindow: enabled("arrival_window", BOOKING_RULE_DEFAULTS.arrivalWindow),
    depositNewCustomer: enabled("deposit_new_customer", BOOKING_RULE_DEFAULTS.depositNewCustomer),
    noShowFee: enabled("no_show_fee", BOOKING_RULE_DEFAULTS.noShowFee),
    depositAmount: positiveMoney(
      map.get("deposit_new_customer")?.threshold,
      BOOKING_RULE_DEFAULTS.depositAmount,
    ),
    noShowFeeAmount: positiveMoney(
      map.get("no_show_fee")?.threshold,
      BOOKING_RULE_DEFAULTS.noShowFeeAmount,
    ),
  };
}
