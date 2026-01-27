/**
 * Image utility functions for manipulation
 */

/**
 * Rotate an image blob by specified degrees
 * @param {Blob} blob - The image blob to rotate
 * @param {number} degrees - Rotation angle (90, 180, 270)
 * @returns {Promise<Blob>} - The rotated image blob
 */
export async function rotateImage(blob, degrees = 180) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Handle 90/270 degree rotations (swap dimensions)
      const swap = degrees === 90 || degrees === 270;
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;

      // Move to center, rotate, then draw
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      canvas.toBlob(
        (rotatedBlob) => {
          canvas.width = canvas.height = 0; // Cleanup
          resolve(rotatedBlob);
        },
        blob.type || "image/png",
        1
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for rotation"));
    };

    img.src = url;
  });
}
