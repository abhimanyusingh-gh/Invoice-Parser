import axios from "axios";
import type { OcrProvider, OcrResult } from "../core/interfaces/OcrProvider.js";

const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

interface DeepSeekChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

interface DeepSeekOcrPayload {
  rawText: string;
  invoiceNumber?: string;
  vendorName?: string;
  invoiceDate?: string;
  dueDate?: string;
  currency?: string;
  totalAmount?: string | number;
  confidence?: number;
}

interface DeepSeekHttpClient {
  post(
    url: string,
    body: unknown,
    config: { headers: Record<string, string>; timeout: number }
  ): Promise<{ data: unknown }>;
}

interface DeepSeekOcrProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  httpClient?: DeepSeekHttpClient;
}

export class DeepSeekOcrProvider implements OcrProvider {
  readonly name = "deepseek";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly httpClient: DeepSeekHttpClient;

  constructor(options?: DeepSeekOcrProviderOptions) {
    this.apiKey = options?.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "";
    this.model = options?.model ?? process.env.DEEPSEEK_OCR_MODEL ?? "deepseek-chat";
    this.timeoutMs = options?.timeoutMs ?? readTimeoutMsFromEnv();
    const baseUrl = options?.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
    this.httpClient =
      options?.httpClient ??
      axios.create({
        baseURL: baseUrl
      });
  }

  async extractText(buffer: Buffer, mimeType: string): Promise<OcrResult> {
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      return {
        text: "",
        confidence: 0,
        provider: this.name
      };
    }

    if (!this.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required when OCR_PROVIDER=deepseek.");
    }

    const response = await this.httpClient.post(
      "/chat/completions",
      {
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an OCR extractor for invoices. Return strict JSON with keys: rawText, confidence, invoiceNumber, vendorName, invoiceDate, dueDate, currency, totalAmount."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the invoice OCR text and important fields from this file."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${buffer.toString("base64")}`
                }
              }
            ]
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: this.timeoutMs
      }
    );

    const rawContent = readDeepSeekContent(response.data as DeepSeekChatCompletionResponse);
    const parsedPayload = parseDeepSeekPayload(rawContent);
    const normalizedText = buildParserFriendlyText(parsedPayload);

    return {
      text: normalizedText,
      confidence: normalizeConfidence(parsedPayload.confidence),
      provider: this.name
    };
  }
}

function readTimeoutMsFromEnv(): number {
  const rawValue = process.env.DEEPSEEK_TIMEOUT_MS;
  if (!rawValue) {
    return 45_000;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 45_000;
  }

  return parsed;
}

function readDeepSeekContent(response: DeepSeekChatCompletionResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((segment) => segment.text ?? "")
      .join("\n")
      .trim();
  }

  return "";
}

function parseDeepSeekPayload(rawContent: string): DeepSeekOcrPayload {
  const cleanedContent = stripJsonFence(rawContent);
  if (!cleanedContent) {
    return { rawText: "" };
  }

  try {
    const parsed = JSON.parse(cleanedContent) as unknown;
    if (isRecord(parsed)) {
      return {
        rawText: normalizeText(parsed.rawText) ?? normalizeText(parsed.raw_text) ?? rawContent,
        invoiceNumber: normalizeText(parsed.invoiceNumber) ?? normalizeText(parsed.invoice_number),
        vendorName: normalizeText(parsed.vendorName) ?? normalizeText(parsed.vendor_name),
        invoiceDate: normalizeText(parsed.invoiceDate) ?? normalizeText(parsed.invoice_date),
        dueDate: normalizeText(parsed.dueDate) ?? normalizeText(parsed.due_date),
        currency: normalizeCurrency(parsed.currency),
        totalAmount: normalizeAmount(parsed.totalAmount) ?? normalizeAmount(parsed.total_amount),
        confidence: normalizeNumber(parsed.confidence)
      };
    }
  } catch {
    return {
      rawText: rawContent
    };
  }

  return {
    rawText: rawContent
  };
}

function buildParserFriendlyText(payload: DeepSeekOcrPayload): string {
  const lines: string[] = [];

  if (payload.invoiceNumber) {
    lines.push(`Invoice Number: ${payload.invoiceNumber}`);
  }

  if (payload.vendorName) {
    lines.push(`Vendor: ${payload.vendorName}`);
  }

  if (payload.invoiceDate) {
    lines.push(`Invoice Date: ${payload.invoiceDate}`);
  }

  if (payload.dueDate) {
    lines.push(`Due Date: ${payload.dueDate}`);
  }

  if (payload.currency) {
    lines.push(`Currency: ${payload.currency}`);
  }

  if (payload.totalAmount !== undefined) {
    lines.push(`Grand Total: ${payload.totalAmount}`);
  }

  if (payload.rawText) {
    lines.push(payload.rawText);
  }

  return lines.join("\n").trim();
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

function normalizeConfidence(value?: number): number | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }

  if (value > 1) {
    return Math.max(0, Math.min(1, Number((value / 100).toFixed(4))));
  }

  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeCurrency(value: unknown): string | undefined {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : undefined;
}

function normalizeAmount(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = normalizeText(value);
  if (!text) {
    return undefined;
  }

  const parsed = Number(text.replace(/,/g, ""));
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return text;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
