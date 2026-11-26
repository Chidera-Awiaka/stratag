// Pulls text out of a PDF in the browser (nothing is uploaded) and rebuilds lines,
// so table rows like "Midterm | Feb 24 | 25%" stay on one line.
export async function pdfToText(file) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let p = 1; p <= Math.min(doc.numPages, 40); p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push(rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join(' | ').replace(/\s*\|\s*(?=[a-z,.)])/g, ' ')).join('\n'));
  }
  return pages.join('\n');
}

// Scanned PDFs are pictures of text: render each page and read it with OCR (runs in the browser,
// served from our own site, so nothing goes to a third party; first use downloads ~6 MB, then it's cached).
export async function ocrPdf(file, onProgress = () => {}) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = Math.min(doc.numPages, 8);
  const ocr = await makeOcr();
  const out = [];
  try {
    for (let p = 1; p <= pages; p++) {
      onProgress(`Reading page ${p} of ${pages}…`);
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const { data } = await ocr.recognize(canvas);
      out.push(data.text);
    }
  } finally { await ocr.terminate(); }
  return out.join('\n');
}

export async function makeOcr() {
  const { createWorker } = await import('tesseract.js');
  return createWorker('eng', 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr' });
}
