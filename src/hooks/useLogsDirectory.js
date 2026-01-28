import { useState } from "react";
import { LogWriter } from "../LogWriter";

/**
 * useLogsDirectory - Custom hook for managing logs directory selection
 * 
 * Single Responsibility: Handle logs directory state and operations
 * Separates directory management from processing logic (SRP)
 * 
 * @returns {Object} Object containing:
 *   - logsDirectory: Current logs directory handle
 *   - selectLogsDirectory: Function to select logs directory
 *   - clearLogsDirectory: Function to clear the selected directory
 */
export const useLogsDirectory = () => {
  const [logsDirectory, setLogsDirectory] = useState(null);

  /**
   * Select logs directory for storing results
   * Opens a directory picker dialog
   */
  const selectLogsDirectory = async () => {
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
  const clearLogsDirectory = () => {
    setLogsDirectory(null);
  };

  return {
    logsDirectory,
    selectLogsDirectory,
    clearLogsDirectory,
  };
};
