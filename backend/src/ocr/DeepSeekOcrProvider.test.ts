import axios from "axios";
import { DeepSeekOcrProvider } from "./DeepSeekOcrProvider.ts";

describe("DeepSeekOcrProvider", () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...previousEnv };
  });

  afterAll(() => {
    process.env = previousEnv;
  });

  it("returns empty output for unsupported mime types", async () => {
    const post = jest.fn();
    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });

    const result = await provider.extractText(Buffer.from("content"), "text/plain");

    expect(result).toEqual({
      text: "",
      confidence: 0,
      provider: "deepseek"
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("throws when api key is missing", async () => {
    const provider = new DeepSeekOcrProvider({
      apiKey: "",
      httpClient: { post: jest.fn() }
    });

    await expect(provider.extractText(Buffer.from("image"), "image/png")).rejects.toThrow(
      "DEEPSEEK_API_KEY is required when OCR_PROVIDER=deepseek."
    );
  });

  it("throws when neither options nor env provide api key", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const provider = new DeepSeekOcrProvider({
      httpClient: { post: jest.fn() }
    });

    await expect(provider.extractText(Buffer.from("image"), "image/png")).rejects.toThrow(
      "DEEPSEEK_API_KEY is required when OCR_PROVIDER=deepseek."
    );
  });

  it("maps structured json output into parser-friendly text and normalized confidence", async () => {
    const post = jest.fn(async () => ({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                rawText: "ACME SUPPLIES\nGrand Total 100",
                invoiceNumber: "INV-100",
                vendorName: "ACME SUPPLIES",
                invoiceDate: "2026-02-10",
                dueDate: "2026-02-20",
                currency: "usd",
                totalAmount: "100.50",
                confidence: 97
              })
            }
          }
        ]
      }
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    const result = await provider.extractText(Buffer.from("image"), "image/jpeg");

    expect(result.provider).toBe("deepseek");
    expect(result.confidence).toBe(0.97);
    expect(result.text).toContain("Invoice Number: INV-100");
    expect(result.text).toContain("Vendor: ACME SUPPLIES");
    expect(result.text).toContain("Currency: USD");
    expect(result.text).toContain("Grand Total: 100.5");
  });

  it("handles fenced json blocks and content arrays", async () => {
    const post = jest.fn(async () => ({
      data: {
        choices: [
          {
            message: {
              content: [
                {
                  type: "text",
                  text: "```json\n{\"raw_text\":\"raw text only\",\"confidence\":\"0.88\"}\n```"
                }
              ]
            }
          }
        ]
      }
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    const result = await provider.extractText(Buffer.from("pdf"), "application/pdf");

    expect(result.confidence).toBe(0.88);
    expect(result.text).toBe("raw text only");
  });

  it("falls back to raw content when model output is not json", async () => {
    const post = jest.fn(async () => ({
      data: {
        choices: [
          {
            message: {
              content: "Plain OCR text output"
            }
          }
        ]
      }
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    const result = await provider.extractText(Buffer.from("image"), "image/png");

    expect(result.text).toBe("Plain OCR text output");
    expect(result.confidence).toBeUndefined();
  });

  it("returns empty text when model does not return content", async () => {
    const post = jest.fn(async () => ({
      data: {
        choices: [
          {
            message: {}
          }
        ]
      }
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    const result = await provider.extractText(Buffer.from("image"), "image/png");

    expect(result.text).toBe("");
    expect(result.confidence).toBeUndefined();
  });

  it("uses default timeout when env timeout is invalid", async () => {
    process.env.DEEPSEEK_TIMEOUT_MS = "invalid";
    const post = jest.fn(async (_url: string, _body: unknown, config: { timeout: number }) => ({
      data: {
        choices: [{ message: { content: "{}" } }]
      },
      timeoutSeen: config.timeout
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    await provider.extractText(Buffer.from("image"), "image/png");

    expect(post).toHaveBeenCalled();
    expect(post.mock.calls[0]?.[2]?.timeout).toBe(45000);
  });

  it("uses default timeout when env timeout is non-positive", async () => {
    process.env.DEEPSEEK_TIMEOUT_MS = "0";
    const post = jest.fn(async (_url: string, _body: unknown, config: { timeout: number }) => ({
      data: {
        choices: [{ message: { content: "{}" } }]
      },
      timeoutSeen: config.timeout
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    await provider.extractText(Buffer.from("image"), "image/png");

    expect(post.mock.calls[0]?.[2]?.timeout).toBe(45000);
  });

  it("uses numeric timeout from environment when valid", async () => {
    process.env.DEEPSEEK_TIMEOUT_MS = "1234";
    const post = jest.fn(async (_url: string, _body: unknown, config: { timeout: number }) => ({
      data: {
        choices: [{ message: { content: "{}" } }]
      },
      timeoutSeen: config.timeout
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    await provider.extractText(Buffer.from("image"), "image/png");

    expect(post.mock.calls[0]?.[2]?.timeout).toBe(1234);
  });

  it("handles non-object json payload by falling back to raw text", async () => {
    const post = jest.fn(async () => ({
      data: {
        choices: [{ message: { content: "[]" } }]
      }
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    const result = await provider.extractText(Buffer.from("image"), "image/png");

    expect(result.text).toBe("[]");
  });

  it("keeps non-numeric total amount text and drops invalid confidence values", async () => {
    const post = jest.fn(async () => ({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                rawText: "OCR text",
                total_amount: "one hundred",
                confidence: "NaN"
              })
            }
          }
        ]
      }
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    const result = await provider.extractText(Buffer.from("image"), "image/png");

    expect(result.text).toContain("Grand Total: one hundred");
    expect(result.confidence).toBeUndefined();
  });

  it("uses numeric total amount as-is and ignores blank string fields", async () => {
    const post = jest.fn(async () => ({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                rawText: "OCR text",
                vendorName: "   ",
                totalAmount: 123.45,
                confidence: 0.91
              })
            }
          }
        ]
      }
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    const result = await provider.extractText(Buffer.from("image"), "image/png");

    expect(result.text).toContain("Grand Total: 123.45");
    expect(result.text).not.toContain("Vendor:");
    expect(result.confidence).toBe(0.91);
  });

  it("falls back rawText to original json string when explicit fields are missing", async () => {
    const post = jest.fn(async () => ({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                invoiceNumber: "INV-500"
              })
            }
          }
        ]
      }
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    const result = await provider.extractText(Buffer.from("image"), "image/png");

    expect(result.text).toContain("Invoice Number: INV-500");
    expect(result.text).toContain("\"invoiceNumber\":\"INV-500\"");
  });

  it("handles content arrays with missing segment text", async () => {
    const post = jest.fn(async () => ({
      data: {
        choices: [
          {
            message: {
              content: [{ type: "text" }]
            }
          }
        ]
      }
    }));

    const provider = new DeepSeekOcrProvider({
      apiKey: "test-key",
      httpClient: { post }
    });
    const result = await provider.extractText(Buffer.from("image"), "image/png");

    expect(result.text).toBe("");
  });

  it("uses environment api key and default axios client when options are omitted", async () => {
    process.env.DEEPSEEK_API_KEY = "env-key";

    const post = jest.fn(async () => ({
      data: {
        choices: [{ message: { content: "{\"rawText\":\"from-env\"}" } }]
      }
    }));
    const createSpy = jest.spyOn(axios, "create").mockReturnValue({
      post
    } as unknown as ReturnType<typeof axios.create>);

    const provider = new DeepSeekOcrProvider();
    const result = await provider.extractText(Buffer.from("image"), "image/png");

    expect(createSpy).toHaveBeenCalled();
    expect(post).toHaveBeenCalled();
    expect(result.text).toBe("from-env");

    createSpy.mockRestore();
  });
});
