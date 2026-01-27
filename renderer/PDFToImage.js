import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * PDFToImage - Responsible for converting PDF pages to images
 *
 * Single responsibility: Render a PDF page to an image blob at a given scale.
 */
export class PDFToImage {
  constructor(options = {}) {
    this.imageType = options.imageType ?? "image/png";
    this.imageQuality = options.imageQuality ?? 1;
  }

  /**
   * Load a PDF document from a File
   * @param {File} pdfFile - The PDF file to load
   * @returns {Promise<PDFDocumentProxy>} - The loaded PDF document
   */
  async loadDocument(pdfFile) {
    const arrayBuffer = await pdfFile.arrayBuffer();
    return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  }

  /**
   * Convert a PDF page to an image blob
   * @param {PDFPageProxy} page - The PDF page to render
   * @param {number} scale - The scale factor for rendering
   * @returns {Promise<ImageResult>} - The rendered image blob with metadata
   */
  async convertPageToImage(page, scale) {
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, this.imageType, this.imageQuality)
    );

    // Cleanup canvas
    canvas.width = canvas.height = 0;

    return {
      blob,
      width: viewport.width,
      height: viewport.height,
      scale,
    };
  }
}

// Default singleton instance for convenience
export const defaultPDFToImage = new PDFToImage();
