// The mock lot sheet fixture for the intake exercise. Plain module (not
// "use server" — those files may only export async functions); the client
// needs these values to render the sheet, the server actions.ts needs them
// to grade answers. Same numbers for every org.
export const MOCK_SHEET = {
  sheetId: "LS-2026-114",
  stock: "MT-7721",
  year: 2021,
  make: "Ford",
  model: "F-150",
  trim: "XLT SuperCrew",
  odometer: 74380,
  allowance: 31200, // trade-in allowance = what becomes the unit's cost
  recon: 1860, // reconditioning estimate on the sheet
  listPrice: 36900, // recommended target list
} as const;
