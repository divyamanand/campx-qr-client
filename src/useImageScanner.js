import { useState, useCallback } from "react";
// import { useState, useCallback } from "react";
import jsQR from "jsqr";
import { preprocessImage } from "./preprocessImage";

async function scanSingleImage({ blob, page }) {
  const imageBitmap = await createImageBitmap(blob);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  ctx.drawImage(imageBitmap, 0, 0);

  const found = [];

  // ---- PASS 1: raw image ----
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let qr = jsQR(imageData.data, imageData.width, imageData.height);

  if (!qr) {
    // ---- PASS 2: preprocessed ----
    preprocessImage(ctx, canvas.width, canvas.height, {
      threshold: 140,
      invert: false,
    });

    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    qr = jsQR(imageData.data, imageData.width, imageData.height);
  }

  if (!qr) {
    // ---- PASS 3: inverted ----
    preprocessImage(ctx, canvas.width, canvas.height, {
      threshold: 140,
      invert: true,
    });

    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    qr = jsQR(imageData.data, imageData.width, imageData.height);
  }

  if (qr) {
    found.push({
      data: qr.data,
      location: qr.location,
    });
  }

  canvas.width = canvas.height = 0;
  imageBitmap.close?.();

  return found;
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
        const qrResults = await scanSingleImage(img);

        if (qrResults.length > 0) {
          output.push({
            page: img.page,
            qrs: qrResults,
          });
        }
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

