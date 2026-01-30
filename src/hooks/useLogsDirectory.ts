import { useState } from 'react'
import { LogWriter } from '../LogWriter'

interface LogsDirectoryReturn {
  logsDirectory: FileSystemDirectoryHandle | null
  selectLogsDirectory: () => Promise<FileSystemDirectoryHandle>
  clearLogsDirectory: () => void
}

export const useLogsDirectory = (): LogsDirectoryReturn => {
  const [logsDirectory, setLogsDirectory] =
    useState<FileSystemDirectoryHandle | null>(null)

  const selectLogsDirectory = async (): Promise<FileSystemDirectoryHandle> => {
    try {
      const dirHandle = await LogWriter.selectLogsDirectory()
      setLogsDirectory(dirHandle)
      return dirHandle
    } catch (error) {
      console.error('Error selecting logs directory:', error)
      throw error
    }
  }

  const clearLogsDirectory = (): void => {
    setLogsDirectory(null)
  }

  return {
    logsDirectory,
    selectLogsDirectory,
    clearLogsDirectory,
  }
}
