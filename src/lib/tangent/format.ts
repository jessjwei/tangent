export function formatStamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addMark(
  marks: { start: number; end: number }[],
  start: number,
  end: number,
): { start: number; end: number }[] {
  if (end <= start) return marks;
  const sorted = [...marks, { start, end }].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const mark of sorted) {
    const last = merged[merged.length - 1];
    if (!last || mark.start > last.end) merged.push({ start: mark.start, end: mark.end });
    else last.end = Math.max(last.end, mark.end);
  }
  return merged;
}
