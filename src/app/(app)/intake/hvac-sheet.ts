// The mock install work order for the home-services intake exercise. Same
// contract as mock-sheet.ts: the client renders these values as the "source
// export", the server action grades the transcription against them.
export const HVAC_SHEET = {
  sheetId: "WO-2026-318",
  job: "SC-8842",
  customer: "Nguyen Residence",
  site: "4422 Cedar Ave, Riverside",
  system: "Carrier 3-ton heat pump + 80k BTU furnace",
  equipment: 4900, // condenser + coil + furnace
  laborHours: 6, // install crew of two, at $145/hr
  permit: 275, // permit + haul-away
  quoted: 8450, // equipment + labor + permit + overhead & margin
  overhead: 2405,
} as const;
