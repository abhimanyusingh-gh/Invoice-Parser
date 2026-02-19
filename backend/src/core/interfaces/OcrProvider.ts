export interface OcrResult {
  text: string;
  confidence?: number;
  provider: string;
}

export interface OcrProvider {
  readonly name: string;
  extractText(buffer: Buffer, mimeType: string): Promise<OcrResult>;
}
