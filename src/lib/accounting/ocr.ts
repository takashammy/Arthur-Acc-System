import type { Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

function reader(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) =>
      createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
        langPath: "/tesseract",
      }),
    ).catch((error: unknown) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export function isImage(mime: string, name = ""): boolean {
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name);
}

/** Read printed English out of a photo. No key, no account — the browser does it. */
export async function readImageText(source: Blob): Promise<string> {
  const worker = await reader();
  const result = await worker.recognize(source);
  return result.data.text ?? "";
}
