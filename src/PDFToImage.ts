import * as pdfjsLib from 'pdfjs-dist'

/**
 * Options for PDF to image conversion
 */
interface PDFToImageOptions {
  imageType?: string
  imageQuality?: number
}

/**
 * Converts PDF pages to image blobs
 */
class PDFToImage {
  private pdfDocument: pdfjsLib.PDFDocument | null = null
  private options: PDFToImageOptions

  constructor(options: PDFToImageOptions = {}) {
    this.options = {
      imageType: options.imageType ?? 'image/png',
      imageQuality: options.imageQuality ?? 0.95,
    }

    // Set up pdfjs worker
    if (typeof window !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
    }
  }

  /**
   * Load a PDF document from File
   */
  async loadDocument(pdfFile: File): Promise<pdfjsLib.PDFDocument> {
    const arrayBuffer = await pdfFile.arrayBuffer()
    this.pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer })
      .promise
    return this.pdfDocument
  }

  /**
   * Convert a PDF page to an image blob using browser Canvas API
   */
  async convertPageToImage(
    page: pdfjsLib.PDFPageProxy,
    scale: number
  ): Promise<Blob> {
    const viewport = page.getViewport({ scale })

    // Create browser canvas element
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Could not get 2D context from canvas')
    }

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    }

    await page.render(renderContext).promise

    // Convert canvas to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to convert canvas to blob'))
          }
        },
        this.options.imageType || 'image/png',
        this.options.imageQuality || 0.95
      )
    })
  }
}

/**
 * Default PDF to image converter
 */
export const defaultPDFToImage = new PDFToImage({
  imageType: 'image/png',
  imageQuality: 0.95,
})

export default PDFToImage
