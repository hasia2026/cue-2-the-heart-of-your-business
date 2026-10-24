// Single source of truth for CUE plan pricing that renders anywhere in the
// product UI or generated reports. Update a number here once; every consumer
// (pilot report, sales docs, future checkout) stays in sync. Stripe amounts,
// if wired up later, should derive from these too.
export const PLANS = {
  /** Pilot: 30 days, 1 store, one-time. */
  pilotOneTime: 199,
  /** Operator: single-location dealers. */
  operatorMonthly: 299,
  /** Group: 2–5 stores. */
  groupMonthly: 799,
  /** Founding rate locked for the first operator cohort. */
  foundingMonthly: 199,
} as const;

export const operatorPriceLabel = `$${PLANS.operatorMonthly}/month`;
export const groupPriceLabel = `$${PLANS.groupMonthly}/mo`;
export const foundingPriceLabel = `$${PLANS.foundingMonthly}/mo`;
