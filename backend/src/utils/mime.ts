const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png"
};

const SUPPORTED_INVOICE_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export function normalizeInvoiceMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  return MIME_ALIASES[normalized] ?? normalized;
}

export function isSupportedInvoiceMimeType(mimeType: string): boolean {
  return SUPPORTED_INVOICE_MIME_TYPES.has(normalizeInvoiceMimeType(mimeType));
}
