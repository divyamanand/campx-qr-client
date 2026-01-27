/**
 * ScaleSequenceGenerator - Generates scale sequences for retry logic
 * 
 * Single Responsibility: Generate optimal scale sequences for image rendering
 * Pattern: initial, initial+1, initial-1, initial+2, initial-2, ...
 */
export class ScaleSequenceGenerator {
  /**
   * Generate the sequence of scales to try in the retry loop
   * @param {number} initialScale - Starting scale
   * @param {number} maxScale - Maximum scale boundary
   * @param {number} minScale - Minimum scale boundary
   * @returns {number[]} Array of scales to try
   */
  static generate(initialScale, maxScale, minScale) {
    const scales = [initialScale];
    const seen = new Set([initialScale]);

    let offset = 1;
    while (true) {
      const higher = initialScale + offset;
      const lower = initialScale - offset;

      let addedAny = false;

      if (higher <= maxScale && !seen.has(higher)) {
        scales.push(higher);
        seen.add(higher);
        addedAny = true;
      }

      if (lower >= minScale && !seen.has(lower)) {
        scales.push(lower);
        seen.add(lower);
        addedAny = true;
      }

      // Stop if we've exceeded both bounds
      if (higher > maxScale && lower < minScale) break;
      if (!addedAny && higher > maxScale) break;

      offset++;
    }

    return scales;
  }
}
