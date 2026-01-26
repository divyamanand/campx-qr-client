/**
 * Error categories and severity levels
 */
export const ERROR_TYPES = {
  PAGE_COUNT_MISMATCH: "PAGE_COUNT_MISMATCH",
  QR_NOT_DETECTED: "QR_NOT_DETECTED",
  PARTIAL_DETECTION: "PARTIAL_DETECTION",
  TAMPERING_DETECTED: "TAMPERING_DETECTED",
  QR_DAMAGED: "QR_DAMAGED",
  PDF_EDITED: "PDF_EDITED",
};

export const ERROR_SEVERITY = {
  CRITICAL: "critical",
  WARNING: "warning",
  INFO: "info",
};

/**
 * ErrorHandler - Validates scan results against expected structure
 *
 * Detects:
 * - Page count mismatches
 * - Missing or partial QR code detection
 * - Tampering (QR code mismatches)
 * - Damaged QR codes
 * - PDF editing
 */
export class ErrorHandler {
  constructor(structure = null) {
    this.structure = structure;
    this.errors = [];
  }

  /**
   * Clear all errors
   */
  clear() {
    this.errors = [];
  }

  /**
   * Validate scan results against expected structure
   * @param {Object} scanResults - Results from PDFManager (allPdfFiles)
   * @param {string} fileName - PDF filename
   * @returns {Array} - Array of error objects
   */
  validate(scanResults, fileName) {
    this.clear();

    if (!scanResults || !scanResults[fileName]) {
      return this.errors;
    }

    const fileData = scanResults[fileName];
    const pages = fileData.pages || {};
    const pageNumbers = Object.keys(pages)
      .filter((k) => k !== "structureId" && k !== "pages")
      .map(Number)
      .sort((a, b) => a - b);

    const totalPages = pageNumbers.length;

    // Check 1: Page count mismatch
    this.validatePageCount(totalPages, fileName);

    // For each page, validate against expectations
    for (const pageNum of pageNumbers) {
      const pageData = pages[pageNum];
      this.validatePage(pageNum, pageData, fileName);
    }

    return this.errors;
  }

  /**
   * Check if total page count matches expected
   */
  validatePageCount(actualCount, fileName) {
    if (!this.structure || !this.structure.expectedPageCount) {
      return;
    }

    const expected = this.structure.expectedPageCount;

    if (actualCount !== expected) {
      this.addError({
        type: ERROR_TYPES.PAGE_COUNT_MISMATCH,
        severity: ERROR_SEVERITY.CRITICAL,
        message: `Page count mismatch: expected ${expected}, got ${actualCount}`,
        details: {
          fileName,
          expectedPages: expected,
          actualPages: actualCount,
          studentRoll: this.structure.studentRoll,
          courseCode: this.structure.courseCode,
        },
      });
    }
  }

  /**
   * Validate a single page's scan results
   */
  validatePage(pageNum, pageData, fileName) {
    const expectation = this.getPageExpectation(pageNum);

    // Check if codes were detected
    const codesFound = pageData.result?.codes?.length || 0;

    if (codesFound === 0 && expectation && expectation.totalCodeCount > 0) {
      this.addError({
        type: ERROR_TYPES.QR_NOT_DETECTED,
        severity: ERROR_SEVERITY.CRITICAL,
        message: `No QR codes detected on page ${pageNum}`,
        details: {
          fileName,
          pageNumber: pageNum,
          expectedCodes: expectation.totalCodeCount,
          foundCodes: 0,
          studentRoll: this.structure.studentRoll,
          courseCode: this.structure.courseCode,
        },
      });
      return;
    }

    if (!expectation) {
      return;
    }

    // Check 2: Partial detection
    if (codesFound < expectation.totalCodeCount) {
      this.addError({
        type: ERROR_TYPES.PARTIAL_DETECTION,
        severity: ERROR_SEVERITY.WARNING,
        message: `Partial QR code detection on page ${pageNum}`,
        details: {
          fileName,
          pageNumber: pageNum,
          expectedCodes: expectation.totalCodeCount,
          foundCodes: codesFound,
          missing: this.getMissingCodes(pageData.result?.codes, expectation),
          studentRoll: this.structure.studentRoll,
          courseCode: this.structure.courseCode,
        },
      });
    }

    // Check 3: Tampering detection
    this.validateTampering(pageNum, pageData, expectation, fileName);

    // Check 4: Check for damaged QR codes (partial reads)
    if (pageData.partial === true && codesFound > 0) {
      this.addError({
        type: ERROR_TYPES.QR_DAMAGED,
        severity: ERROR_SEVERITY.WARNING,
        message: `QR code appears damaged or partially readable on page ${pageNum}`,
        details: {
          fileName,
          pageNumber: pageNum,
          codesFound: codesFound,
          scale: pageData.scale,
          rotated: pageData.rotated,
          attempts: pageData.attempts,
          studentRoll: this.structure.studentRoll,
          courseCode: this.structure.courseCode,
        },
      });
    }

    // Check 5: PDF editing detection (requires multiple scales or high rotation count)
    if (pageData.attempts > 5 || pageData.rotated) {
      this.addError({
        type: ERROR_TYPES.PDF_EDITED,
        severity: ERROR_SEVERITY.WARNING,
        message: `Potential PDF tampering detected on page ${pageNum}`,
        details: {
          fileName,
          pageNumber: pageNum,
          attemptsNeeded: pageData.attempts,
          requiredRotation: pageData.rotated,
          finalScale: pageData.scale,
          studentRoll: this.structure.studentRoll,
          courseCode: this.structure.courseCode,
        },
      });
    }
  }

