export type FlagId = "yale" | "crimson" | "forest" | "gold" | "ink";

export type Course = {
  id: string;
  name: string;
  flag: FlagId;
  createdAt: number;
};

export type Lecture = {
  id: string;
  classId: string;
  name: string;
  createdAt: number;
  pdfName?: string;
  slideCount: number;
  slideTexts: string[];
  slideSummaries: string[];
  currentSlide: number;
};

export type NoteMark = { start: number; end: number };

export type Note = {
  id: string;
  lectureId: string;
  slideIndex: number;
  timestampMs: number;
  text: string;
  highlighted: boolean;
  exam: boolean;
  marks: NoteMark[];
  createdAt: number;
};

export type TranscriptLine = {
  id: string;
  lectureId: string;
  text: string;
  atMs: number;
};

export type MatchLog = {
  id: string;
  lectureId: string;
  atMs: number;
  fromSlide: number;
  toSlide: number;
  confidence: number;
  reason: string;
  accepted: boolean;
  transcriptSnippet: string;
  source: "local" | "ai";
};

export type Truth = "correct" | "early" | "late" | "wrong";

export type RehearsalMark = {
  lectureId: string;
  slideIndex: number;
  truth: Truth;
  atMs: number;
};

export type MatchSettings = {
  minConfidence: number;
  hysteresis: number;
  consecutiveHits: number;
  windowSlides: number;
  aiAssist: boolean;
};

export const DEFAULT_SETTINGS: MatchSettings = {
  minConfidence: 0.22,
  hysteresis: 0.06,
  consecutiveHits: 2,
  windowSlides: 5,
  aiAssist: false,
};

export const FLAG_ORDER: readonly FlagId[] = ["yale", "crimson", "forest", "gold", "ink"];

export const FLAG_LABEL: Record<FlagId, string> = {
  yale: "Yale blue",
  crimson: "Crimson",
  forest: "Forest",
  gold: "Gold",
  ink: "Ink",
};

export const FLAG_CLASS: Record<FlagId, string> = {
  yale: "tone-yale",
  crimson: "tone-crimson",
  forest: "tone-forest",
  gold: "tone-gold",
  ink: "tone-ink",
};
