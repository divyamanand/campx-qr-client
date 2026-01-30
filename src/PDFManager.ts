import ScanImage from './ScanImage'
import PDFToImage from './PDFToImage'
import { rotateImage } from './imageUtils'
import ScaleSequenceGenerator from './ScaleSequenceGenerator'

/**
 * Code detection result
 */
interface Code {
  rawValue?: string
  format?: string
  QRCode?: boolean
  Code128?: boolean
  [key: string]: unknown
}

/**
 * Page processing result
 */
interface PageScanResult {
  pageNumber: number
  success: boolean
  codes: Code[]
  scale: number
  rotated: boolean
  errors?: string[]
}

/**
 * File processing result
 */
interface FileScanResult {
  success: boolean
  totalPages: number
  results: Record<number, PageScanResult>
  error?: string
}

/**
 * Options for PDF processing
 */
interface PDFManagerOptions {
  initialScale?: number
  enableRotation?: boolean
  rotationDegrees?: number
}

/**
 * Callback for page progress updates
 */
type PageCallback = (pageInfo: {
  pageNumber: number
  totalPages: number
}) => void

/**
 * Orchestrates PDF processing: converts pages to images and scans for barcodes
 */
class PDFManager {
  private scanner: ScanImage
  private pdfToImage: PDFToImage
  private options: Required<PDFManagerOptions>

  constructor(options: PDFManagerOptions = {}) {
    this.scanner = new ScanImage({
      tryHarder: true,
      formats: ['QRCode', 'Code128'],
      maxNumberOfSymbols: 2,
    })
    this.pdfToImage = new PDFToImage({
      imageType: 'image/png',
      imageQuality: 0.95,
    })
    this.options = {
      initialScale: options.initialScale ?? 3,
      enableRotation: options.enableRotation ?? true,
      rotationDegrees: options.rotationDegrees ?? 180,
    }
  }

  /**
   * Try scanning with rotation
   */
  private async tryScanWithRotation(
    imageBlob: Blob,
    scale: number
  ): Promise<{
    success: boolean
    codes: Code[]
    rotated: boolean
  }> {
    // Try normal orientation first
    let scanResult = await this.scanner.scan(imageBlob)
    if (scanResult.success && scanResult.codes.length > 0) {
      return {
        success: true,
        codes: scanResult.codes,
        rotated: false,
      }
    }

    // Try rotated if enabled
    if (this.options.enableRotation) {
      try {
        const rotatedBlob = await rotateImage(
          imageBlob,
          this.options.rotationDegrees
        )
        scanResult = await this.scanner.scan(rotatedBlob)
        if (scanResult.success && scanResult.codes.length > 0) {
          return {
            success: true,
            codes: scanResult.codes,
            rotated: true,
          }
        }
      } catch (error) {
        console.warn('Rotation scan failed:', error)
      }
    }

    return {
      success: false,
      codes: [],
      rotated: false,
    }
  }

  /**
   * Process a single page
   */
  private async processPage(
    page: any,
    pageNumber: number,
    maxRetries: number = 3
  ): Promise<PageScanResult> {
    const scaleSequence = ScaleSequenceGenerator.generate(
      this.options.initialScale,
      5,
      1
    )

    for (const scale of scaleSequence.slice(0, maxRetries)) {
      try {
        // Convert page to image
        const imageBlob = await this.pdfToImage.convertPageToImage(page, scale)

        // Try scanning with rotation
        const scanResult = await this.tryScanWithRotation(imageBlob, scale)

        if (scanResult.success && scanResult.codes.length > 0) {
          return {
            pageNumber,
            success: true,
            codes: scanResult.codes,
            scale,
            rotated: scanResult.rotated,
          }
        }
      } catch (error) {
        console.warn(
          `Error processing page ${pageNumber} at scale ${scale}:`,
          error
        )
      }
    }

    // Return failure after exhausting retries
    return {
      pageNumber,
      success: false,
      codes: [],
      scale: this.options.initialScale,
      rotated: false,
      errors: ['Failed to detect codes after retries'],
    }
  }

  /**
   * Process entire PDF file
   */
  async processFile(
    pdfFile: File,
    onPageComplete?: PageCallback
  ): Promise<FileScanResult> {
    try {
      // Load PDF
      const pdfDocument = await this.pdfToImage.loadDocument(pdfFile)
      const numPages = pdfDocument.numPages

      const results: Record<number, PageScanResult> = {}

      // Process each page
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum)
          const pageResult = await this.processPage(page, pageNum)
          results[pageNum] = pageResult

          // Call progress callback
          if (onPageComplete) {
            onPageComplete({
              pageNumber: pageNum,
              totalPages: numPages,
            })
          }
        } catch (error) {
          console.error(`Error getting page ${pageNum}:`, error)
          results[pageNum] = {
            pageNumber: pageNum,
            success: false,
            codes: [],
            scale: this.options.initialScale,
            rotated: false,
            errors: [(error as Error).message],
          }
        }
      }

      return {
        success: Object.values(results).some((r) => r.success),
        totalPages: numPages,
        results,
      }
    } catch (error) {
      return {
        success: false,
        totalPages: 0,
        results: {},
        error: (error as Error).message,
      }
    }
  }
}

/**
 * Factory function to create PDFManager instance
 */
export const createPDFManager = (
  options: PDFManagerOptions = {}
): PDFManager => {
  return new PDFManager(options)
}

export default PDFManager
