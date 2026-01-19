import { useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
// import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;


export function usePdfToImages({
  scale = 2,
  imageType = "image/png",
  imageQuality = 1,
} = {}) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const convert = useCallback(async (pdfFile) => {
    if (!pdfFile) return;

    setLoading(true);
    setError(null);
    setImages([]);

    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const result = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
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
          canvas.toBlob(resolve, imageType, imageQuality)
        );

        const file = new File(
          [blob],
          `page-${pageNum}.${imageType.split("/")[1]}`,
          { type: imageType }
        );

        result.push({
          page: pageNum,
          blob,
          file,
          width: canvas.width,
          height: canvas.height,
        });

        canvas.width = canvas.height = 0; // cleanup
      }

      setImages(result);
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [scale, imageType, imageQuality]);

  return {
    convert,
    images,
    loading,
    error,
  };
}
