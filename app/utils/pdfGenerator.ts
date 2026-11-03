import jsPDF from "jspdf";
import * as htmlToImage from "html-to-image";

/**
 * Render any HTML DOM element (e.g. printable quotation sheet) into a high-resolution A4 jsPDF instance and Blob
 */
export async function renderElementToPdf(element: HTMLElement): Promise<{ pdf: jsPDF; blob: Blob }> {
  // Give React one tick to apply export styles
  await new Promise((resolve) => setTimeout(resolve, 150));

  const dataUrl = await htmlToImage.toPng(element, {
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
  } else if (imgHeight <= pdfHeight * 1.25) {
    const scaleFactor = pdfHeight / imgHeight;
    const scaledWidth = imgWidth * scaleFactor;
    const xOffset = (pdfWidth - scaledWidth) / 2;
    pdf.addImage(dataUrl, "PNG", xOffset, 0, scaledWidth, pdfHeight);
  } else {
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }
  }

  const blob = pdf.output("blob");
  return { pdf, blob };
}