  /**
   * Validate for tampering (QR code mismatch)
   */
  validateTampering(pageNum, pageData, expectation, fileName) {
    if (!pageData.result?.success || pageData.result?.codes?.length === 0) {
      return;
    }

    const foundCodes = pageData.result.codes;

    // Check if found codes match expected formats
    const expectedFormats = expectation.formats || [];
    const foundFormats = foundCodes.map((c) => c.format);

    for (const expected of expectedFormats) {
      const found = foundCodes.find((c) => c.format === expected.code);

      // If expected format not found in actual results = tampering
      if (!found && expected.count > 0) {
        this.addError({
          type: ERROR_TYPES.TAMPERING_DETECTED,
          severity: ERROR_SEVERITY.CRITICAL,
          message: `QR/Barcode mismatch on page ${pageNum}`,
          details: {
            fileName,
            pageNumber: pageNum,
            expectedFormat: expected.code,
            expectedCount: expected.count,
            foundFormats: foundFormats.join(", ") || "none",
            studentRoll: this.structure.studentRoll,
            courseCode: this.structure.courseCode,
            reason: "Expected barcode format not found - possible tampering",
          },
        });
      }
    }
  }

  /**
   * Get expected codes for a page
   */
  getPageExpectation(pageNum) {
    if (!this.structure || !this.structure.format) {
      return null;
    }

    return this.structure.format.find((p) => p.pageNumber === pageNum) || null;
  }

  /**
   * Identify which codes are missing
   */
  getMissingCodes(foundCodes = [], expectation = {}) {
    const foundFormats = (foundCodes || []).map((c) => c.format);
    const missing = [];

    for (const expected of expectation.formats || []) {
      if (!foundFormats.includes(expected.code)) {
        missing.push(`${expected.code} (expected ${expected.count})`);
      }
    }

    return missing;
  }

  /**
   * Add an error to the errors array
   */
  addError(errorObj) {
    this.errors.push({
      id: `${errorObj.type}-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      ...errorObj,
    });
  }

  /**
   * Get all errors
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Get errors by type
   */
  getErrorsByType(type) {
    return this.errors.filter((e) => e.type === type);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity) {
    return this.errors.filter((e) => e.severity === severity);
  }

  /**
   * Check if there are critical errors
   */
  hasCriticalErrors() {
    return this.errors.some((e) => e.severity === ERROR_SEVERITY.CRITICAL);
  }

  /**
   * Get error summary
   */
  getSummary() {
    return {
      totalErrors: this.errors.length,
      critical: this.errors.filter((e) => e.severity === ERROR_SEVERITY.CRITICAL).length,
      warnings: this.errors.filter((e) => e.severity === ERROR_SEVERITY.WARNING).length,
      info: this.errors.filter((e) => e.severity === ERROR_SEVERITY.INFO).length,
      byType: this.groupErrorsByType(),
    };
  }

  /**
   * Group errors by type
   */
  groupErrorsByType() {
    const grouped = {};
    for (const error of this.errors) {
      if (!grouped[error.type]) {
        grouped[error.type] = [];
      }
      grouped[error.type].push(error);
    }
    return grouped;
  }
}

/**
 * Get error type display info
 */
export function getErrorTypeInfo(type) {
  const info = {
    [ERROR_TYPES.PAGE_COUNT_MISMATCH]: {
      label: "Page Count Mismatch",
      icon: "⚠️",
      color: "#ff4444",
    },
    [ERROR_TYPES.QR_NOT_DETECTED]: {
      label: "QR Code Not Detected",
      icon: "❌",
      color: "#ff0000",
    },
    [ERROR_TYPES.PARTIAL_DETECTION]: {
      label: "Partial Detection",
      icon: "⚠️",
      color: "#ffaa00",
    },
    [ERROR_TYPES.TAMPERING_DETECTED]: {
      label: "Tampering Detected",
      icon: "🔓",
      color: "#ff0000",
    },
    [ERROR_TYPES.QR_DAMAGED]: {
      label: "QR Code Damaged",
      icon: "💔",
      color: "#ff9900",
    },
    [ERROR_TYPES.PDF_EDITED]: {
      label: "PDF Edited",
      icon: "✏️",
      color: "#ff6600",
    },
  };

  return info[type] || { label: "Unknown Error", icon: "❓", color: "#999999" };
}
