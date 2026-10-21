import type { Cell } from "./ShiftGrid";

export const SHIFTS: Cell["shift"][] = ["AM", "PM", "DOUBLE", "OFF"];

/** Cycle used by the shift grid to step a cell AM → PM → DBL → Off. */
export function nextShift(s: Cell["shift"]): Cell["shift"] {
  return SHIFTS[(SHIFTS.indexOf(s) + 1) % SHIFTS.length];
}
