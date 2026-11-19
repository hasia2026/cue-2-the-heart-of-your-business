// Shared arrival-window copy for server messages and client cards.
export function arrivalWindowDuration(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${minutes} minutes`;
}

export function arrivalWindowShort(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}

/** Full localized sentence for confirmations and the customer link. */
export function arrivalWindowLabel(locale: string, minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    if (locale === "es") return `Ventana de llegada: ${hours} ${hours === 1 ? "hora" : "horas"}.`;
    if (locale === "vi") return `Khung giờ đến: ${hours} giờ.`;
    if (locale === "ar") return `نافذة الوصول: ${hours} ساعة.`;
    return `Arrival window: ${hours} ${hours === 1 ? "hour" : "hours"}.`;
  }
  if (locale === "es") return `Ventana de llegada: ${minutes} minutos.`;
  if (locale === "vi") return `Khung giờ đến: ${minutes} phút.`;
  if (locale === "ar") return `نافذة الوصول: ${minutes} دقيقة.`;
  return `Arrival window: ${minutes} minutes.`;
}
