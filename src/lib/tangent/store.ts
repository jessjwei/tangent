import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { uid } from "@/lib/tangent/format";
import {
  DEFAULT_SETTINGS,
  FLAG_ORDER,
  type Course,
  type FlagId,
  type Lecture,
  type MatchLog,
  type MatchSettings,
  type Note,
  type NoteMark,
  type RehearsalMark,
  type TranscriptLine,
  type Truth,
} from "@/lib/tangent/types";

type Notebook = {
  classes: Course[];
  lectures: Lecture[];
  notes: Note[];
  transcripts: TranscriptLine[];
  logs: MatchLog[];
  rehearsal: RehearsalMark[];
  settings: MatchSettings;
  activeClassId: string;
  activeLectureId: string;
  undo: Note | null;
};

type Actions = {
  repair: () => void;
  createClass: () => string;
  renameClass: (id: string, name: string) => void;
  cycleFlag: (id: string) => void;
  deleteClass: (id: string) => string[];
  selectClass: (id: string) => void;
  createLecture: () => string;
  renameLecture: (id: string, name: string) => void;
  selectLecture: (id: string) => void;
  setSlide: (index: number) => void;
  attachSlides: (lectureId: string, pdfName: string, texts: string[]) => void;
  setSummary: (lectureId: string, index: number, summary: string) => void;
  addNote: (text: string, timestampMs: number) => void;
  updateNote: (
    id: string,
    patch: Partial<Pick<Note, "text" | "highlighted" | "exam" | "marks">>,
  ) => void;
  deleteNote: (id: string) => void;
  undoDelete: () => void;
  addTranscript: (line: { lectureId: string; text: string; atMs: number }) => void;
  addLog: (line: Omit<MatchLog, "id">) => void;
  setTruth: (lectureId: string, slideIndex: number, truth: Truth, atMs: number) => void;
  updateSettings: (patch: Partial<MatchSettings>) => void;
};

export type TangentState = Notebook & Actions;

const memory = new Map<string, string>();
const fallbackStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
};

function blankLecture(classId: string, name: string): Lecture {
  return {
    id: uid(),
    classId,
    name,
    createdAt: Date.now(),
    slideCount: 0,
    slideTexts: [],
    slideSummaries: [],
    currentSlide: 0,
  };
}

function blankClass(name: string, flag: FlagId = "yale"): Course {
  return { id: uid(), name, flag, createdAt: Date.now() };
}

function seed(): Notebook {
  const course: Course = {
    id: "class-default",
    name: "My class",
    flag: "yale",
    createdAt: 0,
  };
  const lecture: Lecture = {
    id: "lecture-default",
    classId: course.id,
    name: "New lecture",
    createdAt: 0,
    slideCount: 0,
    slideTexts: [],
    slideSummaries: [],
    currentSlide: 0,
  };
  return {
    classes: [course],
    lectures: [lecture],
    notes: [],
    transcripts: [],
    logs: [],
    rehearsal: [],
    settings: DEFAULT_SETTINGS,
    activeClassId: course.id,
    activeLectureId: lecture.id,
    undo: null,
  };
}

function capByLecture<T extends { lectureId: string }>(items: T[], lectureId: string, limit: number): T[] {
  const mine = items.filter((item) => item.lectureId === lectureId);
  const others = items.filter((item) => item.lectureId !== lectureId);
  return [...others, ...mine.slice(-limit)];
}

function dropLectures(state: Notebook, removed: Set<string>): Pick<Notebook, "notes" | "transcripts" | "logs" | "rehearsal"> {
  return {
    notes: state.notes.filter((note) => !removed.has(note.lectureId)),
    transcripts: state.transcripts.filter((line) => !removed.has(line.lectureId)),
    logs: state.logs.filter((log) => !removed.has(log.lectureId)),
    rehearsal: state.rehearsal.filter((mark) => !removed.has(mark.lectureId)),
  };
}

