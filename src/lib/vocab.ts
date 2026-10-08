// Industry vocabulary — page labels adapt to the org's vertical instead of
// always speaking dealership. Resolved from business_profiles.industry; the
// auto pack is the default so existing orgs see zero change.
import { sql } from "./db";

export type Vocab = {
  pack: string;
  pipelineSub: string;
  inventoryTitle: string;
  inventoryEmpty: string;
  serviceTitle: string;
  serviceEmpty: string;
};

const AUTO: Vocab = {
  pack: "Auto Dealership",
  pipelineSub: "Leads, deals, inventory, and service work in one view — the Auto Dealership pack surface.",
  inventoryTitle: "Inventory (oldest first)",
  inventoryEmpty: "No available inventory.",
  serviceTitle: "Service orders",
  serviceEmpty: "No service orders.",
};

const HVAC: Vocab = {
  pack: "Home Services (HVAC)",
  pipelineSub: "Quote requests, replacement jobs, equipment quotes, and service calls in one view — the Home Services pack surface.",
  inventoryTitle: "Equipment quotes (oldest first)",
  inventoryEmpty: "No open equipment quotes.",
  serviceTitle: "Service calls",
  serviceEmpty: "No service calls.",
};

export async function getVocab(orgId: string): Promise<Vocab> {
  const [row] = await sql`select industry from business_profiles where organization_id = ${orgId}`;
  return row?.industry === "HOME_SERVICES" ? HVAC : AUTO;
}
