/** Resize & encode image for /chat (keeps payload under edge limits). */

const MAX_EDGE = 1280;
const MAX_BYTES = 900_000;
const JPEG_QUALITY = 0.82;

export type PreparedImage = {
  base64: string;
  mime: string;
  previewUrl: string;
  name: string;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read_failed"));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode_failed"))),
      "image/jpeg",
      quality,
    );
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result);
      const i = dataUrl.indexOf(",");
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
    };
    r.onerror = () => reject(new Error("blob_read_failed"));
    r.readAsDataURL(blob);
  });
}

async function encodeCanvas(canvas: HTMLCanvasElement): Promise<{ base64: string; mime: string }> {
  let q = JPEG_QUALITY;
  for (let attempt = 0; attempt < 6; attempt++) {
    const blob = await canvasToJpegBlob(canvas, q);
    if (blob.size <= MAX_BYTES || q <= 0.45) {
      return { base64: await blobToBase64(blob), mime: "image/jpeg" };
    }
    q -= 0.08;
  }
  const blob = await canvasToJpegBlob(canvas, 0.45);
  return { base64: await blobToBase64(blob), mime: "image/jpeg" };
}

export async function prepareImageFile(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Только изображения (PNG, JPEG, WebP, HEIC…).");
  }
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  const { base64, mime } = await encodeCanvas(canvas);
  return {
    base64,
    mime,
    previewUrl: `data:${mime};base64,${base64}`,
    name: file.name,
  };
}

export function isImagePasteItem(item: DataTransferItem): boolean {
  return item.kind === "file" && item.type.startsWith("image/");
}
