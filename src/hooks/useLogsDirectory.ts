import { useState } from "react";
import { LogWriter } from "../LogWriter";

interface UseLogsDirectoryReturn {
  logsDirectory: FileSystemDirectoryHandle | null;
  selectLogsDirectory: () => Promise<FileSystemDirectoryHandle>;
  clearLogsDirectory: () => void;
}

/**
 * useLogsDirectory - Custom hook for managing logs directory selection
 *
 * Single Responsibility: Handle logs directory state and operations
 * Separates directory management from processing logic (SRP)
 *
 * @returns {UseLogsDirectoryReturn} Object containing:
 *   - logsDirectory: Current logs directory handle
 *   - selectLogsDirectory: Function to select logs directory
 *   - clearLogsDirectory: Function to clear the selected directory
 */
export const useLogsDirectory = (): UseLogsDirectoryReturn => {
  const [logsDirectory, setLogsDirectory] = useState<FileSystemDirectoryHandle | null>(null);

  /**
   * Select logs directory for storing results
   * Opens a directory picker dialog
   */
  const selectLogsDirectory = async (): Promise<FileSystemDirectoryHandle> => {
    try {
      const dirHandle = await LogWriter.selectLogsDirectory();
      setLogsDirectory(dirHandle);
      return dirHandle;
    } catch (error) {
      console.error("Error selecting logs directory:", error);
      throw error;
    }
  };

  /**
   * Clear the currently selected logs directory
   */
  const clearLogsDirectory = (): void => {
    setLogsDirectory(null);
  };

  return {
    logsDirectory,
    selectLogsDirectory,
    clearLogsDirectory,
  };
};