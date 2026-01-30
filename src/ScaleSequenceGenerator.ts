/**
 * Generates a scale sequence for retry logic
 * Pattern: initial, initial±1, initial±2, etc., bounded by min/max scales
 */
class ScaleSequenceGenerator {
  /**
   * Generate scale sequence starting from initial scale
   * @param initialScale - Starting scale value
   * @param maxScale - Maximum allowed scale
   * @param minScale - Minimum allowed scale
   * @returns Array of scales in recommended retry order
   */
  static generate(
    initialScale: number,
    maxScale: number,
    minScale: number
  ): number[] {
    const scales: number[] = []
    const visited = new Set<number>()

    // Start with initial scale
    if (
      initialScale >= minScale &&
      initialScale <= maxScale &&
      !visited.has(initialScale)
    ) {
      scales.push(initialScale)
      visited.add(initialScale)
    }

    // Expand outward: ±1, ±2, ±3, etc.
    let offset = 1
    while (scales.length < maxScale - minScale + 1) {
      // Try higher scale (initial + offset)
      const higherScale = initialScale + offset
      if (higherScale <= maxScale && !visited.has(higherScale)) {
        scales.push(higherScale)
        visited.add(higherScale)
      }

      // Try lower scale (initial - offset)
      const lowerScale = initialScale - offset
      if (lowerScale >= minScale && !visited.has(lowerScale)) {
        scales.push(lowerScale)
        visited.add(lowerScale)
      }

      offset++
    }

    return scales
  }
}

export default ScaleSequenceGenerator
