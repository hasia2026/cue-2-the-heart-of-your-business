// Label key manifests for client components that receive server-translated
// labels as props (avoids an English flash before hydration).
import type { DictKey } from "./i18n";

export const PRICING_LABEL_KEYS: DictKey[] = [
  "pricing.title", "pricing.subtitle", "pricing.defaultFor",
  "pricing.tabJob", "pricing.tabVehicle", "pricing.tabProduct",
  "pricing.pickVehicle", "pricing.pickManual", "pricing.vehicleCost", "pricing.recon",
  "pricing.daysOnLot", "pricing.targetMargin", "pricing.marketAdj", "pricing.marketHint",
  "pricing.laborHours", "pricing.laborRate", "pricing.parts", "pricing.fees", "pricing.overhead",
  "pricing.unitCost", "pricing.timeMin", "pricing.staffRate",
  "pricing.suggest", "pricing.floor", "pricing.gross", "pricing.effRate", "pricing.why",
  "pricing.whyBase", "pricing.whyOverhead", "pricing.whyMargin", "pricing.whyMarket",
  "pricing.whyAging", "pricing.whyNoAging", "pricing.whyFloor",
  "pricing.capture", "pricing.captured", "pricing.invLoaded",
  "capture.processing", "capture.failed",
  "pitch.indAuto", "pitch.indService", "pitch.indSalon", "pitch.indOther",
];

export const ACADEMY_LABEL_KEYS: DictKey[] = [
  "training.title", "training.subtitle", "training.progress", "training.markDone", "training.done",
  "training.auto.title", "training.auto.desc",
  "training.auto.l1t", "training.auto.l1b", "training.auto.l2t", "training.auto.l2b", "training.auto.l3t", "training.auto.l3b",
  "training.service.title", "training.service.desc",
  "training.service.l1t", "training.service.l1b", "training.service.l2t", "training.service.l2b", "training.service.l3t", "training.service.l3b",
  "training.salon.title", "training.salon.desc",
  "training.salon.l1t", "training.salon.l1b", "training.salon.l2t", "training.salon.l2b", "training.salon.l3t", "training.salon.l3b",
  "pitch.title", "pitch.subtitle", "pitch.generate", "pitch.copy", "pitch.copied", "pitch.capture", "pitch.saved",
  "pitch.opening", "pitch.autoClose", "pitch.serviceClose", "pitch.salonClose", "pitch.genericClose",
  "pitch.indAuto", "pitch.indService", "pitch.indSalon", "pitch.indOther",
  "capture.failed",
];

export const LIBRARY_LABEL_KEYS: DictKey[] = [
  "training.library", "training.librarySub", "training.addModule",
  "training.modTitle", "training.modCategory", "training.videoUrl", "training.lessonText",
  "training.quizQ", "training.quizPh", "training.choicesPh", "training.import",
  "training.passed", "training.avgScore", "training.attempts", "training.watch",
  "training.submit", "training.yourScore", "training.noModules",
  "training.teamProgress", "training.thEmployee", "training.thAttempts", "training.thAvg", "training.thLast", "training.noAttempts",
];

export function buildLabels(keys: DictKey[], t: (k: DictKey) => string): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, t(k)]));
}
