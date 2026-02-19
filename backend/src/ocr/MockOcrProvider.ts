import type { OcrProvider, OcrResult } from "../core/interfaces/OcrProvider.js";

export class MockOcrProvider implements OcrProvider {
  readonly name = "mock";

  async extractText(_buffer: Buffer, _mimeType: string): Promise<OcrResult> {
    const text = process.env.MOCK_OCR_TEXT ?? "";
    const confidence = parseConfidence(process.env.MOCK_OCR_CONFIDENCE);

    return {
      text,
      confidence: text ? confidence : 0,
      provider: this.name
    };
  }
}

function parseConfidence(rawValue?: string): number {
  if (!rawValue) {
    return 0.95;
  }

  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    return 0.95;
  }

  if (parsed > 1) {
    return Math.max(0, Math.min(1, parsed / 100));
  }

  return Math.max(0, Math.min(1, parsed));
}
