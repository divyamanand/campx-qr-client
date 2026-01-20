import { readBarcodes } from "zxing-wasm/reader";

const readerOptions = {
  tryHarder: true,
  formats: ["QRCode", "Code128"],
  maxNumberOfSymbols: 2,
};

export async function scanSingleImage({ blob, page }) {
  try {
    const results = await readBarcodes(blob, readerOptions);

    if (!results || results.length === 0) {
      return [{
        success: false,
        data: null,
        format: null,
        position: null,
        page,
        error: "NO_BARCODE_FOUND",
        ct: 0
      }];
    }

    return results.map((result) => ({
      success: true,
      data: result.text,
      format: result.format,
      position: result.position || null,
      page,
      error: null,
      ct: 1
    }));
  } catch (err) {
    return [{
      success: false,
      data: null,
      format: null,
      position: null,
      page,
      error:
        err instanceof Error
          ? err.message
          : "BARCODE_DECODE_FAILED",
      ct: 0,
    }];
  }
}
