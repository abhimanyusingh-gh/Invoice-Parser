import type { ParseResult } from "../parser/invoiceParser.js";
import { parseInvoiceText } from "../parser/invoiceParser.js";
import { assessInvoiceConfidence, type ConfidenceAssessment } from "./confidenceAssessment.js";

export interface ExtractionTextCandidate {
  text: string;
  provider: string;
  confidence?: number;
  source: string;
}

interface ExtractionAgentInput {
  candidates: ExtractionTextCandidate[];
  expectedMaxTotal: number;
  expectedMaxDueDays: number;
  autoSelectMin: number;
  referenceDate?: Date;
}

interface ExtractionAgentAttempt {
  candidate: ExpandedExtractionCandidate;
  parseResult: ParseResult;
  confidence: ConfidenceAssessment;
  score: number;
}

interface ExpandedExtractionCandidate extends ExtractionTextCandidate {
  strategy: string;
}

interface ExtractionAgentAttemptSummary {
  provider: string;
  source: string;
  strategy: string;
  score: number;
  confidenceScore: number;
  warningCount: number;
  hasTotalAmountMinor: boolean;
  textLength: number;
}

interface ExtractionAgentResult {
  provider: string;
  text: string;
  confidence?: number;
  source: string;
  strategy: string;
  parseResult: ParseResult;
  confidenceAssessment: ConfidenceAssessment;
  attempts: ExtractionAgentAttemptSummary[];
}

export function runInvoiceExtractionAgent(input: ExtractionAgentInput): ExtractionAgentResult {
  const expandedCandidates = dedupeCandidates(
    input.candidates
      .filter((candidate) => candidate.text.trim().length > 0)
      .flatMap((candidate) => expandCandidate(candidate))
  );

  if (expandedCandidates.length === 0) {
    throw new Error("No OCR text candidates are available for extraction.");
  }

  const attempts = expandedCandidates.map((candidate) => {
    const parseResult = parseInvoiceText(candidate.text);
    const confidence = assessInvoiceConfidence({
      ocrConfidence: candidate.confidence,
      parsed: parseResult.parsed,
      warnings: parseResult.warnings,
      expectedMaxTotal: input.expectedMaxTotal,
      expectedMaxDueDays: input.expectedMaxDueDays,
      autoSelectMin: input.autoSelectMin,
      referenceDate: input.referenceDate
    });

    return {
      candidate,
      parseResult,
      confidence,
      score: scoreCandidate(candidate.text, parseResult, confidence)
    };
  });

  attempts.sort(compareAttempts);
  const best = attempts[0];

  return {
    provider: best.candidate.provider,
    text: best.candidate.text,
    confidence: best.candidate.confidence,
    source: best.candidate.source,
    strategy: best.candidate.strategy,
    parseResult: best.parseResult,
    confidenceAssessment: best.confidence,
    attempts: attempts.map((attempt) => ({
      provider: attempt.candidate.provider,
      source: attempt.candidate.source,
      strategy: attempt.candidate.strategy,
      score: attempt.score,
      confidenceScore: attempt.confidence.score,
      warningCount: attempt.parseResult.warnings.length,
      hasTotalAmountMinor: attempt.parseResult.parsed.totalAmountMinor !== undefined,
      textLength: attempt.candidate.text.length
    }))
  };
}

function compareAttempts(left: ExtractionAgentAttempt, right: ExtractionAgentAttempt): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.confidence.score !== left.confidence.score) {
    return right.confidence.score - left.confidence.score;
  }

  const leftHasTotal = left.parseResult.parsed.totalAmountMinor !== undefined;
  const rightHasTotal = right.parseResult.parsed.totalAmountMinor !== undefined;
  if (leftHasTotal !== rightHasTotal) {
    return rightHasTotal ? 1 : -1;
  }

  if (left.parseResult.warnings.length !== right.parseResult.warnings.length) {
    return left.parseResult.warnings.length - right.parseResult.warnings.length;
  }

  return right.candidate.text.length - left.candidate.text.length;
}

function scoreCandidate(text: string, parseResult: ParseResult, confidence: ConfidenceAssessment): number {
  let score = confidence.score;

  if (parseResult.parsed.totalAmountMinor !== undefined) {
    score += 24;
  } else {
    score -= 18;
  }

  if (parseResult.parsed.invoiceNumber) {
    score += 8;
  }

  if (parseResult.parsed.vendorName) {
    score += 6;
  }

  if (parseResult.parsed.currency) {
    score += 4;
  }

  if (parseResult.parsed.invoiceDate) {
    score += 4;
  }

  if (parseResult.warnings.length === 0) {
    score += 4;
  } else {
    score -= Math.min(18, parseResult.warnings.length * 2);
  }

  if (text.trim().length < 80) {
    score -= 6;
  }

  return score;
}

function expandCandidate(candidate: ExtractionTextCandidate): ExpandedExtractionCandidate[] {
  const rawText = normalizeLineEndings(candidate.text);
  const normalizedWhitespace = normalizeWhitespace(rawText);
  const repairedText = repairCommonOcrConfusions(normalizedWhitespace);

  const variants: ExpandedExtractionCandidate[] = [
    {
      ...candidate,
      text: rawText,
      strategy: "raw"
    }
  ];

  if (normalizedWhitespace !== rawText) {
    variants.push({
      ...candidate,
      text: normalizedWhitespace,
      strategy: "normalized-whitespace"
    });
  }

  if (repairedText !== rawText) {
    variants.push({
      ...candidate,
      text: repairedText,
      strategy: "ocr-repair"
    });
  }

  return variants;
}

function dedupeCandidates(candidates: ExpandedExtractionCandidate[]): ExpandedExtractionCandidate[] {
  const seen = new Set<string>();
  const deduped: ExpandedExtractionCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.provider}|${candidate.source}|${candidate.text}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function normalizeWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function repairCommonOcrConfusions(text: string): string {
  const repaired = text
    .replace(/\blnvoice\b/gi, "Invoice")
    .replace(/\bT0tal\b/gi, "Total")
    .replace(/\bAm0unt\b/gi, "Amount")
    .replace(/\bCurrencv\b/gi, "Currency")
    .split("\n")
    .map((line) => (isFinancialLine(line) ? repairNumericTokens(line) : line))
    .join("\n");

  return repaired;
}

function isFinancialLine(line: string): boolean {
  return /(grand\s*total|amount|payable|balance|subtotal|tax|vat|gst|discount|total\s*due)/i.test(line);
}

function repairNumericTokens(line: string): string {
  return line.replace(/\b[0-9A-Za-z,.\-]+\b/g, (token) => {
    if (!/\d/.test(token) || !/[A-Za-z]/.test(token)) {
      return token;
    }

    return token
      .replace(/[oO]/g, "0")
      .replace(/[lI]/g, "1")
      .replace(/[sS]/g, "5")
      .replace(/[bB]/g, "8");
  });
}

export const __testables = {
  compareAttempts
};
