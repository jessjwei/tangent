import { useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { ClassFlags } from "@/components/tangent/class-bar";
import { MatchDrawer } from "@/components/tangent/match-drawer";
import { SidePanel } from "@/components/tangent/side-panel";
import { SlideStage } from "@/components/tangent/slide-stage";
import { useLectureEngine } from "@/components/tangent/use-engine";
import { formatStamp } from "@/lib/tangent/format";
import { loadPages, savePages } from "@/lib/tangent/idb";
import { renderPdfFile } from "@/lib/tangent/pdf";
import { buildSampleDeck, sampleScript } from "@/lib/tangent/sample";
import { activeLecture, lectureSlides, useTangent } from "@/lib/tangent/store";

export function TangentApp() {
  const [ready, setReady] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pageRev, setPageRev] = useState(0);
  const lectureId = useTangent((state) => state.activeLectureId);
  const lecture = useTangent((state) => activeLecture(state));
  const slides = useMemo(() => lectureSlides(lecture), [lecture]);
  const sample = lecture?.pdfName === "sample-tangent-line.pdf";
  const engine = useLectureEngine(slides);
  const logs = useTangent((state) => state.logs.some((log) => log.lectureId === state.activeLectureId && log.accepted && log.fromSlide !== log.toSlide));

  useEffect(() => {
    let cancel = false;
    void Promise.resolve(useTangent.persist.rehydrate()).then(() => {
      if (cancel) return;
      useTangent.getState().repair();
      setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancel = false;
    setImages([]);
    void loadPages(lectureId).then((pages) => {
      if (!cancel) setImages(pages);
    });
    return () => {
      cancel = true;
    };
  }, [lectureId, pageRev, ready]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (event.shiftKey && event.key.toLowerCase() === "m" && !typing) {
        event.preventDefault();
        setTracking((open) => !open);
      }
      if (typing) return;
      const open = activeLecture(useTangent.getState());
      if (!open || open.slideCount === 0) return;
      if (event.key === "ArrowLeft") useTangent.getState().setSlide(open.currentSlide - 1);
      if (event.key === "ArrowRight") useTangent.getState().setSlide(open.currentSlide + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.type && file.type !== "application/pdf") {
      toast.error("Upload a PDF of the lecture slides.");
      return;
    }
    setBusy(true);
    try {
      const rendered = await renderPdfFile(file);
      if (rendered.pages.length === 0) {
        toast.error("That PDF has no pages.");
        return;
      }
      const id = useTangent.getState().activeLectureId;
      await savePages(id, rendered.pages.map((page) => page.image));
      useTangent.getState().attachSlides(
        id,
        file.name,
        rendered.pages.map((page) => page.text),
      );
      setPageRev((rev) => rev + 1);
      if (rendered.truncated) toast("Loaded the first 24 pages.");
      else toast.success(`Loaded ${rendered.pages.length} slides.`);
    } catch {
      toast.error("Could not read that PDF.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function loadSample() {
    setBusy(true);
    try {
      const deck = buildSampleDeck();
      const state = useTangent.getState();
      const open = activeLecture(state);
      let id = state.activeLectureId;
      if (open && open.slideCount > 0) id = state.createLecture();
      const course = state.classes.find((item) => item.id === state.activeClassId);
      if (course?.name === "Untitled class" || course?.name === "My class") state.renameClass(course.id, deck.className);
      state.renameLecture(id, deck.lectureName);
      await savePages(id, deck.slides.map((slide) => slide.image));
      state.attachSlides(
        id,
        "sample-tangent-line.pdf",
        deck.slides.map((slide) => slide.text),
      );
      setPageRev((rev) => rev + 1);
      toast.success("Sample lecture ready. Simulate it to watch the slides follow along.");
    } catch {
      toast.error("Could not build the sample lecture.");
    } finally {
      setBusy(false);
    }
  }

  function exportLecture() {
    const state = useTangent.getState();
    const open = activeLecture(state);
    if (!open) return;
    const payload = {
      class: state.classes.find((course) => course.id === open.classId)?.name ?? "",
      lecture: open.name,
      slides: open.slideTexts.map((text, index) => ({
        index,
        text,
        summary: open.slideSummaries[index] ?? "",
      })),
      notes: state.notes.filter((note) => note.lectureId === open.id),
      transcript: state.transcripts.filter((line) => line.lectureId === open.id),
      matches: state.logs.filter((log) => log.lectureId === open.id),
      rehearsal: state.rehearsal.filter((mark) => mark.lectureId === open.id),
      settings: state.settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tangent-${open.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`desk ${ready ? "" : "pointer-events-none"}`}>
      <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
        <filter id="graphite">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" />
        </filter>
      </svg>
      <Toaster position="bottom-right" />
      <header className="topbar">
        <h1 className="logo">
          Tangent
          <img src="/brand/wedge.png" alt="" className="logo-mark" />
        </h1>
        <div className="top-actions">
          <button type="button" className="stamp" aria-label="Upload slides PDF" onClick={() => fileRef.current?.click()}>
            <span className="label-full">{(lecture?.slideCount ?? 0) > 0 ? "Replace slides" : "Upload slides (PDF)"}</span>
            <span className="label-short">{(lecture?.slideCount ?? 0) > 0 ? "Replace" : "Upload"}</span>
          </button>
          <button
            type="button"
            aria-pressed={engine.listening}
            onClick={() => {
              if (!engine.listening) engine.startListening();
            }}
            className={`stamp ${engine.listening ? "stamp-live" : "stamp-navy"}`}
          >
            {engine.listening ? (
              <>
                <span className="live-dot" aria-hidden="true" />
                <span className="label-full">{`Listening · ${formatStamp(engine.elapsed)}`}</span>
                <span className="label-short">{formatStamp(engine.elapsed)}</span>
              </>
            ) : (
              <>
                <span className="label-full">Start listening</span>
                <span className="label-short">Listen</span>
              </>
            )}
          </button>
          <button type="button" className="end-link" disabled={!engine.listening} onClick={engine.endLecture}>
            End lecture
          </button>
          <button type="button" className="end-link" onClick={() => setTracking(true)}>
            Tracking
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
      </header>
      <div className="desk-main">
        <ClassFlags>
          <div className="cover">
            <div className="pages">
              <SlideStage
                images={images}
                busy={busy}
                showMarks={logs || engine.simulating || engine.listening}
                elapsed={engine.elapsed}
                onSample={() => void loadSample()}
                onBrowse={() => fileRef.current?.click()}
                onFile={(file) => void onFile(file)}
              />
              <SidePanel
                interim={engine.interim}
                listening={engine.listening}
                elapsed={engine.elapsed}
                onSimulate={() => void engine.simulate(sample ? sampleScript() : undefined)}
              />
            </div>
          </div>
        </ClassFlags>
      </div>
      <MatchDrawer
        open={tracking}
        decision={engine.lastDecision}
        indexing={engine.indexing}
        onClose={() => setTracking(false)}
        onIndex={() => void engine.indexWithGrok(images)}
        onExport={exportLecture}
      />
    </div>
  );
}
