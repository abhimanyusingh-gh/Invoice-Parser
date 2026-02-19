import { promises as fs } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import type { OcrProvider } from "../core/interfaces/OcrProvider.js";
import { CheckpointModel } from "../models/Checkpoint.js";
import { InvoiceModel } from "../models/Invoice.js";
import { GoogleVisionOcrProvider } from "../ocr/GoogleVisionOcrProvider.js";
import { MockOcrProvider } from "../ocr/MockOcrProvider.js";
import { TesseractOcrProvider } from "../ocr/TesseractOcrProvider.js";
import { DeepSeekOcrProvider } from "../ocr/DeepSeekOcrProvider.js";
import { IngestionService } from "../services/ingestionService.js";
import { FolderIngestionSource } from "../sources/FolderIngestionSource.js";
import { toMinorUnits } from "../utils/currency.js";

interface GroundTruthRecord {
  amount?: number;
  currency?: string;
  invoice_number?: string;
}

async function main() {
  const benchmarkRoot = resolveBenchmarkRoot();
  const groundTruthRoot = path.resolve(benchmarkRoot, "..", "ground-truth", "invoice2data");
  const ocrProvider = createOcrProvider(env.OCR_PROVIDER);

  await mongoose.connect(env.MONGO_URI);
  try {
    await InvoiceModel.deleteMany({ sourceKey: "benchmark-corpus" });
    await CheckpointModel.deleteMany({ sourceKey: "benchmark-corpus" });

    const source = new FolderIngestionSource({
      key: "benchmark-corpus",
      folderPath: benchmarkRoot,
      recursive: false
    });

    const ingestionService = new IngestionService([source], ocrProvider);
    const runSummary = await ingestionService.runOnce();
    const invoices = await InvoiceModel.find({ sourceKey: "benchmark-corpus" }).lean();

    const statusCounts = countStatuses(invoices.map((invoice) => invoice.status));
    const confidenceScores = invoices
      .map((invoice) => invoice.confidenceScore)
      .filter((score): score is number => typeof score === "number");
    const avgConfidence =
      confidenceScores.length === 0
        ? 0
        : Number((confidenceScores.reduce((sum, value) => sum + value, 0) / confidenceScores.length).toFixed(2));

    const amountEval = await evaluateInvoice2dataAmountMapping(invoices, groundTruthRoot);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          corpusPath: benchmarkRoot,
          ocrProvider: env.OCR_PROVIDER,
          runSummary,
          totals: {
            invoices: invoices.length,
            avgConfidence,
            statusCounts
          },
          invoice2dataAmountEvaluation: amountEval,
          lowConfidenceSamples: invoices
            .filter((invoice) => (invoice.confidenceScore ?? 0) < 70)
            .sort((left, right) => (left.confidenceScore ?? 0) - (right.confidenceScore ?? 0))
            .slice(0, 10)
            .map((invoice) => ({
              file: invoice.attachmentName,
              status: invoice.status,
              confidence: invoice.confidenceScore,
              totalAmountMinor: invoice.parsed?.totalAmountMinor,
              issues: invoice.processingIssues?.slice(0, 3) ?? []
            }))
        },
        null,
        2
      )
    );
  } finally {
    await shutdownProviderIfNeeded(ocrProvider);
    await mongoose.disconnect();
  }
}

function resolveBenchmarkRoot(): string {
  if (process.env.BENCHMARK_FOLDER_PATH) {
    return path.resolve(process.env.BENCHMARK_FOLDER_PATH);
  }

  const cwdCandidate = path.resolve(process.cwd(), "../sample-invoices/benchmark/inbox");
  return cwdCandidate;
}

function createOcrProvider(ocrProviderName: string): OcrProvider {
  if (ocrProviderName === "google-vision") {
    return new GoogleVisionOcrProvider();
  }

  if (ocrProviderName === "deepseek") {
    return new DeepSeekOcrProvider();
  }

  if (ocrProviderName === "tesseract") {
    return new TesseractOcrProvider();
  }

  if (ocrProviderName === "auto") {
    return new TesseractOcrProvider();
  }

  return new MockOcrProvider();
}

function countStatuses(statuses: string[]): Record<string, number> {
  return statuses.reduce<Record<string, number>>((counts, status) => {
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

async function evaluateInvoice2dataAmountMapping(
  invoices: Array<{
    attachmentName: string;
    parsed?: { totalAmountMinor?: number | null; currency?: string | null; invoiceNumber?: string | null } | null;
  }>,
  groundTruthRoot: string
) {
  const invoice2dataInvoices = invoices.filter((invoice) => invoice.attachmentName.startsWith("invoice2data__"));
  if (invoice2dataInvoices.length === 0) {
    return {
      totalCompared: 0,
      amountExactMatches: 0,
      amountAccuracyPercent: 0,
      currencyMatches: 0,
      currencyAccuracyPercent: 0,
      invoiceNumberMatches: 0,
      invoiceNumberAccuracyPercent: 0
    };
  }

  let amountExactMatches = 0;
  let currencyMatches = 0;
  let invoiceNumberMatches = 0;
  let compared = 0;

  for (const invoice of invoice2dataInvoices) {
    const groundTruth = await readGroundTruthForInvoice2data(invoice.attachmentName, groundTruthRoot);
    if (!groundTruth) {
      continue;
    }

    compared += 1;
    if (
      typeof groundTruth.amount === "number" &&
      typeof invoice.parsed?.totalAmountMinor === "number"
    ) {
      const expectedMinor = toMinorUnits(groundTruth.amount, invoice.parsed?.currency);
      if (expectedMinor === invoice.parsed.totalAmountMinor) {
        amountExactMatches += 1;
      }
    }

    if (
      groundTruth.currency &&
      invoice.parsed?.currency &&
      groundTruth.currency.toUpperCase() === invoice.parsed.currency.toUpperCase()
    ) {
      currencyMatches += 1;
    }

    const normalizedExpectedInvoiceNumber = normalizeInvoiceNumber(groundTruth.invoice_number);
    const normalizedActualInvoiceNumber = normalizeInvoiceNumber(invoice.parsed?.invoiceNumber);
    if (
      normalizedExpectedInvoiceNumber &&
      normalizedActualInvoiceNumber &&
      normalizedExpectedInvoiceNumber === normalizedActualInvoiceNumber
    ) {
      invoiceNumberMatches += 1;
    }
  }

  return {
    totalCompared: compared,
    amountExactMatches,
    amountAccuracyPercent: percentage(amountExactMatches, compared),
    currencyMatches,
    currencyAccuracyPercent: percentage(currencyMatches, compared),
    invoiceNumberMatches,
    invoiceNumberAccuracyPercent: percentage(invoiceNumberMatches, compared)
  };
}

async function readGroundTruthForInvoice2data(
  attachmentName: string,
  groundTruthRoot: string
): Promise<GroundTruthRecord | null> {
  const stem = attachmentName.replace(/\.[^.]+$/, "");
  const groundTruthFile = path.resolve(groundTruthRoot, `${stem}.json`);
  const raw = await fs.readFile(groundTruthFile, "utf-8").catch(() => null);
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0 || typeof parsed[0] !== "object" || parsed[0] === null) {
    return null;
  }

  return parsed[0] as GroundTruthRecord;
}

function normalizeInvoiceNumber(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function percentage(value: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Number(((value / total) * 100).toFixed(2));
}

async function shutdownProviderIfNeeded(provider: OcrProvider): Promise<void> {
  if ("shutdown" in provider && typeof provider.shutdown === "function") {
    await provider.shutdown();
  }
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
