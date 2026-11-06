import { useEffect, useRef, useState } from "react";
import { getDocument, TextLayer } from "pdfjs-dist";
import * as pdfWorker from "pdfjs-dist/build/pdf.worker.mjs";
import "pdfjs-dist/web/pdf_viewer.css";

// Embedded browsers can restrict module workers. PDF.js supports an in-process handler.
(globalThis as typeof globalThis & { pdfjsWorker: typeof pdfWorker }).pdfjsWorker = pdfWorker;

export default function PdfReader({ artifactId }: { artifactId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const element = container.current!;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(Math.min(entry.contentRect.width, 900)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return;
    const element = container.current!;
    element.replaceChildren();
    setError("");
    setProgress("正在读取 PDF…");
    let cancelled = false;
    const loading = getDocument({
      url: `/api/artifacts/${artifactId}/view`,
      disableRange: true,
      disableStream: true,
    });
    async function render() {
      const document = await loading.promise;
      for (let number = 1; number <= document.numPages; number++) {
        if (cancelled) return;
        const page = await document.getPage(number);
        if (cancelled) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / original.width });
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const wrapper = window.document.createElement("section");
        wrapper.className = "pdf-rendered-page";
        wrapper.setAttribute("aria-label", `第 ${number} 页`);
        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.height = `${viewport.height}px`;
        wrapper.style.setProperty("--total-scale-factor", String(viewport.scale));
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width * scale);
        canvas.height = Math.ceil(viewport.height * scale);
        canvas.setAttribute("aria-hidden", "true");
        wrapper.append(canvas);
        element.append(wrapper);
        setProgress(`正在渲染第 ${number} / ${document.numPages} 页…`);
        await page.render({
          canvas,
          viewport,
          intent: "print",
          transform: [scale, 0, 0, scale, 0, 0],
        }).promise;
        if (cancelled) return;
        setProgress(`正在加载第 ${number} 页文字…`);
        const text = window.document.createElement("div");
        text.className = "textLayer";
        wrapper.append(text);
        await new TextLayer({
          textContentSource: await page.getTextContent(),
          container: text,
          viewport,
        }).render();
        if (!cancelled) setProgress(`${number} / ${document.numPages} 页`);
      }
    }
    void render().catch((cause: Error) => {
      if (!cancelled) {
        setError(`PDF 读取失败，${cause.message}`);
        setProgress("");
      }
    });
    return () => {
      cancelled = true;
      void loading.destroy();
    };
  }, [artifactId, width]);

  return (
    <div className="pdf-reader">
      {progress && <p className="muted" role="status">{progress}</p>}
      {error && <p className="alert error" role="alert">{error}</p>}
      <div ref={container} className="pdf-pages" />
    </div>
  );
}
