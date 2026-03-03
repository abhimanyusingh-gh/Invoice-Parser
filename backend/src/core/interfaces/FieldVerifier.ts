import type { OcrBlock } from "./OcrProvider.js";
import type { ParsedInvoiceData } from "../../types/invoice.js";

export type FieldVerificationMode = "strict" | "relaxed";

export interface FieldVerifierInput {
  parsed: ParsedInvoiceData;
  ocrText: string;
  ocrBlocks: OcrBlock[];
  mode: FieldVerificationMode;
  hints: {
    mimeType: string;
    languageHint?: string;
    documentLanguage?: string;
    documentLanguageConfidence?: number;
    preOcrLanguage?: string;
    preOcrLanguageConfidence?: number;
    postOcrLanguage?: string;
    postOcrLanguageConfidence?: number;
    vendorNameHint?: string;
    vendorTemplateMatched: boolean;
    fieldCandidates: Record<string, string[]>;
    fieldRegions?: Record<string, OcrBlock[]>;
  };
}

export interface FieldVerifierResult {
  parsed: ParsedInvoiceData;
  issues: string[];
  changedFields: string[];
  reasonCodes?: Record<string, string>;
}

export interface FieldVerifier {
  readonly name: string;
  verify(input: FieldVerifierInput): Promise<FieldVerifierResult>;
}
