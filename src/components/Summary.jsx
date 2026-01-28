import { useEffect, useState } from "react"
import { useSummarizer } from "../hooks/useSummarizer"
import "./Summary.css"

/**
 * Summary Component - Displays processing results and log summaries
 * 
 * Single Responsibility: Display and format summary data
 * Uses useSummarizer hook for data formatting logic (SRP principle)
 */
const Summary = ({ results, elapsedTime, logsDirectory, onClose }) => {
  const { summarizeLogs, formatLogSummary } = useSummarizer(logsDirectory)
  const [summaryData, setSummaryData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load and format summary data when component mounts or results change
  useEffect(() => {
    const loadSummary = async () => {
      try {
        setLoading(true)
        const data = await summarizeLogs()
        setSummaryData(data)
      } catch (err) {
        setError(err.message)
        console.error("Failed to load summary:", err)
      } finally {
        setLoading(false)
      }
    }

    loadSummary()
  }, [results, summarizeLogs])

  if (loading) {
    return (
      <div className="summary-container">
        <div className="summary-loading">
          <div className="spinner" />
          <p>Loading summary...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="summary-container">
        <div className="summary-error">
          <h3>⚠️ Error Loading Summary</h3>
          <p>{error}</p>
          <button onClick={onClose} className="summary-btn-close">
            Close
          </button>
        </div>
      </div>
    )
  }

  // Calculate aggregate statistics
  const totalCodes = summaryData.reduce((sum, log) => sum + (log.totalCodesCount || 0), 0)
  const totalQRCodes = summaryData.reduce((sum, log) => sum + (log.qrCodesCount || 0), 0)
  const totalBarcodes = summaryData.reduce((sum, log) => sum + (log.barcodesCount || 0), 0)
  const filesProcessed = summaryData.length
  const successCount = results.filter((r) => r.success).length
  const failedCount = results.filter((r) => !r.success).length

  return (
    <div className="summary-container">
      <div className="summary-header">
        <div className="summary-title-section">
          <h2>📊 Processing Summary</h2>
          <p className="summary-subtitle">Batch processing completed</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="summary-close-btn" title="Close summary">
            ✕
          </button>
        )}
      </div>

      {/* Aggregate Stats */}
      <div className="summary-stats-grid">
        <div className="summary-stat-card">
          <div className="stat-icon">📁</div>
          <div className="stat-content">
            <div className="stat-value">{filesProcessed}</div>
            <div className="stat-label">Files Processed</div>
          </div>
        </div>

        <div className="summary-stat-card success">
          <div className="stat-icon">✓</div>
          <div className="stat-content">
            <div className="stat-value">{successCount}</div>
            <div className="stat-label">Successful</div>
          </div>
        </div>

        <div className={`summary-stat-card ${failedCount > 0 ? "error" : ""}`}>
          <div className="stat-icon">{failedCount > 0 ? "✕" : "✓"}</div>
          <div className="stat-content">
            <div className="stat-value">{failedCount}</div>
            <div className="stat-label">Failed</div>
          </div>
        </div>

        <div className="summary-stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-content">
            <div className="stat-value">{elapsedTime}s</div>
            <div className="stat-label">Total Time</div>
          </div>
        </div>
      </div>

      {/* Code Detection Stats */}
      <div className="summary-codes-section">
        <h3>🔍 Detected Codes</h3>
        <div className="summary-codes-grid">
          <div className="code-stat">
            <div className="code-count">{totalCodes}</div>
            <div className="code-label">Total Codes</div>
          </div>
          <div className="code-stat qr">
            <div className="code-count">{totalQRCodes}</div>
            <div className="code-label">QR Codes</div>
          </div>
          <div className="code-stat barcode">
            <div className="code-count">{totalBarcodes}</div>
            <div className="code-label">Barcodes</div>
          </div>
        </div>
      </div>

      {/* Detailed Results Table */}
      {summaryData.length > 0 && (
        <div className="summary-details-section">
          <h3>📋 Detailed Results</h3>
          <div className="summary-table-wrapper">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th className="text-center">Total Codes</th>
                  <th className="text-center">QR Codes</th>
                  <th className="text-center">Barcodes</th>
                  <th className="text-center">Codes/Page</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.map((log, index) => (
                  <tr key={index} className="summary-table-row">
                    <td className="filename-cell">{log.fileName}</td>
                    <td className="text-center">{log.totalCodesCount || 0}</td>
                    <td className="text-center">
                      <span className="badge qr-badge">{log.qrCodesCount || 0}</span>
                    </td>
                    <td className="text-center">
                      <span className="badge barcode-badge">{log.barcodesCount || 0}</span>
                    </td>
                    <td className="text-center">
                      {log.codesOnEveryPage && log.codesOnEveryPage.length > 0
                        ? log.codesOnEveryPage.join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="summary-actions">
        <button
          onClick={() => {
            // Copy summary to clipboard
            const summaryText = `Processing Summary\nFiles: ${filesProcessed}\nSuccessful: ${successCount}\nFailed: ${failedCount}\nTotal Codes: ${totalCodes}\nQR Codes: ${totalQRCodes}\nBarcodes: ${totalBarcodes}\nTime: ${elapsedTime}s`
            navigator.clipboard.writeText(summaryText)
            alert("Summary copied to clipboard!")
          }}
          className="summary-btn summary-btn-copy"
        >
          📋 Copy Summary
        </button>
        {onClose && (
          <button onClick={onClose} className="summary-btn summary-btn-close">
            Close
          </button>
        )}
      </div>
    </div>
  )
}

export default Summary
