"use client";

/** Verkleinert ein Foto auf max. 1600px und gibt JPEG-Blob + Base64 zurück. */
export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<{ blob: Blob; base64: string; url: string }> {
  const bitmap = await createImageBitmap(file).catch(async () => {
    // Fallback für ältere Safari-Versionen
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    return img;
  });
  const w = "width" in bitmap ? bitmap.width : 0;
  const h = "height" in bitmap ? bitmap.height : 0;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht verarbeitet werden"))), "image/jpeg", quality)
  );
  const base64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
  return { blob, base64, url: URL.createObjectURL(blob) };
}
