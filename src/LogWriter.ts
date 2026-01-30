/**
 * Manages logging using File System Access API
 */

interface FileResult {
  fileName: string
  success: boolean
  totalPages: number
  results: Record<string, unknown>
  error?: string
}

interface LogEntry {
  [key: string]: unknown
}

interface VerificationData {
  filesToRetry: Record<string, number[]>
  bestCounts: Record<string, number>
}

const LOG_FILE_NAME = 'logs.json'

class LogWriter {
  /**
   * Open directory picker for logs directory
   */
  static async selectLogsDirectory(): Promise<FileSystemDirectoryHandle> {
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    })
    return dirHandle
  }

  /**
   * Read logs.json file from directory
   */
  static async readLogsFile(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<Record<string, LogEntry> | null> {
    try {
      const fileHandle = await dirHandle.getFileHandle(LOG_FILE_NAME)
      const file = await fileHandle.getFile()
      const text = await file.text()
      return JSON.parse(text)
    } catch (error) {
      console.warn('No logs file found or error reading:', error)
      return null
    }
  }

  /**
   * Write logs.json file to directory
   */
  static async writeLogsFile(
    dirHandle: FileSystemDirectoryHandle,
    logs: Record<string, unknown>
  ): Promise<void> {
    const fileHandle = await dirHandle.getFileHandle(LOG_FILE_NAME, {
      create: true,
    })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(logs, null, 2))
    await writable.close()
  }

  /**
   * Transform PDFManager results to log format
   */
  static transformResults(fileResult: FileResult): Record<string, unknown> {
    const transformed: Record<string, unknown> = {}

    if (
      typeof fileResult.results === 'object' &&
      fileResult.results !== null &&
      !Array.isArray(fileResult.results)
    ) {
      Object.entries(fileResult.results).forEach(([pageStr, pageData]) => {
        transformed[pageStr] = pageData
      })
    }

    return transformed
  }

  /**
   * Append file results to logs
   */
  static async appendFileResults(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    fileResult: FileResult
  ): Promise<void> {
    try {
      // Read existing logs
      let logs = (await this.readLogsFile(dirHandle)) || {}

      // Transform and add new results
      const transformedResults = this.transformResults(fileResult)
      logs[fileName] = transformedResults

      // Write updated logs
      await this.writeLogsFile(dirHandle, logs)
    } catch (error) {
      console.error('Error appending file results:', error)
      throw error
    }
  }

  /**
   * Verify logs and identify pages that need retry
   */
  static async verifyAndGetRetryPages(
    dirHandle: FileSystemDirectoryHandle
  ): Promise<VerificationData> {
    const filesToRetry: Record<string, number[]> = {}
    const bestCounts: Record<string, number> = {}

    try {
      const logs = await this.readLogsFile(dirHandle)
      if (!logs) {
        return { filesToRetry, bestCounts }
      }

      // Analyze each file's pages
      Object.entries(logs).forEach(([fileName, fileLog]) => {
        const fileLogObj = fileLog as Record<string, unknown>
        const pageCounts: Record<number, number> = {}
        let maxCount = 0

        // Count codes on each page
        Object.entries(fileLogObj).forEach(([pageStr, pageData]) => {
          const pageNum = parseInt(pageStr, 10)
          const pageObj = pageData as Record<string, unknown>
          const codes = (pageObj.codes as Array<unknown>) || []
          const codeCount = codes.length
          pageCounts[pageNum] = codeCount
          maxCount = Math.max(maxCount, codeCount)
        })

        // Find pages with inconsistent counts
        bestCounts[fileName] = maxCount
        const pagesToRetry: number[] = []

        Object.entries(pageCounts).forEach(([pageStr, count]) => {
          const pageNum = parseInt(pageStr, 10)
          // Retry if count is significantly less than max (more than 20% difference)
          if (maxCount > 0 && count < maxCount * 0.8) {
            pagesToRetry.push(pageNum)
          }
        })

        if (pagesToRetry.length > 0) {
          filesToRetry[fileName] = pagesToRetry.sort((a, b) => a - b)
        }
      })
    } catch (error) {
      console.error('Error during verification:', error)
    }

    return { filesToRetry, bestCounts }
  }
}

export { LogWriter }
