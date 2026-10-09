export interface ColomboWindow {
  date: string;
  start: Date;
  end: Date;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

export function colomboDayWindow(
  dateValue?: string,
  now = new Date(),
): ColomboWindow {
  const date = dateValue ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (!isCalendarDate(date)) {
    throw new RangeError("date must be a real YYYY-MM-DD calendar date");
  }
  const start = new Date(`${date}T00:00:00+05:30`);
  return { date, start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
