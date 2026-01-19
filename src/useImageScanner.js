import { useState, useCallback } from "react";
// import { BrowserMultiFormatReader } from "@zxing/browser";

import { BrowserMultiFormatReader } from "@zxing/browser";

const reader = new BrowserMultiFormatReader();

async function scanSingleImage({ blob, page }) {
  const imageBitmap = await createImageBitmap(blob);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const w = imageBitmap.width;
  const h = imageBitmap.height;

  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(imageBitmap, 0, 0);

  const regions = [
    [0, 0, w / 2, h / 2],
    [w / 2, 0, w / 2, h / 2],
    [0, h / 2, w / 2, h / 2],
    [w / 2, h / 2, w / 2, h / 2],
    [w / 4, h / 4, w / 2, h / 2], // center
  ];

  const result = {
    page,
    qrCode: [],
    barcode: [],
  };

  for (const [x, y, rw, rh] of regions) {
    const regionCanvas = document.createElement("canvas");
    const rctx = regionCanvas.getContext("2d");

    regionCanvas.width = rw;
    regionCanvas.height = rh;

    rctx.drawImage(canvas, x, y, rw, rh, 0, 0, rw, rh);

    try {
      const decoded = await reader.decodeFromCanvas(regionCanvas);
      const value = decoded.getText();
      const format = decoded.getBarcodeFormat();

      if (format === "QR_CODE") {
        if (!result.qrCode.includes(value)) result.qrCode.push(value);
      } else {
        if (!result.barcode.includes(value)) result.barcode.push(value);
      }
    } catch {
      // no code in this region
    }
  }

  imageBitmap.close?.();
  return result;
}


export function useQrFromImages() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scanImages = useCallback(async (images) => {
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const output = [];

      for (const img of images) {
        const pageResult = await scanSingleImage(img);
        output.push(pageResult);
      }

      setResults(output);
      return output;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    scanImages,
    results,
    loading,
    error,
  };
}
