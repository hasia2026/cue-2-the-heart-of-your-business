// Import guides — the "ask the source business for the right export" step.
// Each industry pack gets a short list of exports to request (what it is,
// where it comes from in common dealership/office software, which CUE import
// target it feeds) plus a copy-paste request script the owner can send.
// Kept as plain data so Capture, the importer deep-links and future surfaces
// all tell ONE story.

export type ImportGuideItem = {
  /** What to ask for, in the words an office manager recognizes. */
  ask: string;
  /** Where to get it in the software they actually run. */
  where: string;
  /** Columns that make the import smooth (from our field model's guesses). */
  columns: string;
  /** /intake/import?kind= query param that preselects the target. */
  kindParam: string;
  /** CUE record target name shown in the UI. */
  becomes: string;
};

export type ImportGuide = {
  pack: string;
  /** One-line pitch for asking the business. */
  pitch: string;
  items: ImportGuideItem[];
};

const DEALERSHIP: ImportGuide = {
  pack: "AUTO_DEALERSHIP",
  pitch: "Ask the dealership office for these exports — each becomes live CUE records (customers, inventory, service history, receivables).",
  items: [
    {
      ask: "Customer list with contact info",
      where: "DMS customer/CRM module → export customers (name, phone, email, address)",
      columns: "name, phone, email, address",
      kindParam: "CUSTOMERS",
      becomes: "Customers",
    },
    {
      ask: "Inventory list (plate/stock list)",
      where: "DMS inventory module → export in-stock vehicles (stock#, year, make, model, price)",
      columns: "stock, year, make, model, list price, status",
      kindParam: "VEHICLES",
      becomes: "Vehicles",
    },
    {
      ask: "Closed-deal / service invoice history",
      where: "DMS accounting → export closed deals and repair orders (invoice#, customer, amount, date)",
      columns: "invoice number, customer, amount, kind, issued date",
      kindParam: "INVOICES",
      becomes: "Invoices",
    },
    {
      ask: "Service / work-order history",
      where: "DMS service module → export completed repair orders (description, customer, dates, total)",
      columns: "job title, customer, status, amount, opened/completed dates",
      kindParam: "SERVICE_ORDERS",
      becomes: "Service orders",
    },
  ],
};

const HVAC: ImportGuide = {
  pack: "HOME_SERVICES",
  pitch: "Ask the office for these exports — each becomes live CUE records (customers, service-call history, maintenance plans, receivables).",
  items: [
    {
      ask: "Customer list with contacts",
      where: "Service software (Housecall Pro / ServiceTitan / Service Autopilot) → export customers (name, phone, email, service address)",
      columns: "name, phone, email, address",
      kindParam: "CUSTOMERS",
      becomes: "Customers",
    },
    {
      ask: "Completed job / work-order history",
      where: "Same software → export completed work orders (description, customer, dates, invoice total)",
      columns: "job title, customer, status, amount, opened/completed dates",
      kindParam: "SERVICE_ORDERS",
      becomes: "Service calls",
    },
    {
      ask: "Maintenance-agreement / service-plan members",
      where: "Same software → export plan members (customer, plan name, value, renewal date, status)",
      columns: "customer, plan name, annual value, start/end dates, status",
      kindParam: "AGREEMENTS",
      becomes: "Service plans",
    },
    {
      ask: "Open receivables / paid invoices",
      where: "Accounting → export invoices or receivables (invoice#, customer, amount, status)",
      columns: "invoice number, customer, amount, status, issued date",
      kindParam: "INVOICES",
      becomes: "Invoices",
    },
  ],
};

const GENERIC: ImportGuide = {
  pack: "GENERIC",
  pitch: "Ask the business for customer, billing or job exports — each becomes live CUE records.",
  items: [
    {
      ask: "Customer list with contact info",
      where: "CRM or invoicing tool → export customers (name, phone, email, address)",
      columns: "name, phone, email, address",
      kindParam: "CUSTOMERS",
      becomes: "Customers",
    },
    {
      ask: "Job or service history",
      where: "Scheduling/tool exports → export completed jobs (description, customer, dates, total)",
      columns: "job title, customer, status, amount, dates",
      kindParam: "SERVICE_ORDERS",
      becomes: "Service orders",
    },
    {
      ask: "Invoices or receivables",
      where: "Billing tool → export invoices (number, customer, amount, status)",
      columns: "invoice number, customer, amount, status",
      kindParam: "INVOICES",
      becomes: "Invoices",
    },
    {
      ask: "Vehicles / assets (dealership-style)",
      where: "Inventory exports (stock#, year, make, model, price) — usable for any vehicle or equipment inventory",
      columns: "stock, year, make, model, price",
      kindParam: "VEHICLES",
      becomes: "Vehicles",
    },
  ],
};

export function importGuideForPack(pack: string | null | undefined): ImportGuide {
  if (pack === "HOME_SERVICES") return HVAC;
  if (pack === "AUTO_DEALERSHIP") return DEALERSHIP;
  return GENERIC;
}

/** Copy-send request script — the owner forwards this to the source business. */
export function requestScriptText(guide: ImportGuide, businessName: string): string {
  const asks = guide.items
    .map((i, n) => `${n + 1}. ${i.ask} — export from ${i.where} (${i.columns ? `columns like ${i.columns}` : "standard columns"})`)
    .join("\n");
  return (
    `Hi — we're switching to CUE as our business operating system. To bring your history over, could you export these reports and send them back?\n\n` +
    asks +
    `\n\nCSV is ideal (in Excel: File → Save As → CSV). Nothing else is needed — import takes minutes and everything stays private to our workspace.` +
    (businessName.trim() ? `\n\nThanks!\n${businessName.trim()}` : `\n\nThanks!`)
  );
}
