export function serializeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function numericToNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}
