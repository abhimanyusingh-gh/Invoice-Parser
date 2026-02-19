import { runInvoiceExtractionAgent } from "./invoiceExtractionAgent.ts";

describe("runInvoiceExtractionAgent", () => {
  it("selects the candidate with stronger invoice signal quality", () => {
    const weakCandidate = [
      "Invoice Number: INV-5001",
      "Vendor: Coastal Supply",
      "Subtotal: 780.00",
      "Tax: 140.40"
    ].join("\n");

    const strongCandidate = [
      "Invoice Number: INV-5001",
      "Vendor: Coastal Supply",
      "Invoice Date: 2026-02-18",
      "Currency: USD",
      "Grand Total: 920.40"
    ].join("\n");

    const result = runInvoiceExtractionAgent({
      candidates: [
        { text: weakCandidate, provider: "mock", confidence: 0.97, source: "ocr-provider" },
        { text: strongCandidate, provider: "mock", confidence: 0.88, source: "ocr-provider" }
      ],
      expectedMaxTotal: 100000,
      expectedMaxDueDays: 90,
      autoSelectMin: 91
    });

    expect(result.parseResult.parsed.totalAmountMinor).toBe(92040);
    expect(result.parseResult.parsed.currency).toBe("USD");
  });

  it("repairs OCR-confused amount tokens and picks repaired strategy", () => {
    const noisyOcrText = [
      "lnvoice Number: INV-998",
      "Vendor: Delta Services",
      "Currency: USD",
      "Grand T0tal: 2,45O.OO"
    ].join("\n");

    const result = runInvoiceExtractionAgent({
      candidates: [{ text: noisyOcrText, provider: "mock", confidence: 0.9, source: "ocr-provider" }],
      expectedMaxTotal: 100000,
      expectedMaxDueDays: 90,
      autoSelectMin: 91
    });

    expect(result.strategy).toBe("ocr-repair");
    expect(result.parseResult.parsed.invoiceNumber).toBe("INV-998");
    expect(result.parseResult.parsed.totalAmountMinor).toBe(245000);
  });
});
