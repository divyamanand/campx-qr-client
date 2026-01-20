import { readBarcodes } from "zxing-wasm/reader";

const readerOptions = {
  tryHarder: true,
  formats: [
    "QRCode",
    "Code128",
  ],
  maxNumberOfSymbols: 2,
};


export async function scanSingleImage({ blob, page }) {
  try {
    const results = await readBarcodes(blob, readerOptions);

    if (!results || results.length === 0) {
      return [];
    }

    return results.map((result) => ({
      data: result.text,
      format: result.format,
      position: result.position || null,
      page,
    }));
  } catch (err) {
    // Decode failures are expected when no QR is present
    return [];
  }
}
