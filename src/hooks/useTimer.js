import { useState, useRef, useEffect } from "react";

/**
 * useTimer - Custom hook for managing elapsed time tracking
 * 
 * Single Responsibility: Handle timer state and operations
 * Separates timing logic from processing logic (SRP)
 * 
 * @returns {Object} Object containing:
 *   - elapsedTime: Current elapsed time in seconds
 *   - startTimer: Function to start the timer
 *   - stopTimer: Function to stop the timer
 *   - resetTimer: Function to reset the timer
 */
export const useTimer = () => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const timerInterval = useRef(null);

  // Timer effect - runs when timer is active
  useEffect(() => {
    if (isRunning && startTime) {
      timerInterval.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 100);
    }

    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    };
  }, [isRunning, startTime]);

  /**
   * Start the timer
   */
  const startTimer = () => {
    setStartTime(Date.now());
    setIsRunning(true);
  };

  /**
   * Stop the timer
   */
  const stopTimer = () => {
    setIsRunning(false);
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
  };

  /**
   * Reset the timer to zero
   */
  const resetTimer = () => {
    setElapsedTime(0);
    setStartTime(null);
    setIsRunning(false);
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
  };

  return {
    elapsedTime,
    isRunning,
    startTimer,
    stopTimer,
    resetTimer,
  };
};
