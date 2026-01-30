import { readBarcodes, type ReadInputBarcodeFormat } from "zxing-wasm/reader";

export interface ScannerOptions {
  tryHarder?: boolean;
  formats?: ReadInputBarcodeFormat[];
  maxNumberOfSymbols?: number;
}

export interface BarcodeData {
  data: string;
  format: string;
  position: unknown;
}

export interface ScanResult {
  success: boolean;
  codes: BarcodeData[];
  error: string | null;
}

/**
 * ScanImage - Responsible for scanning image blobs for barcodes/QR codes
 *
 * Single responsibility: Take an image blob and return scan results
 * with a clear pass/fail indicator.
 */
export class ScanImage {
  readerOptions: {
    tryHarder: boolean;
    formats: ReadInputBarcodeFormat[];
    maxNumberOfSymbols: number;
  };

  constructor(options: ScannerOptions = {}) {
    this.readerOptions = {
      tryHarder: options.tryHarder ?? true,
      formats: options.formats ?? ["QRCode", "Code128"],
      maxNumberOfSymbols: options.maxNumberOfSymbols ?? 2,
    };
  }

  /**
   * Scan an image blob for barcodes/QR codes
   * @param {Blob} blob - The image blob to scan
   * @returns {Promise<ScanResult>} - Scan result with pass/fail indicator
   */
  async scan(blob: Blob): Promise<ScanResult> {
    try {
      const results = await readBarcodes(blob, this.readerOptions);

      if (!results || results.length === 0) {
        return {
          success: false,
          codes: [],
          error: "NO_BARCODE_FOUND",
        };
      }

      return {
        success: true,
        codes: results.map((result) => ({
          data: result.text,
          format: result.format,
          position: result.position || null,
        })),
        error: null,
      };
    } catch (err) {
      return {
        success: false,
        codes: [],
        error: err instanceof Error ? err.message : "BARCODE_DECODE_FAILED",
      };
    }
  }
}

// Default singleton instance for convenience
export const defaultScanner = new ScanImage();