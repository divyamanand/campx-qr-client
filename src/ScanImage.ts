import * as ZXing from 'zxing-wasm'

/**
 * Result from scanning an image
 */
interface ScanResult {
  success: boolean
  codes: Record<string, unknown>[]
  rawResults?: unknown[]
}

/**
 * Options for barcode scanning
 */
interface ScanOptions {
  tryHarder?: boolean
  formats?: string[]
  maxNumberOfSymbols?: number
}

/**
 * Wrapper around zxing-wasm for QR code and barcode scanning
 */
class ScanImage {
  private options: ScanOptions

  constructor(options: ScanOptions = {}) {
    this.options = {
      tryHarder: options.tryHarder ?? true,
      formats: options.formats ?? ['QRCode', 'Code128'],
      maxNumberOfSymbols: options.maxNumberOfSymbols ?? 2,
    }
  }

  /**
   * Scan image blob for barcodes and QR codes
   */
  async scan(blob: Blob): Promise<ScanResult> {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      // Create image from blob data
      const image = new Image()
      const objectUrl = URL.createObjectURL(blob)

      return new Promise((resolve) => {
        image.onload = async () => {
          try {
            // Create canvas from image
            const canvas = document.createElement('canvas')
            canvas.width = image.width
            canvas.height = image.height
            const context = canvas.getContext('2d')

            if (!context) {
              resolve({
                success: false,
                codes: [],
              })
              return
            }

            context.drawImage(image, 0, 0)
            const imageData = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            )

            // Attempt to read barcodes from the image
            const results = (ZXing as any).readBarcodes(imageData)

            if (!results || results.length === 0) {
              resolve({
                success: false,
                codes: [],
                rawResults: results,
              })
              return
            }

            // Transform results to our format
            const codes = results.map((result: any) => ({
              rawValue: result.text,
              format: result.format,
              QRCode: result.format === 'QRCode',
              Code128: result.format === 'Code128',
              rawResult: result,
            }))

            resolve({
              success: true,
              codes,
              rawResults: results,
            })
          } catch (error) {
            console.error('Scan error:', error)
            resolve({
              success: false,
              codes: [],
            })
          } finally {
            URL.revokeObjectURL(objectUrl)
          }
        }

        image.onerror = () => {
          console.error('Failed to load image')
          resolve({
            success: false,
            codes: [],
          })
          URL.revokeObjectURL(objectUrl)
        }

        image.src = objectUrl
      })
    } catch (error) {
      console.error('Scan error:', error)
      return {
        success: false,
        codes: [],
      }
    }
  }
}

/**
 * Default scanner instance with standard configuration
 */
export const defaultScanner = new ScanImage({
  tryHarder: true,
  formats: ['QRCode', 'Code128'],
  maxNumberOfSymbols: 2,
})

export default ScanImage
