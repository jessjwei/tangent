import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { InlineName } from "@/components/tangent/class-bar";
import { formatStamp } from "@/lib/tangent/format";
import type { Truth } from "@/lib/tangent/types";
import { useTangent } from "@/lib/tangent/store";

const TRUTHS: { id: Truth; label: string }[] = [
  { id: "correct", label: "Correct" },
  { id: "early", label: "Early" },
  { id: "late", label: "Late" },
  { id: "wrong", label: "Wrong" },
];

export function SlideStage({
  images,
  busy,
  showMarks,
  elapsed,
  onSample,
  onBrowse,
  onFile,
}: {
  images: readonly string[];
  busy: boolean;
  showMarks: boolean;
  elapsed: number;
  onSample: () => void;
  onBrowse: () => void;
  onFile: (file: File | undefined) => void;
}) {
  const lectureId = useTangent((state) => state.activeLectureId);
  const lecture = useTangent((state) => state.lectures.find((item) => item.id === state.activeLectureId));
  const classes = useTangent((state) => state.classes);
  const lectures = useTangent((state) => state.lectures);
  const activeClassId = useTangent((state) => state.activeClassId);
  const setSlide = useTangent((state) => state.setSlide);
  const setTruth = useTangent((state) => state.setTruth);
  const renameClass = useTangent((state) => state.renameClass);
  const renameLecture = useTangent((state) => state.renameLecture);
  const selectLecture = useTangent((state) => state.selectLecture);
  const createLecture = useTangent((state) => state.createLecture);
  const rehearsal = useTangent((state) => state.rehearsal);
  const notes = useTangent((state) => state.notes);
  const [over, setOver] = useState(false);

  const course = classes.find((item) => item.id === activeClassId) ?? classes[0];
  const classLectures = lectures.filter((item) => item.classId === course?.id);
  const current = lecture?.currentSlide ?? 0;
  const count = lecture?.slideCount ?? 0;
  const image = images[current] ?? "";
  const today = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    [],
  );
  const mark = useMemo(
    () => rehearsal.find((item) => item.lectureId === lectureId && item.slideIndex === current),
    [rehearsal, lectureId, current],
  );
  const examNote = useMemo(() => {
    const pinned = notes.filter((note) => note.lectureId === lectureId && note.slideIndex === current && note.exam);
    return pinned[pinned.length - 1];
  }, [notes, lectureId, current]);

  return (
    <section
      className={`page page-left ${over ? "is-over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onFile(event.dataTransfer.files?.[0]);
      }}
    >
      <div className="page-body">
        <div className="page-top">
          <div className="tape tape-class tilt-a">
            <InlineName
              value={course?.name ?? "My class"}
              label="Rename class"
              className="tape-name"
              onSave={(name) => {
                if (course) renameClass(course.id, name);
              }}
            />
            <span aria-hidden="true">·</span>
            <InlineName
              value={lecture?.name ?? "New lecture"}
              label="Rename lecture"
              className="tape-name"
              onSave={(name) => {
                if (lecture) renameLecture(lecture.id, name);
              }}
            />
          </div>
          <div className="page-top-side">
            <p className="hand date-line">{today}</p>
            <button type="button" className="hand text-btn" onClick={() => createLecture()}>
              + lecture
            </button>
          </div>
        </div>
        {classLectures.length > 1 ? (
          <select
            aria-label="Choose lecture"
            className="lecture-pick"
            value={lecture?.id ?? ""}
            onChange={(event) => selectLecture(event.target.value)}
          >
            {classLectures.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : null}
        <div className="stage">
          {busy ? (
            <p className="empty-lead">Reading slides…</p>
          ) : count === 0 ? (
            <div className="empty-wrap">
              <button type="button" className="empty-well" onClick={onBrowse}>
                <img src="/brand/peeled.png" alt="" className="empty-fruit" />
                <p className="empty-title">No slides yet</p>
                <p className="empty-lead">Drop the lecture PDF here, or click to upload.</p>
                <p className="hand empty-caption">we’ll peel each slide off for you</p>
              </button>
              <button type="button" className="hand sample-link" onClick={onSample}>
                or try a sample lecture
              </button>
            </div>
          ) : !image ? (
            <p className="empty-lead">Opening slides…</p>
          ) : (
            <div className="print-wrap">
              <div className="printout">
                <span className="slide-tape left" aria-hidden="true" />
                <span className="slide-tape right" aria-hidden="true" />
                <img src={image} alt={lecture?.slideTexts[current]?.slice(0, 140) || `Slide ${current + 1}`} />
              </div>
              {examNote ? (
                <div className="sticky-note">
                  <p className="sticky-label">On the midterm</p>
                  <p className="hand sticky-line">
                    {examNote.timestampMs > 0 ? formatStamp(examNote.timestampMs) : examNote.text}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="pager">
          <button
            type="button"
            aria-label="Previous slide"
            disabled={count === 0 || current === 0}
            onClick={() => setSlide(current - 1)}
            className="stamp stamp-icon"
          >
            <ChevronLeft className="size-5" />
          </button>
          <p className="hand pager-label">{count === 0 ? "no slides" : `slide ${current + 1} of ${count}`}</p>
          <button
            type="button"
            aria-label="Next slide"
            disabled={count === 0 || current >= count - 1}
            onClick={() => setSlide(current + 1)}
            className="stamp stamp-icon"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        {showMarks && count > 0 && lecture ? (
          <div className="truth-row">
            <span className="truth-label">Was tracking right?</span>
            {TRUTHS.map((truth) => {
              const active = mark?.truth === truth.id;
              return (
                <button
                  key={truth.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTruth(lecture.id, current, truth.id, elapsed)}
                  className={`stamp ${active ? "stamp-navy" : ""}`}
                >
                  {truth.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
