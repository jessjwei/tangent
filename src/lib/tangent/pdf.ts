const MAX_PAGES = 24;

export type RenderedPage = { text: string; image: string };

export type RenderedPdf = {
  name: string;
  pages: RenderedPage[];
  truncated: boolean;
};

export async function renderPdfFile(file: File): Promise<RenderedPdf> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const count = Math.min(doc.numPages, MAX_PAGES);
  const pages: RenderedPage[] = [];

  for (let number = 1; number <= count; number += 1) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not draw this PDF");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ text, image: canvas.toDataURL("image/jpeg", 0.72) });
    page.cleanup();
  }

  return { name: file.name, pages, truncated: doc.numPages > MAX_PAGES };
}
