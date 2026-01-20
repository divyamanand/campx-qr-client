import { useState, useRef, useEffect } from "react";

/**
 * Logger Component - Displays live processing status
 * Shows: fileName, pageNumber, status, attemptCount, rotation, scale changes
 * Expandable/collapsible with optional auto-scroll and jump-to-end
 */
export function Logger({ logs, maxHeight = 300 }) {
  const [expanded, setExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const logEndRef = useRef(null);
  const logBodyRef = useRef(null);

  const toggleExpand = () => setExpanded(!expanded);
  const toggleAutoScroll = (e) => {
    e.stopPropagation();
    setAutoScroll(!autoScroll);
  };

  const scrollToEnd = (e) => {
    e.stopPropagation();
    if (logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
    }
  };

  // Auto-scroll when enabled and new logs arrive
  useEffect(() => {
    if (autoScroll && expanded && logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
    }
  }, [logs, autoScroll, expanded]);

  if (!logs || logs.length === 0) {
    return (
      <div className="logger-container">
        <div className="logger-header" onClick={toggleExpand}>
          <span className="logger-title">Processing Log</span>
          <div className="logger-header-right">
            <span className="logger-count">0 entries</span>
            <span className={`logger-chevron ${expanded ? "rotate" : ""}`}>&#9660;</span>
          </div>
        </div>
        {expanded && (
          <div className="logger-body empty" style={{ maxHeight }}>
            <span className="logger-empty-msg">No activity yet. Upload PDFs to begin scanning.</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`logger-container ${expanded ? "expanded" : ""}`}>
      <div className="logger-header" onClick={toggleExpand}>
        <span className="logger-title">Processing Log</span>
        <div className="logger-header-right">
          <span className="logger-count">{logs.length} entries</span>
          {expanded && (
            <div className="logger-controls" onClick={(e) => e.stopPropagation()}>
              <button
                className={`logger-btn ${autoScroll ? "active" : ""}`}
                onClick={toggleAutoScroll}
                title="Toggle auto-scroll"
              >
                Auto
              </button>
              <button
                className="logger-btn"
                onClick={scrollToEnd}
                title="Jump to end"
              >
                End
              </button>
            </div>
          )}
          <span className={`logger-chevron ${expanded ? "rotate" : ""}`}>&#9660;</span>
        </div>
      </div>
      {expanded && (
        <div className="logger-body" style={{ maxHeight }} ref={logBodyRef}>
          {logs.map((log, index) => (
            <LogEntry key={index} log={log} index={index} />
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}

function LogEntry({ log, index }) {
  const getStatusClass = (type) => {
    switch (type) {
      case "success":
        return "log-success";
      case "error":
        return "log-error";
      case "warning":
        return "log-warning";
      case "info":
        return "log-info";
      case "retry":
        return "log-retry";
      default:
        return "log-info";
    }
  };

  const getStatusIcon = (type) => {
    switch (type) {
      case "success":
        return "\u2713";
      case "error":
        return "\u2717";
      case "warning":
        return "\u26A0";
      case "retry":
        return "\u21BB";
      case "start":
        return "\u25B6";
      case "complete":
        return "\u2714";
      default:
        return "\u2022";
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className={`log-entry ${getStatusClass(log.type)}`}>
      <span className="log-time">{formatTime(log.timestamp)}</span>
      <span className="log-icon">{getStatusIcon(log.type)}</span>
      <span className="log-message">
        {log.fileName && <span className="log-file">{log.fileName}</span>}
        {log.pageNumber && (
          <span className="log-page">Page {log.pageNumber}</span>
        )}
        <span className="log-text">{log.message}</span>
        {log.scale && <span className="log-badge log-scale">@{log.scale}x</span>}
        {log.rotated && <span className="log-badge log-rotated">Rotated</span>}
        {log.attemptCount && (
          <span className="log-badge log-attempt">Attempt {log.attemptCount}</span>
        )}
      </span>
    </div>
  );
}

/**
 * Creates a log entry object
 */
export function createLogEntry({
  type = "info",
  message,
  fileName = null,
  pageNumber = null,
  scale = null,
  rotated = false,
  attemptCount = null,
}) {
  return {
    timestamp: Date.now(),
    type,
    message,
    fileName,
    pageNumber,
    scale,
    rotated,
    attemptCount,
  };
}

export default Logger;
