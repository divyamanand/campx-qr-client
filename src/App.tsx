import { FC, useRef, useState } from 'react'
import { useBatchProcessor } from './hooks/useBatchProcessor'
import { useTimer } from './hooks/useTimer'
import { useLogsDirectory } from './hooks/useLogsDirectory'
import { formatTime } from './utils/timeFormatter'
import Summary from './components/Summary'
import './App.css'

/**
 * App Component - Main application UI
 *
 * Single Responsibility: Render UI and handle user interactions
 * Logic separated into useBatchProcessor hook (SRP principle)
 */
const App: FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showSummary, setShowSummary] = useState(false)

  // Separate hooks for different responsibilities (SRP)
  const { logsDirectory, selectLogsDirectory } = useLogsDirectory()
  const { elapsedTime, startTimer, stopTimer, resetTimer } = useTimer()

  // Use custom hook for batch processing logic (SRP - separation of concerns)
  const {
    processing,
    results,
    currentBatch,
    batchProgress,
    filePageProgress,
    currentFileIndex,
    totalFiles,
    processBatch,
    getSummary,
  } = useBatchProcessor(3, logsDirectory) // Batch size of 3, pass logsDirectory

  /**
   * Handle file selection and start batch processing
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])

    // Check if logs directory is selected
    if (!logsDirectory) {
      const userWantsToSelect = window.confirm(
        'Logs directory not selected. Select one now?'
      )
      if (userWantsToSelect) {
        try {
          await selectLogsDirectory()
        } catch (error) {
          alert(`Error selecting logs directory: ${(error as Error).message}`)
          return
        }
      } else {
        alert('Logs directory is required for batch processing.')
        return
      }
    }

    // Start timer when processing begins
    const onStart = () => {
      resetTimer()
      startTimer()
    }

    // Stop timer when processing completes
    const onComplete = () => {
      stopTimer()
    }

    await processBatch(selectedFiles, onStart, onComplete)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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
              <div
                className={`stat-box ${summary.failedCount > 0 ? 'error' : ''}`}
              >
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

      {/* Logs Directory Selection */}
      <div style={styles.logsDirectorySection}>
        <button
          onClick={selectLogsDirectory}
          disabled={processing}
          style={{
            ...styles.logsDirectoryButton,
            opacity: processing ? 0.6 : 1,
            cursor: processing ? 'not-allowed' : 'pointer',
            backgroundColor: logsDirectory ? '#10b981' : '#6366f1',
          }}
        >
          {logsDirectory
            ? '✓ Logs Directory Selected'
            : '📁 Select Logs Directory'}
        </button>
        {!logsDirectory && (
          <p style={styles.logsDirectoryWarning}>
            ⚠️ Logs directory must be selected before processing
          </p>
        )}
      </div>

      {/* Upload Zone */}
      <div className="upload-zone">
        <label className="upload-btn">
          {processing ? 'Processing...' : 'Select Folder'}
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
          <h3 style={styles.batchTitle}>
            Processing Batch ({currentBatch.length} files)
          </h3>
          <div style={styles.batchCardsContainer}>
            {currentBatch.map((file) => {
              const progress = batchProgress[file.name]
              const status = progress?.status || 'queued'

              return (
                <div
                  key={file.name}
                  style={{
                    ...styles.batchCard,
                    borderColor:
                      status === 'processing'
                        ? '#6366f1'
                        : status === 'completed'
                          ? '#10b981'
                          : status === 'failed'
                            ? '#ef4444'
                            : '#e2e8f0',
                    backgroundColor:
                      status === 'processing'
                        ? '#f0f4ff'
                        : status === 'completed'
                          ? '#f0fdf4'
                          : status === 'failed'
                            ? '#fef2f2'
                            : '#f8fafc',
                  }}
                >
                  <div style={styles.batchCardContent}>
                    <div style={styles.batchCardIcon}>
                      {status === 'processing' && <div className="spinner" />}
                      {status === 'completed' && (
                        <span style={{ color: '#10b981', fontSize: '1.2rem' }}>
                          ✓
                        </span>
                      )}
                      {status === 'failed' && (
                        <span style={{ color: '#ef4444', fontSize: '1.2rem' }}>
                          ✕
                        </span>
                      )}
                      {status === 'queued' && (
                        <span style={{ color: '#94a3b8', fontSize: '1.2rem' }}>
                          ⏳
                        </span>
                      )}
                    </div>
                    <div style={styles.batchCardInfo}>
                      <div style={styles.batchCardName}>{file.name}</div>
                      <div style={styles.batchCardStatus}>
                        {status === 'processing' && (
                          <>
                            <span>Processing...</span>
                            {filePageProgress[file.name] && (
                              <span
                                style={{
                                  marginLeft: '8px',
                                  color: '#6366f1',
                                  fontWeight: '600',
                                }}
                              >
                                Page{' '}
                                {filePageProgress[file.name].currentPage} /{' '}
                                {filePageProgress[file.name].totalPages}
                              </span>
                            )}
                          </>
                        )}
                        {status === 'completed' && (
                          <>
                            <span>Completed</span>
                            {batchProgress[file.name]?.result?.totalPages && (
                              <span
                                style={{
                                  marginLeft: '8px',
                                  color: '#10b981',
                                  fontWeight: '600',
                                }}
                              >
                                {batchProgress[file.name].result.totalPages}{' '}
                                pages
                              </span>
                            )}
                          </>
                        )}
                        {status === 'failed' && 'Failed'}
                        {status === 'queued' && 'Queued'}
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
        <>
          {!showSummary ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.5rem',
                }}
              >
                <h2 style={styles.resultsTitle}>Batch Results</h2>
                <button
                  onClick={() => setShowSummary(true)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                  }}
                >
                  📊 View Summary
                </button>
              </div>
              <div className="cards-container">
                {results.map((result, index) => (
                  <div
                    key={index}
                    className={`card ${result.success ? 'completed' : 'error'}`}
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
                            : 'Failed'}
                        </span>
                      </div>
                    </div>
                    {!result.success && result.error && (
                      <div
                        style={{
                          padding: '1rem',
                          background: '#fef2f2',
                          color: '#dc2626',
                          fontSize: '0.85rem',
                        }}
                      >
                        Error: {result.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Summary
              results={results}
              elapsedTime={elapsedTime}
              logsDirectory={logsDirectory}
              onClose={() => setShowSummary(false)}
            />
          )}
        </>
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
const styles: Record<string, React.CSSProperties> = {
  progressContainer: {
    marginBottom: '2rem',
    marginTop: '1rem',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e2e8f0',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    transition: 'width 0.3s ease',
  },
  progressText: {
    marginTop: '0.5rem',
    fontSize: '0.85rem',
    color: '#64748b',
    textAlign: 'center',
  },
  resultsTitle: {
    fontSize: '1.5rem',
    fontWeight: '600',
    marginBottom: '1.5rem',
    color: '#0f172a',
  },
  emptyState: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '300px',
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    border: '1px dashed #e2e8f0',
    marginTop: '2rem',
  },
  emptyText: {
    fontSize: '1rem',
    color: '#64748b',
  },
  batchSection: {
    marginBottom: '2rem',
    marginTop: '2rem',
  },
  batchTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: '1rem',
    marginTop: '0',
  },
  batchCardsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
  },
  batchCard: {
    padding: '1rem',
    border: '2px solid',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
  },
  batchCardContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
  },
  batchCardIcon: {
    flexShrink: 0,
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchCardInfo: {
    flex: 1,
    minWidth: '0',
  },
  batchCardName: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#0f172a',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  batchCardStatus: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginTop: '2px',
  },
  logsDirectorySection: {
    marginBottom: '2rem',
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  logsDirectoryButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
  },
  logsDirectoryWarning: {
    marginTop: '0.75rem',
    fontSize: '0.9rem',
    color: '#f59e0b',
    fontWeight: '500',
    margin: '0.75rem 0 0 0',
  },
}

export default App
