/** Compress image data URLs before API upload to avoid 413 payload errors. */

const DEFAULT_MAX_WIDTH = 1600;
const DEFAULT_QUALITY = 0.82;

export async function compressDataUrl(
  dataUrl: string,
  maxWidth = DEFAULT_MAX_WIDTH,
  quality = DEFAULT_QUALITY
): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, 1));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function compressImageItems(items: string[]): Promise<string[]> {
  return Promise.all(
    items.map((item) => (item.startsWith('text:') ? item : compressDataUrl(item)))
  );
}

/** Input may be raw base64 or full data URL; returns raw base64 for Gemini APIs. */
export async function compressBase64Images(images: string[]): Promise<string[]> {
  return Promise.all(
    images.map(async (image) => {
      const dataUrl = image.startsWith('data:')
        ? image
        : `data:image/jpeg;base64,${image}`;
      const compressed = await compressDataUrl(dataUrl);
      return compressed.includes(',') ? compressed.split(',')[1] : image;
    })
  );
}
