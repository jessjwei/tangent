import type { MatchSettings } from "./types.ts";

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was",
  "were", "this", "that", "it", "we", "you", "with", "as", "at", "be", "by", "from",
  "our", "your", "their", "will", "can", "if", "not", "but", "so", "do", "did", "has",
  "have", "just", "about", "into", "than", "then", "there", "here", "what", "when",
  "how", "which", "who", "its", "let", "lets", "today", "going", "really", "very",
  "they", "them", "his", "her", "she", "him", "out", "all", "any", "been", "being",
]);

export type Streak = { slide: number; hits: number };

export type ScoreRow = { index: number; score: number };

export type MatchDecision = {
  slide: number;
  proposed: number;
  confidence: number;
  reason: string;
  accepted: boolean;
  jumped: boolean;
  scores: ScoreRow[];
  streak: Streak;
};

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

export function overlapScore(recent: readonly string[], slideText: string): number {
  const docTokens = tokenize(slideText);
  if (docTokens.length === 0 || recent.length === 0) return 0;
  const doc = new Set(docTokens);
  const speech = new Set(recent);
  let hit = 0;
  for (const word of speech) if (doc.has(word)) hit += 1;
  if (hit === 0) return 0;
  const speechCov = hit / speech.size;
  const docCov = hit / doc.size;
  return speechCov * 0.72 + Math.min(1, docCov * 1.4) * 0.28;
}

function candidateIndexes(current: number, count: number, windowSlides: number): number[] {
  const safeCurrent = Math.max(0, Math.min(current, count - 1));
  const forward = Math.max(1, windowSlides);
  const end = Math.min(count - 1, safeCurrent + forward);
  const start = Math.max(0, safeCurrent - 1);
  const indexes: number[] = [safeCurrent];
  for (let index = safeCurrent + 1; index <= end; index += 1) indexes.push(index);
  for (let index = safeCurrent - 1; index >= start; index -= 1) indexes.push(index);
  return indexes;
}

function adjust(raw: number, index: number, current: number): number {
  const distance = index - current;
  if (distance === 0) return raw + 0.045;
  if (distance > 0) return raw + 0.03 / distance;
  return raw - 0.04;
}

function decision(partial: Omit<MatchDecision, "scores"> & { scores?: ScoreRow[] }): MatchDecision {
  return { scores: partial.scores ?? [], ...partial };
}

export function decideMatch(input: {
  current: number;
  slideCount: number;
  recentText: string;
  slides: readonly string[];
  settings: MatchSettings;
  streak: Streak;
}): MatchDecision {
  const current = Math.max(0, input.current);
  const count = input.slideCount;
  const recent = tokenize(input.recentText).slice(-70);
  if (count <= 0 || recent.length < 3) {
    return decision({
      slide: current,
      proposed: current,
      confidence: 0,
      reason: "Waiting for more speech.",
      accepted: false,
      jumped: false,
      streak: input.streak,
    });
  }

  const rows = candidateIndexes(current, count, input.settings.windowSlides).map((index) => {
    const raw = overlapScore(recent, input.slides[index] ?? "");
    return { index, score: raw, adjusted: adjust(raw, index, current) };
  });
  rows.sort((a, b) => {
    const delta = b.adjusted - a.adjusted;
    if (Math.abs(delta) > 0.0001) return delta;
    if (a.index === current) return -1;
    if (b.index === current) return 1;
    return a.index - b.index;
  });

  const scores = rows.map((row) => ({ index: row.index, score: row.score }));
  const best = rows[0];
  const currentRow = rows.find((row) => row.index === current) ?? {
    index: current,
    score: 0,
    adjusted: adjust(0, current, current),
  };
  if (!best || best.index === current) {
    return decision({
      slide: current,
      proposed: current,
      confidence: currentRow.score,
      reason: "Staying — this slide still fits the lecture.",
      accepted: true,
      jumped: false,
      scores,
      streak: { slide: current, hits: 0 },
    });
  }

  if (best.score < input.settings.minConfidence) {
    return decision({
      slide: current,
      proposed: best.index,
      confidence: best.score,
      reason: "Below the confidence bar, so tracking stays put.",
      accepted: false,
      jumped: false,
      scores,
      streak: { slide: current, hits: 0 },
    });
  }

  if (best.adjusted < currentRow.adjusted + input.settings.hysteresis) {
    return decision({
      slide: current,
      proposed: best.index,
      confidence: best.score,
      reason: "Hysteresis — the next slide is not clearly ahead.",
      accepted: false,
      jumped: false,
      scores,
      streak: { slide: current, hits: 0 },
    });
  }

  const hits = input.streak.slide === best.index ? input.streak.hits + 1 : 1;
  const need = Math.max(1, input.settings.consecutiveHits);
  if (hits < need) {
    return decision({
      slide: current,
      proposed: best.index,
      confidence: best.score,
      reason: `Confirming slide ${best.index + 1} (${hits}/${need}).`,
      accepted: false,
      jumped: false,
      scores,
      streak: { slide: best.index, hits },
    });
  }

  return decision({
    slide: best.index,
    proposed: best.index,
    confidence: best.score,
    reason: `Speech moved to slide ${best.index + 1}.`,
    accepted: true,
    jumped: true,
    scores,
    streak: { slide: best.index, hits: 0 },
  });
}

export function matchMetrics(logs: readonly { accepted: boolean; fromSlide: number; toSlide: number; confidence: number }[]) {
  const checks = logs.length;
  const jumps = logs.filter((log) => log.accepted && log.fromSlide !== log.toSlide).length;
  const rejected = logs.filter((log) => !log.accepted).length;
  const avg = checks === 0 ? 0 : logs.reduce((sum, log) => sum + log.confidence, 0) / checks;
  return { checks, jumps, rejected, avg };
}
