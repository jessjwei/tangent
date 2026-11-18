import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Highlighter, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addMark, formatStamp } from "@/lib/tangent/format";
import { useTangent } from "@/lib/tangent/store";
import type { Note, NoteMark } from "@/lib/tangent/types";

function examish(text: string) {
  return /\b(exam|midterm|final)\b/i.test(text);
}

export function SidePanel({
  interim,
  listening,
  elapsed,
  onSimulate,
}: {
  interim: string;
  listening: boolean;
  elapsed: number;
  onSimulate: () => void;
}) {
  const lectureId = useTangent((state) => state.activeLectureId);
  const currentSlide = useTangent((state) => {
    const open = state.lectures.find((item) => item.id === state.activeLectureId);
    return open?.currentSlide ?? 0;
  });
  const transcripts = useTangent((state) => state.transcripts);
  const allNotes = useTangent((state) => state.notes);
  const lines = useMemo(
    () => transcripts.filter((item) => item.lectureId === lectureId),
    [transcripts, lectureId],
  );
  const notes = useMemo(
    () =>
      allNotes
        .filter((note) => note.lectureId === lectureId && note.slideIndex === currentSlide)
        .sort((a, b) => a.timestampMs - b.timestampMs),
    [allNotes, lectureId, currentSlide],
  );
  const addNote = useTangent((state) => state.addNote);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [lines.length, interim]);

  const slideNumber = currentSlide + 1;
  const lastId = lines[lines.length - 1]?.id;

  return (
    <section className="page page-right">
      <div className="page-body">
        <div className="panel-head">
          <h2 className="tape tape-blue tilt-b">Live transcript</h2>
          {listening ? (
            <span className="rec">
              <i /> rec
            </span>
          ) : lines.length === 0 && !interim ? (
            <img src="/brand/whole.png" alt="" className="transcript-fruit" />
          ) : null}
        </div>
        <div className="transcript" aria-live="polite">
          {lines.length === 0 && !interim ? (
            <div>
              <p className="t-empty">
                Press <strong>Start listening</strong> when the lecture begins…
              </p>
              <button type="button" className="sim-link" onClick={onSimulate}>
                Simulate lecture
              </button>
            </div>
          ) : (
            <ul>
              {lines.map((line) => {
                const newest = !interim && line.id === lastId;
                return (
                  <li key={line.id} className={`t-line ${newest ? "now" : ""} ${examish(line.text) ? "exam" : ""}`}>
                    <time dateTime={`PT${Math.floor(line.atMs / 1000)}S`}>{formatStamp(line.atMs)}</time>
                    {newest ? <span className="now-tag">NOW</span> : null}
                    {line.text}
                    {newest ? <span className="caret" aria-hidden="true" /> : null}
                  </li>
                );
              })}
              {interim ? (
                <li className="t-line interim">
                  {interim}
                  <span className="caret" aria-hidden="true" />
                </li>
              ) : null}
            </ul>
          )}
          <div ref={endRef} />
        </div>
        <hr className="stitch-break" />
        <div className="panel-head">
          <h2 className="tape tape-notes tilt-c">Notes · Slide {slideNumber}</h2>
        </div>
        <div className="notes">
          <ul className="note-list">
            {notes.length === 0 ? (
              <li className="hand note-empty">nothing jotted down yet</li>
            ) : (
              notes.map((note) => <NoteLine key={note.id} note={note} />)
            )}
          </ul>
        </div>
        <form
          className="note-form"
          onSubmit={(event) => {
            event.preventDefault();
            addNote(draft, listening ? elapsed : 0);
            setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="/ Type a note, press Enter..."
            aria-label="Note for this slide"
            className="hand note-input"
          />
        </form>
      </div>
    </section>
  );
}

function highlightSaved(slideIndex: number) {
  toast(`Highlight saved to Slide ${slideIndex + 1}`, {
    icon: <img src="/brand/half.png" alt="" className="toast-fruit" />,
  });
}

function NoteLine({ note }: { note: Note }) {
  const updateNote = useTangent((state) => state.updateNote);
  const deleteNote = useTangent((state) => state.deleteNote);
  const undoDelete = useTangent((state) => state.undoDelete);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number; top: number; left: number } | null>(null);

  useEffect(() => {
    if (!editing) setDraft(note.text);
  }, [editing, note.text]);

  function captureSelection() {
    const root = bodyRef.current;
    const selected = window.getSelection();
    if (!root || !selected || selected.isCollapsed || selected.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const range = selected.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const lead = range.cloneRange();
    lead.selectNodeContents(root);
    lead.setEnd(range.startContainer, range.startOffset);
    const start = lead.toString().length;
    const end = start + range.toString().length;
    if (end <= start) {
      setSelection(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setSelection({ start, end, top: rect.top, left: rect.left });
  }

  return (
    <li className="note">
      <div className="note-main">
        <img src="/brand/segment.png" alt="" className="note-bullet" />
        <time className="hand note-time">{formatStamp(note.timestampMs)}</time>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const text = draft.trim();
                if (!text) {
                  deleteNote(note.id);
                  toast("Note deleted", { action: { label: "Undo", onClick: () => undoDelete() } });
                } else {
                  updateNote(note.id, { text });
                }
                setEditing(false);
              }}
            >
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setDraft(note.text);
                    setEditing(false);
                  }
                }}
                className="hand note-edit"
              />
              <div className="mt-2 flex gap-2">
                <button type="submit" className="stamp stamp-navy">
                  Save
                </button>
                <button
                  type="button"
                  className="stamp"
                  onClick={() => {
                    setDraft(note.text);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div
              ref={bodyRef}
              className={`hand note-text ${note.highlighted || note.exam ? "is-marked" : ""}`}
              onMouseUp={captureSelection}
              onDoubleClick={() => setEditing(true)}
            >
              {note.exam ? <span className="sr-only">Exam note. </span> : null}
              <MarkedText text={note.text} marks={note.marks} />
            </div>
          )}
        </div>
      </div>
      <div className="note-tools">
        <IconButton
          label={note.highlighted ? "Remove highlight" : "Highlight note"}
          pressed={note.highlighted}
          onClick={() => {
            if (selection) {
              updateNote(note.id, { marks: addMark(note.marks, selection.start, selection.end) });
              highlightSaved(note.slideIndex);
              setSelection(null);
              window.getSelection()?.removeAllRanges();
              return;
            }
            updateNote(note.id, { highlighted: !note.highlighted });
            if (!note.highlighted) highlightSaved(note.slideIndex);
          }}
        >
          <Highlighter className="size-4" />
        </IconButton>
        <IconButton label={note.exam ? "Remove exam mark" : "Mark for the exam"} pressed={note.exam} onClick={() => updateNote(note.id, { exam: !note.exam })}>
          <Star className="size-4" />
        </IconButton>
        <button type="button" className="end-link" onClick={() => setEditing(true)}>
          Edit
        </button>
        <IconButton
          label="Delete note"
          onClick={() => {
            deleteNote(note.id);
            toast("Note deleted", { action: { label: "Undo", onClick: () => undoDelete() } });
          }}
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>
      {selection ? (
        <button
          type="button"
          className="stamp stamp-navy fixed z-40 -translate-y-full"
          style={{ top: selection.top - 8, left: selection.left }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            updateNote(note.id, { marks: addMark(note.marks, selection.start, selection.end) });
            highlightSaved(note.slideIndex);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          Highlight
        </button>
      ) : null}
    </li>
  );
}

function MarkedText({ text, marks }: { text: string; marks: NoteMark[] }) {
  if (marks.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  sorted.forEach((mark, index) => {
    const start = Math.max(0, Math.min(text.length, mark.start));
    const end = Math.max(start, Math.min(text.length, mark.end));
    if (start > cursor) parts.push(text.slice(cursor, start));
    if (end > start) {
      parts.push(
        <mark key={`${start}-${end}-${index}`}>
          {text.slice(start, end)}
        </mark>,
      );
    }
    cursor = Math.max(cursor, end);
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function IconButton({
  label,
  children,
  onClick,
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button type="button" aria-label={label} aria-pressed={pressed} onClick={onClick} className="icon-btn">
      {children}
    </button>
  );
}
