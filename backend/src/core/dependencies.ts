import { access } from "node:fs/promises";
import axios from "axios";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { env } from "../config/env.js";
import type { AccountingExporter } from "./interfaces/AccountingExporter.js";
import type { OcrProvider } from "./interfaces/OcrProvider.js";
import { GoogleVisionOcrProvider } from "../ocr/GoogleVisionOcrProvider.js";
import { MockOcrProvider } from "../ocr/MockOcrProvider.js";
import { TesseractOcrProvider } from "../ocr/TesseractOcrProvider.js";
import { DeepSeekOcrProvider } from "../ocr/DeepSeekOcrProvider.js";
import { buildIngestionSources } from "./sourceRegistry.js";
import { IngestionService } from "../services/ingestionService.js";
import { InvoiceService } from "../services/invoiceService.js";
import { ExportService } from "../services/exportService.js";
import { TallyExporter } from "../services/tallyExporter.js";
import { logger } from "../utils/logger.js";

const OCR_BOOTSTRAP_TIMEOUT_MS = 5_000;

interface Dependencies {
  ingestionService: IngestionService;
  invoiceService: InvoiceService;
  exportService: ExportService | null;
}

export async function buildDependencies(): Promise<Dependencies> {
  const ocrProvider = await resolveOcrProvider();
  const sources = buildIngestionSources();
  const ingestionService = new IngestionService(sources, ocrProvider);
  const invoiceService = new InvoiceService();

  const exporter = buildExporter();
  const exportService = exporter ? new ExportService(exporter) : null;

  return {
    ingestionService,
    invoiceService,
    exportService
  };
}

export async function resolveOcrProvider(): Promise<OcrProvider> {
  if (env.OCR_PROVIDER === "mock") {
    logger.info("Using OCR provider", { provider: "mock" });
    return new MockOcrProvider();
  }
  if (env.OCR_PROVIDER === "tesseract") {
    logger.info("Using OCR provider", { provider: "tesseract" });
    return new TesseractOcrProvider();
  }

  if (await hasValidDeepSeekCredentials()) {
    logger.info("Using OCR provider", { provider: "deepseek" });
    return new DeepSeekOcrProvider();
  }

  if (await hasValidGoogleVisionCredentials()) {
    logger.info("Using OCR provider", { provider: "google-vision" });
    return new GoogleVisionOcrProvider();
  }

  logger.warn("Falling back to OCR provider", {
    provider: "tesseract",
    reason: "DeepSeek key and Google Vision credentials are unavailable or invalid."
  });
  return new TesseractOcrProvider();
}

function buildExporter(): AccountingExporter | null {
  if (!env.TALLY_ENDPOINT || !env.TALLY_COMPANY) {
    return null;
  }

  return new TallyExporter({
    endpoint: env.TALLY_ENDPOINT,
    companyName: env.TALLY_COMPANY,
    purchaseLedgerName: env.TALLY_PURCHASE_LEDGER
  });
}

async function hasValidDeepSeekCredentials(): Promise<boolean> {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return false;
  }

  const baseUrl = env.DEEPSEEK_BASE_URL.replace(/\/+$/, "");
  try {
    await withTimeout(
      axios.get(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        timeout: OCR_BOOTSTRAP_TIMEOUT_MS
      }),
      OCR_BOOTSTRAP_TIMEOUT_MS
    );
    return true;
  } catch (error) {
    logger.warn("DeepSeek OCR bootstrap validation failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

async function hasValidGoogleVisionCredentials(): Promise<boolean> {
  try {
    if (env.GOOGLE_APPLICATION_CREDENTIALS) {
      await withTimeout(access(env.GOOGLE_APPLICATION_CREDENTIALS), OCR_BOOTSTRAP_TIMEOUT_MS);
    }
    const client = new ImageAnnotatorClient();
    const projectId = await withTimeout(client.getProjectId(), OCR_BOOTSTRAP_TIMEOUT_MS);
    return typeof projectId === "string" && projectId.trim().length > 0;
  } catch (error) {
    logger.warn("Google Vision OCR bootstrap validation failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
