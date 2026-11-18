import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { describeSlides, matchTranscript } from "@/lib/tangent/ai.functions";
import { decideMatch, tokenize, type MatchDecision, type Streak } from "@/lib/tangent/matching";
import type { SampleStep } from "@/lib/tangent/sample";
import { useTangent } from "@/lib/tangent/store";

type SpeechResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
};

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function speechCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const host = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

async function shrink(dataUrl: string): Promise<string> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not read the slide image"));
    image.src = dataUrl;
  });
  const width = 480;
  const height = Math.max(1, Math.round((image.height * width) / Math.max(image.width, 1)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.62);
}

export function useLectureEngine(slides: readonly string[]) {
  const lectureId = useTangent((state) => state.activeLectureId);
  const settings = useTangent((state) => state.settings);
  const addTranscript = useTangent((state) => state.addTranscript);
  const addLog = useTangent((state) => state.addLog);
  const setSlide = useTangent((state) => state.setSlide);
  const setSummary = useTangent((state) => state.setSummary);
  const current = useTangent((state) => {
    const lecture = state.lectures.find((item) => item.id === state.activeLectureId);
    return lecture?.currentSlide ?? 0;
  });

  const [listening, setListening] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [lastDecision, setLastDecision] = useState<MatchDecision | null>(null);
  const [indexing, setIndexing] = useState(false);

  const listeningRef = useRef(false);
  const lectureRef = useRef(lectureId);
  const slidesRef = useRef(slides);
  const settingsRef = useRef(settings);
  const currentRef = useRef(current);
  const streakRef = useRef<Streak>({ slide: 0, hits: 0 });
  const baseRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const lastLineRef = useRef({ text: "", at: 0 });
  const aiCalls = useRef(0);
  const lastAiAt = useRef(0);
  const ticket = useRef(0);
  const simToken = useRef(0);

  useEffect(() => {
    lectureRef.current = lectureId;
  }, [lectureId]);
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  function clock(): number {
    const running = startRef.current ? Date.now() - startRef.current : 0;
    return baseRef.current + running;
  }

  function stopRec() {
    listeningRef.current = false;
    simToken.current += 1;
    recRef.current?.stop();
    recRef.current = null;
    if (startRef.current) {
      baseRef.current += Date.now() - startRef.current;
      startRef.current = null;
    }
    setListening(false);
    setSimulating(false);
    setInterim("");
    setElapsed(baseRef.current);
  }

  useEffect(() => {
    stopRec();
    baseRef.current = 0;
    startRef.current = null;
    setElapsed(0);
    streakRef.current = { slide: 0, hits: 0 };
    aiCalls.current = 0;
    setLastDecision(null);
    setInterim("");
    // Reset the clock when the open lecture changes. stopRec is stable enough for this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId]);

  useEffect(() => {
    if (!listening) return;
    const id = window.setInterval(() => setElapsed(clock()), 250);
    return () => window.clearInterval(id);
  }, [listening]);

  useEffect(() => () => stopRec(), []);

  function beginClock() {
    if (!startRef.current) startRef.current = Date.now();
    setListening(true);
    listeningRef.current = true;
  }

  function recentText(): string {
    const lines = useTangent
      .getState()
      .transcripts.filter((line) => line.lectureId === lectureRef.current);
    return lines
      .slice(-2)
      .map((line) => line.text)
      .join(" ");
  }

  function logDecision(decision: MatchDecision, atMs: number, snippet: string, source: "local" | "ai") {
    addLog({
      lectureId: lectureRef.current,
      atMs,
      fromSlide: currentRef.current,
      toSlide: decision.jumped ? decision.slide : decision.proposed,
      confidence: decision.confidence,
      reason: decision.reason,
      accepted: decision.accepted,
      transcriptSnippet: snippet.slice(0, 240),
      source,
    });
  }

  function applyLocal(text: string) {
    const deck = slidesRef.current;
    if (deck.length === 0 || tokenize(text).length < 3) return;
    const decision = decideMatch({
      current: currentRef.current,
      slideCount: deck.length,
      recentText: text,
      slides: deck,
      settings: settingsRef.current,
      streak: streakRef.current,
    });
    streakRef.current = decision.streak;
    setLastDecision(decision);
    logDecision(decision, clock(), text, "local");
    if (decision.jumped) {
      currentRef.current = decision.slide;
      setSlide(decision.slide);
      return;
    }
    if (settingsRef.current.aiAssist) void maybeAi(text);
  }

  function onFinal(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean || !listeningRef.current) return;
    const now = Date.now();
    if (clean === lastLineRef.current.text && now - lastLineRef.current.at < 1200) return;
    lastLineRef.current = { text: clean, at: now };
    addTranscript({ lectureId: lectureRef.current, text: clean, atMs: clock() });
    applyLocal(recentText());
  }

  async function maybeAi(recent: string) {
    const now = Date.now();
    if (aiCalls.current >= 8 || now - lastAiAt.current < 20_000) return;
    const deck = slidesRef.current;
    const currentSlide = currentRef.current;
    const windowSize = settingsRef.current.windowSlides;
    const start = Math.max(0, currentSlide - 1);
    const end = Math.min(deck.length - 1, currentSlide + windowSize);
    const payload = [];
    for (let index = start; index <= end; index += 1) {
      payload.push({ index, text: deck[index] ?? "" });
    }
    if (payload.length === 0) return;
    aiCalls.current += 1;
    lastAiAt.current = now;
    const mine = ++ticket.current;
    const lecture = lectureRef.current;
    const result = await matchTranscript({ data: { current: currentSlide, recent: recent.slice(0, 1400), slides: payload } });
    if (mine !== ticket.current || lecture !== lectureRef.current || !listeningRef.current) return;
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.confidence < 0.7 || result.data.slide === currentRef.current) return;
    if (result.data.slide < currentRef.current - 1) return;
    const at = clock();
    addLog({
      lectureId: lecture,
      atMs: at,
      fromSlide: currentRef.current,
      toSlide: result.data.slide,
      confidence: result.data.confidence,
      reason: result.data.reason,
      accepted: true,
      transcriptSnippet: recent.slice(0, 240),
      source: "ai",
    });
    currentRef.current = result.data.slide;
    streakRef.current = { slide: result.data.slide, hits: 0 };
    setSlide(result.data.slide);
    setLastDecision({
      slide: result.data.slide,
      proposed: result.data.slide,
      confidence: result.data.confidence,
      reason: result.data.reason,
      accepted: true,
      jumped: true,
      scores: [],
      streak: streakRef.current,
    });
  }

  function startListening() {
    if (listeningRef.current) return;
    const Ctor = speechCtor();
    if (!Ctor) {
      toast("This browser cannot hear the room. Simulate the lecture instead.");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        const said = result[0].transcript;
        if (result.isFinal) onFinal(said);
        else pending += said;
      }
      setInterim(pending.trim());
    };
    rec.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      listeningRef.current = false;
      if (event.error === "not-allowed") {
        toast.error("Microphone blocked. Allow it, or simulate the lecture.");
      } else {
        toast.error("Listening stopped.");
      }
      stopRec();
    };
    rec.onend = () => {
      if (!listeningRef.current || recRef.current !== rec) return;
      try {
        rec.start();
      } catch {
        stopRec();
      }
    };
    try {
      rec.start();
    } catch {
      toast.error("Could not start listening.");
      return;
    }
    recRef.current = rec;
    beginClock();
  }

  function endLecture() {
    ticket.current += 1;
    stopRec();
  }

  async function simulate(script?: readonly SampleStep[]) {
    if (listeningRef.current) stopRec();
    const deck = slidesRef.current;
    const steps: SampleStep[] =
      script && script.length > 0
        ? [...script]
        : deck.flatMap((text, index) => {
            const sentences = text
              .split(/(?<=[.?!])\s+/)
              .map((line) => line.trim())
              .filter((line) => line.length > 12)
              .slice(0, 2);
            if (sentences.length === 0) return [{ slide: index, line: `Moving on to the idea on slide ${index + 1}.` }];
            return sentences.map((line) => ({ slide: index, line }));
          });
    if (steps.length === 0) {
      toast("Add slides before simulating a lecture.");
      return;
    }
    const token = ++simToken.current;
    beginClock();
    setSimulating(true);
    for (const step of steps) {
      await new Promise((resolve) => window.setTimeout(resolve, 1600));
      if (simToken.current !== token || !listeningRef.current) return;
      onFinal(step.line);
    }
    if (simToken.current === token) {
      stopRec();
      toast("Simulation finished. Mark any jump that felt early, late, or wrong.");
    }
  }

  async function indexWithGrok(images: readonly string[]) {
    if (indexing) return;
    const pairs = images
      .map((image, index) => ({ index, image }))
      .filter((item) => item.image.startsWith("data:image/"))
      .slice(0, 4);
    if (pairs.length === 0) {
      toast("Upload slides before asking Grok to read them.");
      return;
    }
    setIndexing(true);
    try {
      const slidesPayload = [];
      for (const pair of pairs) {
        slidesPayload.push({ index: pair.index, imageDataUrl: await shrink(pair.image) });
      }
      const result = await describeSlides({ data: { slides: slidesPayload } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const lecture = lectureRef.current;
      for (const slide of result.data) setSummary(lecture, slide.index, slide.summary);
      toast.success(`Grok described ${result.data.length} slide${result.data.length === 1 ? "" : "s"}.`);
    } catch {
      toast.error("Could not index those slides.");
    } finally {
      setIndexing(false);
    }
  }

  return {
    listening,
    simulating,
    interim,
    elapsed,
    lastDecision,
    indexing,
    startListening,
    endLecture,
    simulate,
    indexWithGrok,
  };
}
