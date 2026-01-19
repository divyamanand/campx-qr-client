export function preprocessImage(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = (
      data[i] * 0.299 +
      data[i + 1] * 0.587 +
      data[i + 2] * 0.114
    );

    // contrast stretch
    const contrast = gray > 128 ? 255 : 0;

    data[i] = data[i + 1] = data[i + 2] = contrast;
  }

  ctx.putImageData(imageData, 0, 0);
}
