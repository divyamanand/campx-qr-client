/**
 * Rotate image blob by specified degrees
 * @param blob - Image blob to rotate
 * @param degrees - Rotation degrees (90, 180, 270)
 * @returns Promise resolving to rotated image blob
 */
export const rotateImage = async (
  blob: Blob,
  degrees: number
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e: ProgressEvent<FileReader>) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Could not get 2D context from canvas'))
          return
        }

        // Handle rotation
        const radians = (degrees % 360 * Math.PI) / 180

        if (degrees === 90 || degrees === 270) {
          // Swap width and height for 90/270 degree rotation
          canvas.width = img.height
          canvas.height = img.width
        } else {
          canvas.width = img.width
          canvas.height = img.height
        }

        // Translate to center, rotate, then translate back
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate(radians)
        ctx.drawImage(img, -img.width / 2, -img.height / 2)

        canvas.toBlob((rotatedBlob) => {
          if (!rotatedBlob) {
            reject(new Error('Failed to create blob from rotated canvas'))
            return
          }
          resolve(rotatedBlob)
          // Clean up
          canvas.remove()
        }, blob.type || 'image/png')
      }

      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }

      img.src = e.target?.result as string
    }

    reader.onerror = () => {
      reject(new Error('Failed to read blob'))
    }

    reader.readAsDataURL(blob)
  })
}
