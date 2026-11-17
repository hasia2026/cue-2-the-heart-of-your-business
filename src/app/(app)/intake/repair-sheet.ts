// Mock repair order for the independent-shop intake exercise. Plain module so
// both the client (rendering the sheet) and the server action (grading) can
// import the same numbers.
export const REPAIR_SHEET = {
  sheetId: "RO-2026-4417",
  ro: "4417",
  customer: "Alvarez",
  vehicle: "2016 Honda Accord EX-L",
  mileage: 132480,
  concern: "Brake pedal pulsates at highway speed; grinding from the front.",
  parts: 268,
  laborHours: 3.5,
  quoted: 742,
} as const;
