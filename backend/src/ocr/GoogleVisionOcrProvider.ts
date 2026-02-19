import { ImageAnnotatorClient } from "@google-cloud/vision";
import type { OcrProvider, OcrResult } from "../core/interfaces/OcrProvider.js";

const PDF_MIME_TYPES = new Set(["application/pdf"]);

export class GoogleVisionOcrProvider implements OcrProvider {
  readonly name = "google-vision";

  private readonly client: ImageAnnotatorClient;

  constructor() {
    this.client = new ImageAnnotatorClient();
  }

  async extractText(buffer: Buffer, mimeType: string): Promise<OcrResult> {
    if (PDF_MIME_TYPES.has(mimeType)) {
      return this.extractFromPdf(buffer);
    }

    return this.extractFromImage(buffer);
  }

  private async extractFromImage(buffer: Buffer): Promise<OcrResult> {
    const [response] = await this.client.documentTextDetection({
      image: {
        content: buffer
      }
    });

    const text = response.fullTextAnnotation?.text ?? response.textAnnotations?.[0]?.description ?? "";
    const pages = response.fullTextAnnotation?.pages ?? [];
    const confidence = this.average(pages.map((page) => page.confidence ?? 0));

    return {
      text,
      confidence,
      provider: this.name
    };
  }

  private async extractFromPdf(buffer: Buffer): Promise<OcrResult> {
    const [response] = await this.client.batchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            mimeType: "application/pdf",
            content: buffer
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
        }
      ]
    });

    const fileResponse = response.responses?.[0];
    const pageResponses = fileResponse?.responses ?? [];
    const text = pageResponses
      .map((pageResponse) => pageResponse.fullTextAnnotation?.text ?? "")
      .join("\n")
      .trim();

    const confidences = pageResponses.flatMap((pageResponse) =>
      (pageResponse.fullTextAnnotation?.pages ?? []).map((page) => page.confidence ?? 0)
    );

    return {
      text,
      confidence: this.average(confidences),
      provider: this.name
    };
  }

  private average(values: number[]): number | undefined {
    if (values.length === 0) {
      return undefined;
    }

    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
  }
}
