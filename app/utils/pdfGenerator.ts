import jsPDF from "jspdf";
import * as htmlToImage from "html-to-image";

interface PixelInterval {
  top: number;
  bottom: number;
}

/**
 * Render any HTML DOM element (e.g. printable quotation sheet) into a high-resolution A4 jsPDF instance and Blob.
 * Multi-page documents are sliced cleanly between table rows / break-safe blocks so rows are never cut in half.
 */
export async function renderElementToPdf(element: HTMLElement): Promise<{ pdf: jsPDF; blob: Blob }> {
  // Give React one tick to apply export styles
  await new Promise((resolve) => setTimeout(resolve, 150));

  const rootRect = element.getBoundingClientRect();
  const domTotalHeight = element.scrollHeight || rootRect.height || 1;

  // Measure row / block boundaries before rasterizing
  const rawBlocks: Array<{ topRatio: number; bottomRatio: number }> = [];
  const candidates = element.querySelectorAll("tr, .pdf-avoid-break");
  candidates.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    const topRatio = (r.top - rootRect.top) / domTotalHeight;
    const bottomRatio = (r.bottom - rootRect.top) / domTotalHeight;
    if (bottomRatio > 0 && topRatio < 1) {
      rawBlocks.push({
        topRatio: Math.max(0, topRatio),
        bottomRatio: Math.min(1, bottomRatio),
      });
    }
  });

  const dataUrl = await htmlToImage.toPng(element, {
    width: 820,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: false,
  });

  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("PDF görseli oluşturulamadı"));
  });

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pdfWidth = 210;
  const pdfHeight = 297;
  const imgWidth = pdfWidth;
  const imgHeight = (img.height * imgWidth) / img.width;

  if (imgHeight <= pdfHeight) {
    pdf.addImage(dataUrl, "PNG", 0, 0, imgWidth, imgHeight);
  } else if (imgHeight <= pdfHeight * 1.12) {
    const scaleFactor = pdfHeight / imgHeight;
    const scaledWidth = imgWidth * scaleFactor;
    const xOffset = (pdfWidth - scaledWidth) / 2;
    pdf.addImage(dataUrl, "PNG", xOffset, 0, scaledWidth, pdfHeight);
  } else {
    const marginMm = 8;
    const usableHeightMm = pdfHeight - marginMm * 2;
    const pxPerMm = img.width / pdfWidth;
    const maxSlicePx = Math.floor(usableHeightMm * pxPerMm);

    const blocks: PixelInterval[] = rawBlocks
      .map((b) => ({
        top: Math.floor(b.topRatio * img.height),
        bottom: Math.ceil(b.bottomRatio * img.height),
      }))
      .sort((a, b) => a.top - b.top);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    let cursorPx = 0;
    let pageIndex = 0;

    while (cursorPx < img.height - 2) {
      let endPx = Math.min(img.height, cursorPx + maxSlicePx);

      if (endPx < img.height) {
        // Find the first block straddling endPx and break cleanly BEFORE it
        const straddling = blocks.find(
          (b) => b.top < endPx && b.bottom > endPx && b.top > cursorPx + 40
        );
        if (straddling) {
          endPx = straddling.top;
        } else {
          // Snap to the last block ending before endPx if very close
          const lastFit = [...blocks]
            .reverse()
            .find((b) => b.bottom <= endPx && b.bottom > cursorPx + 40 && endPx - b.bottom < 40);
          if (lastFit) {
            endPx = lastFit.bottom;
          }
        }
      }

      const sliceHeightPx = Math.max(1, endPx - cursorPx);

      if (ctx) {
        canvas.width = img.width;
        canvas.height = sliceHeightPx;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          img,
          0,
          cursorPx,
          img.width,
          sliceHeightPx,
          0,
          0,
          img.width,
          sliceHeightPx
        );
        const sliceDataUrl = canvas.toDataURL("image/png");
        const sliceHeightMm = sliceHeightPx / pxPerMm;

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(sliceDataUrl, "PNG", 0, marginMm, pdfWidth, sliceHeightMm);
      } else {
        // Fallback if canvas 2D context is unavailable
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, -(cursorPx / pxPerMm) + marginMm, imgWidth, imgHeight);
      }

      cursorPx = endPx;
      pageIndex++;
      if (pageIndex > 40) break; // safety guard
    }
  }

  const blob = pdf.output("blob");
  return { pdf, blob };
}
