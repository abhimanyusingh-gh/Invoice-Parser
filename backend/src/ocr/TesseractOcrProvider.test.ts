import { TesseractOcrProvider } from "./TesseractOcrProvider.ts";

const recognizeMock = jest.fn();
const terminateMock = jest.fn();
const createWorkerMock = jest.fn<
  Promise<{ recognize: typeof recognizeMock; terminate: typeof terminateMock }>,
  [string]
>(async () => ({
  recognize: recognizeMock,
  terminate: terminateMock
}));

jest.mock("tesseract.js", () => ({
  createWorker: (lang: string) => createWorkerMock(lang)
}));

describe("TesseractOcrProvider", () => {
  beforeEach(() => {
    recognizeMock.mockReset();
    terminateMock.mockReset();
    createWorkerMock.mockClear();
  });

  it("returns empty output for unsupported mime types", async () => {
    const provider = new TesseractOcrProvider();
    const result = await provider.extractText(Buffer.from("pdf"), "application/pdf");

    expect(result).toEqual({
      text: "",
      confidence: 0,
      provider: "tesseract"
    });
    expect(createWorkerMock).not.toHaveBeenCalled();
  });

  it("extracts text for supported image mime types", async () => {
    recognizeMock.mockResolvedValue({
      data: {
        text: "Invoice Number: INV-1",
        confidence: 88.25
      }
    });

    const provider = new TesseractOcrProvider();
    const result = await provider.extractText(Buffer.from("image"), "image/jpeg");

    expect(result.provider).toBe("tesseract");
    expect(result.text).toContain("INV-1");
    expect(result.confidence).toBe(0.8825);
    expect(createWorkerMock).toHaveBeenCalledWith("eng");
  });

  it("terminates worker during shutdown", async () => {
    recognizeMock.mockResolvedValue({
      data: {
        text: "ok",
        confidence: 50
      }
    });

    const provider = new TesseractOcrProvider();
    await provider.extractText(Buffer.from("image"), "image/png");
    await provider.shutdown();

    expect(terminateMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing on shutdown when worker was not initialized", async () => {
    const provider = new TesseractOcrProvider();
    await expect(provider.shutdown()).resolves.toBeUndefined();
    expect(terminateMock).not.toHaveBeenCalled();
  });

  it("returns undefined confidence when OCR engine confidence is invalid", async () => {
    recognizeMock.mockResolvedValue({
      data: {
        text: "Invoice",
        confidence: Number.NaN
      }
    });

    const provider = new TesseractOcrProvider();
    const result = await provider.extractText(Buffer.from("image"), "image/png");

    expect(result.confidence).toBeUndefined();
  });

  it("falls back to empty string when OCR text is missing", async () => {
    recognizeMock.mockResolvedValue({
      data: {
        confidence: 88.25
      }
    });

    const provider = new TesseractOcrProvider();
    const result = await provider.extractText(Buffer.from("image"), "image/png");

    expect(result.text).toBe("");
    expect(result.confidence).toBe(0.8825);
  });
});
