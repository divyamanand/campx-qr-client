import { useState } from "react";
import { ERROR_TYPES, getErrorTypeInfo, ERROR_SEVERITY } from "./ErrorHandler";
import "./ErrorDisplay.css";

/**
 * ErrorDisplay - Component to display validation errors
 */
export function ErrorDisplay({ errors = [], fileName = "", structure = null, onDismiss = null }) {
  const [expandedError, setExpandedError] = useState(null);

  if (!errors || errors.length === 0) {
    return null;
  }

  const hasCritical = errors.some((e) => e.severity === ERROR_SEVERITY.CRITICAL);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case ERROR_SEVERITY.CRITICAL:
        return "#ff0000";
      case ERROR_SEVERITY.WARNING:
        return "#ffaa00";
      case ERROR_SEVERITY.INFO:
        return "#0066cc";
      default:
        return "#999999";
    }
  };

  return (
    <div className={`error-display ${hasCritical ? "critical" : "warning"}`}>
      <div className="error-header">
        <div className="error-title">
          <span className="error-icon">{hasCritical ? "🚨" : "⚠️"}</span>
          <span>
            {hasCritical ? "Critical Issues Found" : "Issues Found"} ({errors.length})
          </span>
        </div>
        <div className="file-info">
          <span className="file-name">{fileName}</span>
          {structure && (
            <span className="student-info">
              {structure.studentRoll} • {structure.courseCode}
            </span>
          )}
        </div>
      </div>

      <div className="error-list">
        {errors.map((error) => {
          const typeInfo = getErrorTypeInfo(error.type);
          const isExpanded = expandedError === error.id;

          return (
            <div key={error.id} className={`error-item severity-${error.severity}`}>
              <div
                className="error-item-header"
                onClick={() => setExpandedError(isExpanded ? null : error.id)}
              >
                <div className="error-item-title">
                  <span className="error-type-icon">{typeInfo.icon}</span>
                  <span className="error-type-label">{typeInfo.label}</span>
                </div>
                <span className={`expand-icon ${isExpanded ? "expanded" : ""}`}>▼</span>
              </div>

              {isExpanded && (
                <div className="error-item-details">
                  <p className="error-message">{error.message}</p>

                  <div className="error-metadata">
                    {error.details.pageNumber && (
                      <div className="meta-item">
                        <span className="meta-label">Page:</span>
                        <span className="meta-value">{error.details.pageNumber}</span>
                      </div>
                    )}

                    {error.details.studentRoll && (
                      <div className="meta-item">
                        <span className="meta-label">Roll No:</span>
                        <span className="meta-value">{error.details.studentRoll}</span>
                      </div>
                    )}

                    {error.details.courseCode && (
                      <div className="meta-item">
                        <span className="meta-label">Course:</span>
                        <span className="meta-value">{error.details.courseCode}</span>
                      </div>
                    )}
                  </div>

                  {/* Render error-type-specific details */}
                  {error.type === ERROR_TYPES.PAGE_COUNT_MISMATCH && (
                    <div className="error-details-section">
                      <h4>Page Count Details</h4>
                      <table className="details-table">
                        <tbody>
                          <tr>
                            <td>Expected:</td>
                            <td className="value">{error.details.expectedPages} pages</td>
                          </tr>
                          <tr>
                            <td>Found:</td>
                            <td className="value error-text">
                              {error.details.actualPages} pages
                            </td>
                          </tr>
                          <tr>
                            <td>Difference:</td>
                            <td className="value error-text">
                              {Math.abs(error.details.expectedPages - error.details.actualPages)}{" "}
                              page(s){" "}
                              {error.details.actualPages < error.details.expectedPages
                                ? "missing"
                                : "extra"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {error.type === ERROR_TYPES.PARTIAL_DETECTION && (
                    <div className="error-details-section">
                      <h4>Detection Details</h4>
                      <table className="details-table">
                        <tbody>
                          <tr>
                            <td>Expected:</td>
                            <td className="value">{error.details.expectedCodes} code(s)</td>
                          </tr>
                          <tr>
                            <td>Found:</td>
                            <td className="value error-text">{error.details.foundCodes} code(s)</td>
                          </tr>
                          {error.details.missing && error.details.missing.length > 0 && (
                            <tr>
                              <td>Missing:</td>
                              <td className="value error-text">
                                {error.details.missing.join(", ")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {error.type === ERROR_TYPES.QR_NOT_DETECTED && (
                    <div className="error-details-section">
                      <h4>Detection Status</h4>
                      <table className="details-table">
                        <tbody>
                          <tr>
                            <td>Expected:</td>
                            <td className="value">{error.details.expectedCodes} code(s)</td>
                          </tr>
                          <tr>
                            <td>Found:</td>
                            <td className="value error-text">None</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="error-recommendation">
                        QR code is completely missing from this page. Check if the PDF page is
                        blank or corrupted.
                      </p>
                    </div>
                  )}

                  {error.type === ERROR_TYPES.TAMPERING_DETECTED && (
                    <div className="error-details-section">
                      <h4>Tampering Analysis</h4>
                      <table className="details-table">
                        <tbody>
                          <tr>
                            <td>Expected Format:</td>
                            <td className="value">{error.details.expectedFormat}</td>
                          </tr>
                          <tr>
                            <td>Found Formats:</td>
                            <td className="value error-text">
                              {error.details.foundFormats || "None"}
                            </td>
                          </tr>
                          <tr>
                            <td>Reason:</td>
                            <td className="value error-text">{error.details.reason}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {error.type === ERROR_TYPES.QR_DAMAGED && (
                    <div className="error-details-section">
                      <h4>Quality Assessment</h4>
                      <table className="details-table">
                        <tbody>
                          <tr>
                            <td>Codes Found:</td>
                            <td className="value">{error.details.codesFound}</td>
                          </tr>
                          <tr>
                            <td>Scale Used:</td>
                            <td className="value">{error.details.scale}x</td>
                          </tr>
                          <tr>
                            <td>Rotation Applied:</td>
                            <td className="value">{error.details.rotated ? "Yes" : "No"}</td>
                          </tr>
                          <tr>
                            <td>Scan Attempts:</td>
                            <td className="value">{error.details.attempts}</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="error-recommendation">
                        QR code quality is degraded. May be damaged, faded, or poorly printed.
                      </p>
                    </div>
                  )}

                  {error.type === ERROR_TYPES.PDF_EDITED && (
                    <div className="error-details-section">
                      <h4>Edit Detection</h4>
                      <table className="details-table">
                        <tbody>
                          <tr>
                            <td>Attempts Needed:</td>
                            <td className="value warning-text">{error.details.attemptsNeeded}</td>
                          </tr>
                          <tr>
                            <td>Rotation Required:</td>
                            <td className="value warning-text">
                              {error.details.requiredRotation ? "Yes" : "No"}
                            </td>
                          </tr>
                          <tr>
                            <td>Final Scale:</td>
                            <td className="value">{error.details.finalScale}x</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="error-recommendation">
                        Multiple scale adjustments needed. PDF may have been edited or
                        republished.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onDismiss && (
        <div className="error-footer">
          <button className="dismiss-btn" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * ErrorSummary - Shows a quick overview of all errors
 */
export function ErrorSummary({ errorsSummary = {} }) {
  if (!errorsSummary || errorsSummary.totalErrors === 0) {
    return null;
  }

  const { totalErrors, critical, warnings, info } = errorsSummary;

  return (
    <div className="error-summary">
      <div className="summary-item critical" title={`${critical} critical error(s)`}>
        <span className="icon">🚨</span>
        <span className="count">{critical}</span>
      </div>
      <div className="summary-item warning" title={`${warnings} warning(s)`}>
        <span className="icon">⚠️</span>
        <span className="count">{warnings}</span>
      </div>
      <div className="summary-item info" title={`${info} info message(s)`}>
        <span className="icon">ℹ️</span>
        <span className="count">{info}</span>
      </div>
      <div className="summary-total">
        <span>{totalErrors} issue(s)</span>
      </div>
    </div>
  );
}
