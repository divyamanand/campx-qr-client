import { useState, useRef, useEffect } from "react"
import { createPDFManager } from "./PDFManager"
import "./App.css"

const App = () => {
  // File processing state
  const [files, setFiles] = useState([])
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState([])
  const [currentBatch, setCurrentBatch] = useState([])
  const [batchProgress, setBatchProgress] = useState({})
  const [filePageProgress, setFilePageProgress] = useState({})
  
  // Counter and timer state
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [startTime, setStartTime] = useState(null)
  
  // Refs for tracking
  const timerInterval = useRef(null)
  const fileInputRef = useRef(null)

  // Timer effect
  useEffect(() => {
    if (processing && startTime) {
      timerInterval.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
      }, 100)
    }
    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current)
      }
    }
  }, [processing, startTime])

  /**
   * Format elapsed time as MM:SS
   */
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  /**
   * Process a single file and return results
   */
  const processFileWithManager = async (file) => {
    try {
      // Mark file as processing
      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: { status: "processing", result: null },
      }))

      // Initialize page progress tracking
      setFilePageProgress((prev) => ({
        ...prev,
        [file.name]: { currentPage: 0, totalPages: 0 },
      }))

      const pdfManager = createPDFManager()
      
      // Pass callback to track page completion
      const fileResult = await pdfManager.processFile(
        file,
        (pageInfo) => {
          // Update page progress in real-time
          setFilePageProgress((prev) => ({
            ...prev,
            [file.name]: {
              currentPage: pageInfo.pageNumber,
              totalPages: pageInfo.totalPages,
            },
          }))
        }
      )

      const result = {
        fileName: file.name,
        success: fileResult.success,
        totalPages: fileResult.totalPages,
        results: fileResult.results,
        error: fileResult.error || null,
      }

      // Mark file as complete
      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: { status: fileResult.success ? "completed" : "failed", result },
      }))

      return result
    } catch (error) {
      const result = {
        fileName: file.name,
        success: false,
        totalPages: 0,
        results: {},
        error: error.message,
      }

      // Mark file as failed
      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: { status: "failed", result },
      }))

      return result
    }
  }

  /**
   * Handle file selection and start batch processing
   */
  const handleFileSelect = async (e) => {
    const selectedFiles = Array.from(e.target.files)
    
    if (selectedFiles.length === 0) {
      alert("No files selected")
      return
    }

    setFiles(selectedFiles)
    setTotalFiles(selectedFiles.length)
    setProcessing(true)
    setResults([])
    setCurrentFileIndex(0)
    setElapsedTime(0)
    setStartTime(Date.now())
    setBatchProgress({})
    setFilePageProgress({})

    const processedResults = []
    const BATCH_SIZE = 3

    try {
      // Process files in batches of 5
      for (let i = 0; i < selectedFiles.length; i += BATCH_SIZE) {
        const batch = selectedFiles.slice(i, i + BATCH_SIZE)
        
        // Set current batch for display
        setCurrentBatch(batch)
        setBatchProgress({})
        setFilePageProgress({})
        
        // Process batch in parallel
        const batchPromises = batch.map((file) => processFileWithManager(file))
        const batchResults = await Promise.all(batchPromises)
        
        processedResults.push(...batchResults)
        setCurrentFileIndex(Math.min(i + BATCH_SIZE, selectedFiles.length))
        setResults([...processedResults])
      }
    } catch (error) {
      console.error("Batch processing error:", error)
      alert("Error during batch processing: " + error.message)
    } finally {
      setProcessing(false)
      setCurrentBatch([])
      setBatchProgress({})
      setFilePageProgress({})
      if (timerInterval.current) {
        clearInterval(timerInterval.current)
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  /**
   * Calculate summary statistics
   */
  const getSummary = () => {
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

  const summary = getSummary()

  return (
    <div className="app-container">
      {/* Header with title and stats */}
      <div className="header">
        <div className="header-main">
          <h1>📄 PDF QR Code Scanner</h1>
          <p>Batch process PDFs and extract QR codes</p>
        </div>

        {/* Top right: Counter and Timer */}
        <div className="header-stats">
          {processing && (
            <>
              <div className="stat-box">
                <div className="stat-value">{currentFileIndex}</div>
                <div className="stat-label">Files Processed</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{totalFiles}</div>
                <div className="stat-label">Total Files</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{formatTime(elapsedTime)}</div>
                <div className="stat-label">Elapsed Time</div>
              </div>
            </>
          )}
          {!processing && results.length > 0 && (
            <>
              <div className="stat-box">
                <div className="stat-value">{summary.successCount}</div>
                <div className="stat-label">Success</div>
              </div>
              <div className={`stat-box ${summary.failedCount > 0 ? "error" : ""}`}>
                <div className="stat-value">{summary.failedCount}</div>
                <div className="stat-label">Failed</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{summary.totalPages}</div>
                <div className="stat-label">Total Pages</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{formatTime(elapsedTime)}</div>
                <div className="stat-label">Total Time</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Upload Zone */}
      <div className="upload-zone">
        <label className="upload-btn">
          {processing ? "Processing..." : "Select Folder"}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            webkitdirectory="true"
            onChange={handleFileSelect}
            disabled={processing}
          />
        </label>
      </div>

      {/* Current Batch Processing Cards */}
      {processing && currentBatch.length > 0 && (
        <div style={styles.batchSection}>
          <h3 style={styles.batchTitle}>Processing Batch ({currentBatch.length} files)</h3>
          <div style={styles.batchCardsContainer}>
            {currentBatch.map((file) => {
              const progress = batchProgress[file.name]
              const status = progress?.status || "queued"
              
              return (
                <div
                  key={file.name}
                  style={{
                    ...styles.batchCard,
                    borderColor:
                      status === "processing"
                        ? "#6366f1"
                        : status === "completed"
                        ? "#10b981"
                        : status === "failed"
                        ? "#ef4444"
                        : "#e2e8f0",
                    backgroundColor:
                      status === "processing"
                        ? "#f0f4ff"
                        : status === "completed"
                        ? "#f0fdf4"
                        : status === "failed"
                        ? "#fef2f2"
                        : "#f8fafc",
                  }}
                >
                  <div style={styles.batchCardContent}>
                    <div style={styles.batchCardIcon}>
                      {status === "processing" && (
                        <div className="spinner" />
                      )}
                      {status === "completed" && (
                        <span style={{ color: "#10b981", fontSize: "1.2rem" }}>✓</span>
                      )}
                      {status === "failed" && (
                        <span style={{ color: "#ef4444", fontSize: "1.2rem" }}>✕</span>
                      )}
                      {status === "queued" && (
                        <span style={{ color: "#94a3b8", fontSize: "1.2rem" }}>⏳</span>
                      )}
                    </div>
                    <div style={styles.batchCardInfo}>
                      <div style={styles.batchCardName}>{file.name}</div>
                      <div style={styles.batchCardStatus}>
                        {status === "processing" && (
                          <>
                            <span>Processing...</span>
                            {filePageProgress[file.name] && (
                              <span style={{ marginLeft: "8px", color: "#6366f1", fontWeight: "600" }}>
                                Page {filePageProgress[file.name].currentPage} / {filePageProgress[file.name].totalPages}
                              </span>
                            )}
                          </>
                        )}
                        {status === "completed" && (
                          <>
                            <span>Completed</span>
                            {batchProgress[file.name]?.result?.totalPages && (
                              <span style={{ marginLeft: "8px", color: "#10b981", fontWeight: "600" }}>
                                {batchProgress[file.name].result.totalPages} pages
                              </span>
                            )}
                          </>
                        )}
                        {status === "failed" && "Failed"}
                        {status === "queued" && "Queued"}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {processing && totalFiles > 0 && (
        <div style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${(currentFileIndex / totalFiles) * 100}%`,
              }}
            />
          </div>
          <p style={styles.progressText}>
            Processing: {currentFileIndex} / {totalFiles} files
          </p>
        </div>
      )}

      {/* Results Grid */}
      {results.length > 0 && !processing && (
        <div>
          <h2 style={styles.resultsTitle}>Batch Results</h2>
          <div className="cards-container">
            {results.map((result, index) => (
              <div
                key={index}
                className={`card ${
                  result.success ? "completed" : "error"
                }`}
              >
                <div className="card-header">
                  <div className="header-top">
                    <div className="filename">{result.fileName}</div>
                    <div className="status-indicator">
                      {result.success ? (
                        <span className="icon-success">✓</span>
                      ) : (
                        <span className="icon-error">✕</span>
                      )}
                    </div>
                  </div>
                  <div className="meta-info">
                    <span>
                      {result.success
                        ? `${result.totalPages} pages`
                        : "Failed"}
                    </span>
                  </div>
                </div>
                {!result.success && result.error && (
                  <div
                    style={{
                      padding: "1rem",
                      background: "#fef2f2",
                      color: "#dc2626",
                      fontSize: "0.85rem",
                    }}
                  >
                    Error: {result.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!processing && results.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>
            Select a folder to begin batch processing
          </p>
        </div>
      )}
    </div>
  )
}

// Inline styles for layout elements
const styles = {
  progressContainer: {
    marginBottom: "2rem",
    marginTop: "1rem",
  },
  progressBar: {
    width: "100%",
    height: "8px",
    backgroundColor: "#e2e8f0",
    borderRadius: "4px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#6366f1",
    transition: "width 0.3s ease",
  },
  progressText: {
    marginTop: "0.5rem",
    fontSize: "0.85rem",
    color: "#64748b",
    textAlign: "center",
  },
  resultsTitle: {
    fontSize: "1.5rem",
    fontWeight: "600",
    marginBottom: "1.5rem",
    color: "#0f172a",
  },
  emptyState: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "300px",
    backgroundColor: "#f8fafc",
    borderRadius: "12px",
    border: "1px dashed #e2e8f0",
    marginTop: "2rem",
  },
  emptyText: {
    fontSize: "1rem",
    color: "#64748b",
  },
  batchSection: {
    marginBottom: "2rem",
    marginTop: "2rem",
  },
  batchTitle: {
    fontSize: "1rem",
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: "1rem",
    marginTop: "0",
  },
  batchCardsContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "1rem",
  },
  batchCard: {
    padding: "1rem",
    border: "2px solid",
    borderRadius: "8px",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
  },
  batchCardContent: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
  },
  batchCardIcon: {
    flexShrink: 0,
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  batchCardInfo: {
    flex: 1,
    minWidth: "0",
  },
  batchCardName: {
    fontSize: "0.9rem",
    fontWeight: "600",
    color: "#0f172a",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  batchCardStatus: {
    fontSize: "0.75rem",
    color: "#64748b",
    marginTop: "2px",
  },
}

export default App