export const useTangent = create<TangentState>()(
  persist(
    (set, get) => ({
      ...seed(),
      repair: () =>
        set((state) => {
          let classes = state.classes.filter((course) => course.name.trim());
          if (classes.length === 0) return { ...seed(), undo: null };
          let lectures = state.lectures.filter((lecture) =>
            classes.some((course) => course.id === lecture.classId),
          );
          const missing = classes.filter((course) => !lectures.some((lecture) => lecture.classId === course.id));
          if (missing.length > 0) {
            lectures = [...lectures, ...missing.map((course) => blankLecture(course.id, "Lecture 1"))];
          }
          const activeClass = classes.some((course) => course.id === state.activeClassId)
            ? state.activeClassId
            : classes[0]!.id;
          const inClass = lectures.filter((lecture) => lecture.classId === activeClass);
          const activeLecture = inClass.some((lecture) => lecture.id === state.activeLectureId)
            ? state.activeLectureId
            : inClass[0]!.id;
          return { classes, lectures, activeClassId: activeClass, activeLectureId: activeLecture };
        }),
      createClass: () => {
        const state = get();
        const flag = FLAG_ORDER[state.classes.length % FLAG_ORDER.length] ?? "yale";
        const course = blankClass("New class", flag);
        const lecture = blankLecture(course.id, "New lecture");
        set((state) => ({
          classes: [...state.classes, course],
          lectures: [...state.lectures, lecture],
          activeClassId: course.id,
          activeLectureId: lecture.id,
        }));
        return course.id;
      },
      renameClass: (id, name) =>
        set((state) => ({
          classes: state.classes.map((course) =>
            course.id === id ? { ...course, name: name.trim() || course.name } : course,
          ),
        })),
      cycleFlag: (id) =>
        set((state) => ({
          classes: state.classes.map((course) => {
            if (course.id !== id) return course;
            const order: FlagId[] = ["yale", "crimson", "forest", "gold", "ink"];
            const index = order.indexOf(course.flag);
            const next = order[(index + 1) % order.length] ?? "yale";
            return { ...course, flag: next };
          }),
        })),
      deleteClass: (id) => {
        const state = get();
        const removedLectures = state.lectures.filter((lecture) => lecture.classId === id).map((lecture) => lecture.id);
        const removed = new Set(removedLectures);
        const remaining = state.classes.filter((course) => course.id !== id);
        if (remaining.length === 0) {
          const course = blankClass("My class");
          const lecture = blankLecture(course.id, "New lecture");
          set({
            classes: [course],
            lectures: [lecture],
            notes: [],
            transcripts: [],
            logs: [],
            rehearsal: [],
            activeClassId: course.id,
            activeLectureId: lecture.id,
            undo: null,
            settings: state.settings,
          });
          return removedLectures;
        }
        const index = state.classes.findIndex((course) => course.id === id);
        const neighbor = remaining[Math.min(Math.max(index, 0), remaining.length - 1)]!;
        let lectures = state.lectures.filter((lecture) => lecture.classId !== id);
        const neighborLectures = lectures.filter((lecture) => lecture.classId === neighbor.id);
        let activeLectureId = state.activeLectureId;
        const deletingActive = state.activeClassId === id;
        if (deletingActive || removed.has(activeLectureId)) {
          if (neighborLectures.length === 0) {
            const lecture = blankLecture(neighbor.id, "Lecture 1");
            lectures = [...lectures, lecture];
            activeLectureId = lecture.id;
          } else {
            const latest = [...neighborLectures].sort((a, b) => b.createdAt - a.createdAt)[0]!;
            activeLectureId = latest.id;
          }
        }
        set({
          classes: remaining,
          lectures,
          activeClassId: deletingActive ? neighbor.id : state.activeClassId,
          activeLectureId,
          undo: null,
          ...dropLectures(state, removed),
        });
        return removedLectures;
      },
      selectClass: (id) =>
        set((state) => {
          const lectures = state.lectures.filter((lecture) => lecture.classId === id);
          if (lectures.length === 0) {
            const lecture = blankLecture(id, "Lecture 1");
            return {
              activeClassId: id,
              activeLectureId: lecture.id,
              lectures: [...state.lectures, lecture],
            };
          }
          const latest = [...lectures].sort((a, b) => b.createdAt - a.createdAt)[0]!;
          return { activeClassId: id, activeLectureId: latest.id };
        }),
      createLecture: () => {
        const state = get();
        const lecture = blankLecture(state.activeClassId, `Lecture ${state.lectures.filter((item) => item.classId === state.activeClassId).length + 1}`);
        set({ lectures: [...state.lectures, lecture], activeLectureId: lecture.id });
        return lecture.id;
      },
      renameLecture: (id, name) =>
        set((state) => ({
          lectures: state.lectures.map((lecture) =>
            lecture.id === id ? { ...lecture, name: name.trim() || lecture.name } : lecture,
          ),
        })),
      selectLecture: (id) => set({ activeLectureId: id }),
      setSlide: (index) =>
        set((state) => ({
          lectures: state.lectures.map((lecture) => {
            if (lecture.id !== state.activeLectureId) return lecture;
            const max = Math.max(0, lecture.slideCount - 1);
            const next = lecture.slideCount === 0 ? 0 : Math.max(0, Math.min(max, index));
            return { ...lecture, currentSlide: next };
          }),
        })),
      attachSlides: (lectureId, pdfName, texts) =>
        set((state) => ({
          lectures: state.lectures.map((lecture) =>
            lecture.id === lectureId
              ? {
                  ...lecture,
                  pdfName,
                  slideCount: texts.length,
                  slideTexts: texts,
                  slideSummaries: texts.map(() => ""),
                  currentSlide: 0,
                }
              : lecture,
          ),
        })),
      setSummary: (lectureId, index, summary) =>
        set((state) => ({
          lectures: state.lectures.map((lecture) => {
            if (lecture.id !== lectureId) return lecture;
            const slideSummaries = lecture.slideSummaries.map((existing, item) =>
              item === index ? summary : existing,
            );
            return { ...lecture, slideSummaries };
          }),
        })),
      addNote: (text, timestampMs) =>
        set((state) => {
          const lecture = state.lectures.find((item) => item.id === state.activeLectureId);
          if (!lecture) return state;
          const trimmed = text.trim();
          if (!trimmed) return state;
          const note: Note = {
            id: uid(),
            lectureId: lecture.id,
            slideIndex: lecture.currentSlide,
            timestampMs,
            text: trimmed,
            highlighted: false,
            exam: false,
            marks: [],
            createdAt: Date.now(),
          };
          return { notes: [...state.notes, note] };
        }),
      updateNote: (id, patch) =>
        set((state) => ({
          notes: state.notes.map((note) => {
            if (note.id !== id) return note;
            const next: Note = { ...note };
            if (patch.text !== undefined) next.text = patch.text;
            if (patch.highlighted !== undefined) next.highlighted = patch.highlighted;
            if (patch.exam !== undefined) next.exam = patch.exam;
            if (patch.marks !== undefined) next.marks = patch.marks;
            return next;
          }),
        })),
      deleteNote: (id) =>
        set((state) => {
          const note = state.notes.find((item) => item.id === id);
          if (!note) return state;
          return { notes: state.notes.filter((item) => item.id !== id), undo: note };
        }),
      undoDelete: () =>
        set((state) => {
          if (!state.undo) return state;
          return { notes: [...state.notes, state.undo], undo: null };
        }),
      addTranscript: (line) =>
        set((state) => {
          const text = line.text.trim();
          if (!text) return state;
          const entry: TranscriptLine = { id: uid(), lectureId: line.lectureId, text, atMs: line.atMs };
          return { transcripts: capByLecture([...state.transcripts, entry], line.lectureId, 400) };
        }),
      addLog: (line) =>
        set((state) => {
          const entry: MatchLog = { ...line, id: uid() };
          return { logs: capByLecture([...state.logs, entry], line.lectureId, 180) };
        }),
      setTruth: (lectureId, slideIndex, truth, atMs) =>
        set((state) => {
          const rest = state.rehearsal.filter(
            (mark) => !(mark.lectureId === lectureId && mark.slideIndex === slideIndex),
          );
          const mark: RehearsalMark = { lectureId, slideIndex, truth, atMs };
          return { rehearsal: [...rest, mark] };
        }),
      updateSettings: (patch) =>
        set((state) => {
          const settings: MatchSettings = { ...state.settings };
          if (patch.minConfidence !== undefined) settings.minConfidence = patch.minConfidence;
          if (patch.hysteresis !== undefined) settings.hysteresis = patch.hysteresis;
          if (patch.consecutiveHits !== undefined) settings.consecutiveHits = patch.consecutiveHits;
          if (patch.windowSlides !== undefined) settings.windowSlides = patch.windowSlides;
          if (patch.aiAssist !== undefined) settings.aiAssist = patch.aiAssist;
          return { settings };
        }),
    }),
    {
      name: "tangent-notebook",
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => (typeof window === "undefined" ? fallbackStorage : localStorage)),
      partialize: (state) => ({
        classes: state.classes,
        lectures: state.lectures,
        notes: state.notes,
        transcripts: state.transcripts,
        logs: state.logs,
        rehearsal: state.rehearsal,
        settings: state.settings,
        activeClassId: state.activeClassId,
        activeLectureId: state.activeLectureId,
      }),
    },
  ),
);

export function lectureSlides(lecture: Lecture | undefined): string[] {
  if (!lecture) return [];
  return lecture.slideTexts.map((text, index) => {
    const summary = lecture.slideSummaries[index] ?? "";
    return `${text} ${summary}`.trim();
  });
}

export function activeLecture(state: Notebook): Lecture | undefined {
  return state.lectures.find((lecture) => lecture.id === state.activeLectureId);
}

export type { NoteMark };
