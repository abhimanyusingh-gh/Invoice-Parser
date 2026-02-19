import { createWorker, type Worker } from "tesseract.js";
import type { OcrProvider, OcrResult } from "../core/interfaces/OcrProvider.js";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export class TesseractOcrProvider implements OcrProvider {
  readonly name = "tesseract";

  private worker: Promise<Worker> | null = null;

  async extractText(buffer: Buffer, mimeType: string): Promise<OcrResult> {
    if (!IMAGE_MIME_TYPES.has(mimeType)) {
      return {
        text: "",
        confidence: 0,
        provider: this.name
      };
    }

    const worker = await this.getWorker();
    const result = await worker.recognize(buffer);

    return {
      text: result.data.text ?? "",
      confidence: normalizeConfidence(result.data.confidence),
      provider: this.name
    };
  }

  async shutdown(): Promise<void> {
    if (!this.worker) {
      return;
    }

    const worker = await this.worker;
    await worker.terminate();
    this.worker = null;
  }

  private async getWorker(): Promise<Worker> {
    if (!this.worker) {
      this.worker = createWorker("eng");
    }

    return this.worker;
  }
}

function normalizeConfidence(value?: number): number | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, Number((value / 100).toFixed(4))));
}
