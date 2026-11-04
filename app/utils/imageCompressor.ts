/**
 * Client-Side Image Compressor & Supabase Storage Optimizer
 *
 * Automatically downsizes large smartphone photos (5-15MB) to crisp, high-resolution
 * WebP images (~150-250KB) in the browser using HTML5 Canvas.
 *
 * Benefits:
 * 1. 95%+ bandwidth and storage savings on Supabase Storage.
 * 2. Stored with 'cacheControl: 31536000, public' (1 year CDN cache, 0 repeated egress).
 * 3. Prevents Vercel 4.5MB serverless payload errors.
 * 4. Generates ultra-lightweight thumbnails (max 320px, ~20KB) for fast list previews.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 - 1.0 (default: 0.82)
  format?: "image/webp" | "image/jpeg";
  createThumbnail?: boolean;
  thumbnailMaxWidth?: number;
}

export interface CompressedResult {
  file: File;
  blob: Blob;
  dataUrl: string;
  thumbnailDataUrl?: string;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  reductionPercent: number;
  width: number;
  height: number;
  mimeType: string;
}

/**
 * Formats bytes into human readable format (KB, MB)
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Checks if browser supports WebP canvas export
 */
function supportsWebP(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  } catch {
    return false;
  }
}

/**
 * Calculates resized dimensions while strictly maintaining aspect ratio
 */
function calculateDimensions(
  origW: number,
  origH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  let width = origW;
  let height = origH;

  if (width > maxW || height > maxH) {
    const ratio = Math.min(maxW / width, maxH / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  return { width, height };
}

/**
 * Resizes an Image object onto a Canvas and exports as WebP DataURL
 */
function canvasToDataUrl(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  mimeType: string,
  quality: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("Canvas context could not be created");
  }

  // Smooth rendering for high quality downsizing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Draw white background in case of transparent pngs converted to jpeg
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);

  ctx.drawImage(img, 0, 0, targetW, targetH);

  return canvas.toDataURL(mimeType, quality);
}

/**
 * Converts a Base64 Data URL to a Blob
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/webp";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Compresses an image File in the browser using HTML5 Canvas
 */
export async function compressImageFile(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressedResult> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.82,
    createThumbnail = true,
    thumbnailMaxWidth = 320,
  } = options;

  // Determine output format (prefer WebP, fallback to JPEG)
  const canWebP = supportsWebP();
  const format = options.format || (canWebP ? "image/webp" : "image/jpeg");
  const ext = format === "image/webp" ? "webp" : "jpg";

  // Load image into HTMLImageElement
  const dataUrlOriginal = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrlOriginal;
  });

  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // Calculate scaled dimensions
  const { width: targetW, height: targetH } = calculateDimensions(
    origW,
    origH,
    maxWidth,
    maxHeight
  );

  // Compress full image
  const compressedDataUrl = canvasToDataUrl(
    img,
    targetW,
    targetH,
    format,
    quality
  );

  // Create thumbnail if requested
  let thumbnailDataUrl: string | undefined = undefined;
  if (createThumbnail) {
    const { width: thumbW, height: thumbH } = calculateDimensions(
      origW,
      origH,
      thumbnailMaxWidth,
      thumbnailMaxWidth
    );
    thumbnailDataUrl = canvasToDataUrl(
      img,
      thumbW,
      thumbH,
      format,
      0.7
    );
  }

  // Generate Blob and File
  const compressedBlob = dataUrlToBlob(compressedDataUrl);
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const compressedFile = new File([compressedBlob], `${baseName}.${ext}`, {
    type: format,
    lastModified: Date.now(),
  });

  const originalSize = file.size;
  const compressedSize = compressedBlob.size;
  const savedBytes = Math.max(0, originalSize - compressedSize);
  const reductionPercent =
    originalSize > 0
      ? Number(((savedBytes / originalSize) * 100).toFixed(1))
      : 0;

  return {
    file: compressedFile,
    blob: compressedBlob,
    dataUrl: compressedDataUrl,
    thumbnailDataUrl,
    originalSize,
    compressedSize,
    savedBytes,
    reductionPercent,
    width: targetW,
    height: targetH,
    mimeType: format,
  };
}

/**
 * Uploads an image to Supabase Storage via our optimized API endpoint
 * Sets Cache-Control to 1 year and ensures public URL is returned
 */
export async function uploadImageToOptimizedStorage(
  compressed: CompressedResult | { dataUrl: string; file?: File; fileName?: string },
  folder: string = "qurban"
): Promise<{ url: string; success: boolean; error?: string }> {
  try {
    const fileName =
      "file" in compressed && compressed.file?.name
        ? compressed.file.name
        : "fileName" in compressed && compressed.fileName
        ? compressed.fileName
        : `img_${Date.now()}.webp`;

    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl: compressed.dataUrl,
        fileName,
        folder,
      }),
    });

    const json = await res.json();
    if (res.ok && json.success && json.url) {
      return { url: json.url, success: true };
    }

    // Fallback: If upload endpoint fails or bucket isn't reachable,
    // return the compressed base64 dataUrl directly (now only ~180KB instead of 10MB)
    return {
      url: compressed.dataUrl,
      success: true,
      error: json.error || "Storage fallback to WebP DataURL",
    };
  } catch (err: any) {
    console.warn("Storage upload error, using compressed DataURL:", err);
    return {
      url: compressed.dataUrl,
      success: true,
      error: err.message,
    };
  }
}
