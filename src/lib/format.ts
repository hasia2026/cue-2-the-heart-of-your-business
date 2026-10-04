export function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function moneyExact(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

export function dateShort(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function daysAgo(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

export function agoLabel(d: Date | string | null | undefined): string {
  const days = daysAgo(d);
  if (days === null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export function inDaysLabel(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const diff = Math.ceil(
    (new Date(d).getTime() - Date.now()) / 86_400_000
  );
  if (diff < 0) return `${Math.abs(diff)} days overdue`;
  if (diff === 0) return "due today";
  return `in ${diff} days`;
}
