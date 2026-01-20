export function preprocessImage(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // ---------------------------
  // 1. Grayscale (luminance)
  // ---------------------------
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  // ---------------------------
  // 2. Adaptive Threshold
  // ---------------------------
  const blockSize = 8;
  const thresholdMap = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      let sum = 0;
      let count = 0;

      for (let j = 0; j < blockSize; j++) {
        for (let i = 0; i < blockSize; i++) {
          const px = x + i;
          const py = y + j;
          if (px < width && py < height) {
            const idx = (py * width + px) * 4;
            sum += data[idx];
            count++;
          }
        }
      }

      const avg = sum / count;

      for (let j = 0; j < blockSize; j++) {
        for (let i = 0; i < blockSize; i++) {
          const px = x + i;
          const py = y + j;
          if (px < width && py < height) {
            thresholdMap[py * width + px] = avg;
          }
        }
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    const v = data[i * 4];
    const t = thresholdMap[i];
    const bw = v < t ? 0 : 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = bw;
  }

  // ---------------------------
  // 3. Morphological Cleanup
  // Opening = erode → dilate
  // Closing = dilate → erode
  // ---------------------------
  const binary = new Uint8ClampedArray(width * height);
  for (let i = 0; i < binary.length; i++) {
    binary[i] = data[i * 4];
  }

  function erode(src, dst) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let min = 255;
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const v = src[(y + j) * width + (x + i)];
            if (v < min) min = v;
          }
        }
        dst[y * width + x] = min;
      }
    }
  }

  function dilate(src, dst) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let max = 0;
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const v = src[(y + j) * width + (x + i)];
            if (v > max) max = v;
          }
        }
        dst[y * width + x] = max;
      }
    }
  }

  const tmp1 = new Uint8ClampedArray(width * height);
  const tmp2 = new Uint8ClampedArray(width * height);

  // Opening
  erode(binary, tmp1);
  dilate(tmp1, tmp2);

  // Closing
  dilate(tmp2, tmp1);
  erode(tmp1, binary);

  for (let i = 0; i < binary.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = binary[i];
  }

  ctx.putImageData(imageData, 0, 0);
  return imageData;
}
