import { useState } from 'react'
import { createPDFManager } from '../PDFManager'
import { LogWriter } from '../LogWriter'

interface FileResult {
  fileName: string
  success: boolean
  totalPages: number
  results: Record<string, unknown>
  error: string | null
}

interface BatchProgress {
  status: 'processing' | 'completed' | 'failed' | 'queued'
  result: FileResult | null
}

interface FilePageProgress {
  currentPage: number
  totalPages: number
}

interface Summary {
  totalPages: number
  successCount: number
  failedCount: number
}

export const useBatchProcessor = (
  batchSize = 5,
  logsDirectory: FileSystemDirectoryHandle | null = null
) => {
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<FileResult[]>([])
  const [currentBatch, setCurrentBatch] = useState<File[]>([])
  const [batchProgress, setBatchProgress] = useState<Record<string, BatchProgress>>({})
  const [filePageProgress, setFilePageProgress] = useState<
    Record<string, FilePageProgress>
  >({})
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)

  const processFileWithManager = async (
    file: File,
    pdfManager: ReturnType<typeof createPDFManager>
  ): Promise<FileResult> => {
    try {
      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: { status: 'processing', result: null },
      }))

      setFilePageProgress((prev) => ({
        ...prev,
        [file.name]: { currentPage: 0, totalPages: 0 },
      }))

      const fileResult = await pdfManager.processFile(
        file,
        (pageInfo: { pageNumber: number; totalPages: number }) => {
          setFilePageProgress((prev) => ({
            ...prev,
            [file.name]: {
              currentPage: pageInfo.pageNumber,
              totalPages: pageInfo.totalPages,
            },
          }))
        }
      )

      const result: FileResult = {
        fileName: file.name,
        success: fileResult.success,
        totalPages: fileResult.totalPages,
        results: fileResult.results,
        error: fileResult.error || null,
      }

      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: {
          status: fileResult.success ? 'completed' : 'failed',
          result,
        },
      }))

      if (logsDirectory) {
        await LogWriter.appendFileResults(logsDirectory, file.name, result)
      }

      return result
    } catch (error) {
      const result: FileResult = {
        fileName: file.name,
        success: false,
        totalPages: 0,
        results: {},
        error: (error as Error).message,
      }

      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: { status: 'failed', result },
      }))

      if (logsDirectory) {
        await LogWriter.appendFileResults(logsDirectory, file.name, result)
      }

      return result
    }
  }

  const processBatch = async (
    selectedFiles: File[],
    onStart?: () => void,
    onComplete?: () => void
  ): Promise<void> => {
    if (selectedFiles.length === 0) {
      alert('No files selected')
      return
    }

    if (!logsDirectory) {
      alert('Logs directory is required for batch processing.')
      return
    }

    setTotalFiles(selectedFiles.length)
    setProcessing(true)
    setResults([])
    setCurrentFileIndex(0)
    setBatchProgress({})
    setFilePageProgress({})

    if (onStart) onStart()

    const processedResults: FileResult[] = []

    try {
      for (let i = 0; i < selectedFiles.length; i += batchSize) {
        const batch = selectedFiles.slice(i, i + batchSize)

        setCurrentBatch(batch)
        setBatchProgress({})
        setFilePageProgress({})

        const pdfManager = createPDFManager()

        const batchPromises = batch.map((file) =>
          processFileWithManager(file, pdfManager)
        )
        const batchResults = await Promise.all(batchPromises)

        processedResults.push(...batchResults)
        setCurrentFileIndex(Math.min(i + batchSize, selectedFiles.length))
        setResults([...processedResults])
      }
    } catch (error) {
      console.error('Batch processing error:', error)
      alert(`Error during batch processing: ${(error as Error).message}`)
    } finally {
      setProcessing(false)
      setCurrentBatch([])
      setBatchProgress({})
      setFilePageProgress({})

      if (onComplete) onComplete()
    }
  }

  const getSummary = (): Summary => {
    let totalPages = 0
    let successCount = 0
    let failedCount = 0

    results.forEach((result) => {
      totalPages += result.totalPages || 0
      if (result.success) {
        successCount++
      } else {
        failedCount++
      }
    })

    return { totalPages, successCount, failedCount }
  }

  const reset = (): void => {
    setProcessing(false)
    setResults([])
    setCurrentBatch([])
    setBatchProgress({})
    setFilePageProgress({})
    setCurrentFileIndex(0)
    setTotalFiles(0)
  }

  return {
    processing,
    results,
    currentBatch,
    batchProgress,
    filePageProgress,
    currentFileIndex,
    totalFiles,
    processBatch,
    getSummary,
    reset,
  }
}
