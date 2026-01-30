import { useState, useRef, useEffect } from 'react'

interface TimerReturn {
  elapsedTime: number
  isRunning: boolean
  startTimer: () => void
  stopTimer: () => void
  resetTimer: () => void
}

export const useTimer = (): TimerReturn => {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const timerInterval = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isRunning && startTime) {
      timerInterval.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
      }, 100)
    }

    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current)
      }
    }
  }, [isRunning, startTime])

  const startTimer = (): void => {
    setStartTime(Date.now())
    setIsRunning(true)
  }

  const stopTimer = (): void => {
    setIsRunning(false)
    if (timerInterval.current) {
      clearInterval(timerInterval.current)
    }
  }

  const resetTimer = (): void => {
    setElapsedTime(0)
    setStartTime(null)
    setIsRunning(false)
    if (timerInterval.current) {
      clearInterval(timerInterval.current)
    }
  }

  return {
    elapsedTime,
    isRunning,
    startTimer,
    stopTimer,
    resetTimer,
  }
}
