/**
 * ResultFormatter - Formats PDF processing results for different consumers
 * 
 * Single Responsibility: Transform results into various output formats
 */
export class ResultFormatter {
  /**
   * Get results formatted for the UI FileCard component
   * @param {Object} pdfFile - The pdfFile object with scan results
   * @returns {Object|null} - Formatted results for UI
   */
  static formatForUI(pdfFile) {
    if (!pdfFile) return null;

    const fileResult = {
      name: pdfFile.fileName,
      structureId: pdfFile.structureId || null,
      results: [],
    };

    for (const [pageNum, pageData] of Object.entries(pdfFile.pages)) {
      const qrs = pageData.result?.success
        ? pageData.result.codes.map((code) => ({
            success: true,
            data: code.data,
            format: code.format,
            position: code.position,
            ct: 1,
          }))
        : [
            {
              success: false,
              data: null,
              format: null,
              ct: 0,
              error: pageData.result?.error || "UNKNOWN_ERROR",
            },
          ];

      fileResult.results.push({
        page: parseInt(pageNum),
        qrs,
        scale: pageData.scale,
        rotated: pageData.rotated,
        skipped: pageData.skipped || false,
        partial: pageData.partial || false,
      });
    }

    // Sort by page number
    fileResult.results.sort((a, b) => a.page - b.page);
    return fileResult;
  }

  /**
   * Get summary statistics from pdfFile results
   * @param {Object} pdfFile - The pdfFile object with scan results
   * @returns {Object} - Summary statistics
   */
  static getSummary(pdfFile) {
    let totalFiles = 0;
    let totalPages = 0;
    let successfulPages = 0;
    let failedPages = 0;
    let skippedPages = 0;
    let partialPages = 0;
    let totalCodes = 0;

    if (pdfFile) {
      totalFiles = 1;
      for (const pageData of Object.values(pdfFile.pages)) {
        totalPages++;
        if (pageData.skipped) {
          skippedPages++;
          successfulPages++;
        } else if (pageData.success) {
          successfulPages++;
          if (pageData.partial) partialPages++;
          totalCodes += pageData.result?.codes?.length || 0;
        } else {
          failedPages++;
        }
      }
    }

    return {
      totalFiles,
      totalPages,
      successfulPages,
      failedPages,
      skippedPages,
      partialPages,
      totalCodes,
      successRate: totalPages > 0 ? (successfulPages / totalPages) * 100 : 0,
    };
  }
}
