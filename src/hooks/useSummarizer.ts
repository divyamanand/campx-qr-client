import { useCallback } from 'react'
import { LogWriter } from '../LogWriter'

interface CodeObject {
  QRCode?: boolean
  Code128?: boolean
  [key: string]: unknown
}

interface PageData {
  codes?: CodeObject[]
  success?: boolean
  errors?: unknown[]
  [key: string]: unknown
}

interface LogSummary {
  fileName: string
  totalCodesCount: number
  qrCodesCount: number
  barcodesCount: number
  codesOnEveryPage: number[]
  hasErrors: boolean
}

interface VerificationData {
  filesToRetry: Record<string, number[]>
  bestCounts: Record<string, number>
}

interface SummarizerReturn {
  summarizeLogs: () => Promise<{
    summary: LogSummary[]
    verification: VerificationData
  }>
  formatLogSummary: (
    fileName: string,
    fileLog: Record<string, PageData>
  ) => LogSummary
  exportSummary: (summary: LogSummary[]) => Promise<LogSummary[]>
}

export const useSummarizer = (
  logsDirectory: FileSystemDirectoryHandle | null
): SummarizerReturn => {
  const formatLogSummary = useCallback(
    (fileName: string, fileLog: Record<string, PageData>): LogSummary => {
      let totalCodesCount = 0
      let qrCodesCount = 0
      let barcodesCount = 0
      const codesOnEveryPage: number[] = []
      let hasErrors = false

      Object.entries(fileLog).forEach(([_pageNumber, pageData]) => {
        if (pageData.codes && Array.isArray(pageData.codes)) {
          const pageCodes = pageData.codes.length
          codesOnEveryPage.push(pageCodes)
          totalCodesCount += pageCodes

          pageData.codes.forEach((codeObj) => {
            if (codeObj.QRCode) {
              qrCodesCount++
            }
            if (codeObj.Code128) {
              barcodesCount++
            }
          })
        }

        if (
          !pageData.success ||
          (pageData.errors && pageData.errors.length > 0)
        ) {
          hasErrors = true
        }
      })

      return {
        fileName,
        totalCodesCount,
        qrCodesCount,
        barcodesCount,
        codesOnEveryPage,
        hasErrors,
      }
    },
    []
  )

  const summarizeLogs = useCallback(async () => {
    try {
      if (!logsDirectory) {
        throw new Error(
          'Logs directory not selected. Please select a logs directory first.'
        )
      }

      const logsData = await LogWriter.readLogsFile(logsDirectory)

      if (!logsData || Object.keys(logsData).length === 0) {
        console.warn('No logs found')
        return {
          summary: [],
          verification: { filesToRetry: {}, bestCounts: {} },
        }
      }

      const summary = Object.entries(logsData).map(([fileName, fileLog]) => {
        return formatLogSummary(fileName, fileLog as Record<string, PageData>)
      })

      const verification =
        await LogWriter.verifyAndGetRetryPages(logsDirectory)

      console.table(summary)

      if (Object.keys(verification.filesToRetry).length > 0) {
        console.warn(
          'Files with pages requiring retry:',
          verification.filesToRetry
        )
      }

      return { summary, verification }
    } catch (error) {
      console.error('Error summarizing logs:', error)
      throw error
    }
  }, [logsDirectory, formatLogSummary])

  const exportSummary = useCallback(
    async (summary: LogSummary[]): Promise<LogSummary[]> => {
      try {
        if (!summary || summary.length === 0) {
          console.warn('No summary data to export')
          return []
        }

        console.log('Summary ready for export:', summary)
        return summary
      } catch (error) {
        console.error('Error exporting summary:', error)
        throw error
      }
    },
    []
  )

  return {
    summarizeLogs,
    formatLogSummary,
    exportSummary,
  }
}
