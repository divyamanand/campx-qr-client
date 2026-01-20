import jsQR from "jsqr";
import { preprocessImage } from "./preprocessImage";

export async function scanSingleImage({ blob, page }) {
  const imageBitmap = await createImageBitmap(blob);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imageBitmap, 0, 0);

  const found = [];

  // ----------------------------------
  // PASS 1: Raw image (fast path)
  // ----------------------------------
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let qr = jsQR(
    imageData.data,
    imageData.width,
    imageData.height,
    { inversionAttempts: "attemptBoth" }
  );

  if (qr) {
    found.push({ data: qr.data, location: qr.location });
  }

  // ----------------------------------
  // PASS 2: Preprocessed image
  // ----------------------------------
  if (!qr) {
    const processed = preprocessImage(ctx, canvas.width, canvas.height);

    qr = jsQR(
      processed.data,
      processed.width,
      processed.height,
      { inversionAttempts: "attemptBoth" }
    );

    if (qr) {
      found.push({ data: qr.data, location: qr.location });
    }
  }

  // ----------------------------------
  // Cleanup
  // ----------------------------------
  canvas.width = canvas.height = 0;
  imageBitmap.close?.();

  return found;
}
