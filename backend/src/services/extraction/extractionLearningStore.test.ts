import { InMemoryExtractionLearningStore, buildCorrectionHint } from "./extractionLearningStore.ts";

describe("ExtractionLearningStore", () => {
  it("upserts and increments count for existing field", async () => {
    const store = new InMemoryExtractionLearningStore();
    await store.recordCorrections("t1", "standard", "invoice-type", [
      { field: "currency", hint: "INR not USD", count: 1, lastSeen: new Date("2026-01-01") }
    ]);
    await store.recordCorrections("t1", "standard", "invoice-type", [
      { field: "currency", hint: "INR not USD v2", count: 1, lastSeen: new Date("2026-02-01") }
    ]);

    const corrections = await store.findCorrections("t1", "standard", "no-vendor");
    const currency = corrections.find((c) => c.field === "currency");
    expect(currency).toBeDefined();
    expect(currency!.count).toBe(2);
    expect(currency!.hint).toBe("INR not USD v2");
  });

  it("caps at 6 entries and evicts oldest lastSeen", async () => {
    const store = new InMemoryExtractionLearningStore();
    const base = new Date("2026-01-01");
    for (let i = 0; i < 7; i++) {
      await store.recordCorrections("t1", "standard", "invoice-type", [
        { field: `field${i}`, hint: `hint ${i}`, count: 1, lastSeen: new Date(base.getTime() + i * 86400000) }
      ]);
    }

    const corrections = await store.findCorrections("t1", "standard", "no-vendor");
    expect(corrections.length).toBeLessThanOrEqual(6);
    expect(corrections.find((c) => c.field === "field0")).toBeUndefined();
    expect(corrections.find((c) => c.field === "field6")).toBeDefined();
  });

  it("merges type-level and vendor-level corrections with vendor overriding", async () => {
    const store = new InMemoryExtractionLearningStore();
    await store.recordCorrections("t1", "gst-tax-invoice", "invoice-type", [
      { field: "currency", hint: "Always INR", count: 3, lastSeen: new Date() },
      { field: "vendorName", hint: "Check header", count: 1, lastSeen: new Date() }
    ]);
    await store.recordCorrections("t1", "vendor-abc", "vendor", [
      { field: "currency", hint: "INR from vendor template", count: 5, lastSeen: new Date() }
    ]);

    const corrections = await store.findCorrections("t1", "gst-tax-invoice", "vendor-abc");

    const currency = corrections.find((c) => c.field === "currency");
    expect(currency!.hint).toBe("INR from vendor template");
    expect(corrections.find((c) => c.field === "vendorName")).toBeDefined();
  });

  it("returns empty array for unknown keys", async () => {
    const store = new InMemoryExtractionLearningStore();
    const corrections = await store.findCorrections("unknown-tenant", "unknown-type", "unknown-vendor");
    expect(corrections).toEqual([]);
  });

  it("truncates hints at 80 chars", async () => {
    const store = new InMemoryExtractionLearningStore();
    const longHint = "A".repeat(120);
    await store.recordCorrections("t1", "standard", "invoice-type", [
      { field: "vendorName", hint: longHint, count: 1, lastSeen: new Date() }
    ]);

    const corrections = await store.findCorrections("t1", "standard", "no-vendor");
    expect(corrections[0]!.hint.length).toBe(80);
  });
});

describe("buildCorrectionHint", () => {
  it("builds a before/after hint", () => {
    expect(buildCorrectionHint("currency", "USD", "INR")).toBe("INR not USD");
  });

  it("returns after value when before is empty", () => {
    expect(buildCorrectionHint("vendorName", "", "ACME Corp")).toBe("ACME Corp");
  });

  it("truncates to 80 chars", () => {
    const long = "A".repeat(100);
    expect(buildCorrectionHint("vendorName", "X", long).length).toBe(80);
  });
});
