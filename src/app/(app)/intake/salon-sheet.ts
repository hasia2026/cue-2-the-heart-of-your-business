// Mock service ticket for the salon intake exercise. Plain module so the
// client (rendering the sheet) and the server action (grading) share numbers.
export const SALON_SHEET = {
  sheetId: "ST-2026-2291",
  ticket: "2291",
  client: "Chị Lan",
  service: "Gel manicure + nail art",
  servicePrice: 68,
  retailName: "Solar Oil",
  retailPrice: 12,
  rebookWeeks: 3,
  total: 80,
} as const;
