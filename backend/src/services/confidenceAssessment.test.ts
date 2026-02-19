import { assessInvoiceConfidence, getConfidenceTone } from "./confidenceAssessment.ts";

describe("getConfidenceTone", () => {
  it("maps scores to required UI bands", () => {
    expect(getConfidenceTone(65)).toBe("red");
    expect(getConfidenceTone(85)).toBe("yellow");
    expect(getConfidenceTone(91)).toBe("green");
  });
});

describe("assessInvoiceConfidence", () => {
  it("marks strong OCR and complete parse as high confidence", () => {
    const result = assessInvoiceConfidence({
      ocrConfidence: 0.98,
      parsed: {
        invoiceNumber: "INV-1001",
        vendorName: "ACME Corp",
        invoiceDate: "2026-02-18",
        dueDate: "2026-03-02",
        totalAmountMinor: 450000,
        currency: "USD"
      },
      warnings: [],
      expectedMaxTotal: 10000,
      expectedMaxDueDays: 60,
      autoSelectMin: 91,
      referenceDate: new Date("2026-02-19")
    });

    expect(result.score).toBeGreaterThanOrEqual(91);
    expect(result.tone).toBe("green");
    expect(result.autoSelectForApproval).toBe(true);
    expect(result.riskFlags).toEqual([]);
  });

  it("drops confidence when parse quality is weak", () => {
    const result = assessInvoiceConfidence({
      ocrConfidence: 0.55,
      parsed: {
        vendorName: "Partial Vendor"
      },
      warnings: ["w1", "w2", "w3"],
      expectedMaxTotal: 10000,
      expectedMaxDueDays: 60,
      autoSelectMin: 91,
      referenceDate: new Date("2026-02-19")
    });

    expect(result.tone).toBe("red");
    expect(result.score).toBeLessThan(80);
    expect(result.autoSelectForApproval).toBe(false);
  });

  it("normalizes percentage-style OCR confidence values above 1", () => {
    const result = assessInvoiceConfidence({
      ocrConfidence: 96,
      parsed: {
        invoiceNumber: "INV-1001",
        vendorName: "ACME Corp",
        invoiceDate: "2026-02-18",
        totalAmountMinor: 10000,
        currency: "USD"
      },
      warnings: [],
      expectedMaxTotal: 10000,
      expectedMaxDueDays: 60,
      autoSelectMin: 91,
      referenceDate: new Date("2026-02-19")
    });

    expect(result.score).toBeGreaterThanOrEqual(91);
    expect(result.tone).toBe("green");
  });

  it("uses fallback OCR confidence when value is missing", () => {
    const result = assessInvoiceConfidence({
      ocrConfidence: undefined,
      parsed: {
        invoiceNumber: "INV-1001",
        vendorName: "ACME Corp",
        invoiceDate: "2026-02-18",
        totalAmountMinor: 10000,
        currency: "USD"
      },
      warnings: [],
      expectedMaxTotal: 10000,
      expectedMaxDueDays: 60,
      autoSelectMin: 91,
      referenceDate: new Date("2026-02-19")
    });

    expect(result.score).toBeGreaterThan(0);
  });

  it("flags unusually high totals and penalizes confidence", () => {
    const result = assessInvoiceConfidence({
      ocrConfidence: 0.97,
      parsed: {
        invoiceNumber: "INV-1002",
        vendorName: "ACME Corp",
        invoiceDate: "2026-02-18",
        dueDate: "2026-03-02",
        totalAmountMinor: 4500000,
        currency: "USD"
      },
      warnings: [],
      expectedMaxTotal: 10000,
      expectedMaxDueDays: 60,
      autoSelectMin: 91,
      referenceDate: new Date("2026-02-19")
    });

    expect(result.riskFlags).toContain("TOTAL_AMOUNT_ABOVE_EXPECTED");
    expect(result.score).toBeLessThan(91);
    expect(result.autoSelectForApproval).toBe(false);
  });

  it("creates total-risk message without currency prefix when currency is missing", () => {
    const result = assessInvoiceConfidence({
      ocrConfidence: 0.95,
      parsed: {
        invoiceNumber: "INV-1002",
        vendorName: "ACME Corp",
        invoiceDate: "2026-02-18",
        dueDate: "2026-03-02",
        totalAmountMinor: 4500000
      },
      warnings: [],
      expectedMaxTotal: 10000,
      expectedMaxDueDays: 60,
      autoSelectMin: 91,
      referenceDate: new Date("2026-02-19")
    });

    expect(result.riskFlags).toContain("TOTAL_AMOUNT_ABOVE_EXPECTED");
    expect(result.riskMessages[0]).toContain("Total amount 45000.00 exceeds expected max 10000.00.");
  });

  it("flags due dates that are too far out", () => {
    const result = assessInvoiceConfidence({
      ocrConfidence: 0.95,
      parsed: {
        invoiceNumber: "INV-1003",
        vendorName: "ACME Corp",
        invoiceDate: "2026-02-18",
        dueDate: "2026-06-19",
        totalAmountMinor: 200000,
        currency: "USD"
      },
      warnings: [],
      expectedMaxTotal: 10000,
      expectedMaxDueDays: 30,
      autoSelectMin: 91,
      referenceDate: new Date("2026-02-19")
    });

    expect(result.riskFlags).toContain("DUE_DATE_TOO_FAR");
    expect(result.score).toBeLessThan(91);
  });

  it("ignores invalid due date values", () => {
    const result = assessInvoiceConfidence({
      ocrConfidence: 0.95,
      parsed: {
        invoiceNumber: "INV-1003",
        vendorName: "ACME Corp",
        invoiceDate: "2026-02-18",
        dueDate: "bad-date",
        totalAmountMinor: 200000,
        currency: "USD"
      },
      warnings: [],
      expectedMaxTotal: 10000,
      expectedMaxDueDays: 30,
      autoSelectMin: 91,
      referenceDate: new Date("2026-02-19")
    });

    expect(result.riskFlags).not.toContain("DUE_DATE_TOO_FAR");
  });
});
