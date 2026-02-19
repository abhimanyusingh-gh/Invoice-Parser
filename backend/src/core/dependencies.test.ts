const mockEnv = {
  NODE_ENV: "test",
  PORT: 4000,
  MONGO_URI: "mongodb://127.0.0.1:27017/test",
  INGESTION_SOURCES: "folder",
  ingestionSources: ["folder"],
  EMAIL_SOURCE_KEY: "email-inbox",
  EMAIL_HOST: undefined,
  EMAIL_PORT: 993,
  EMAIL_SECURE: true,
  EMAIL_USERNAME: undefined,
  EMAIL_PASSWORD: undefined,
  EMAIL_MAILBOX: "INBOX",
  EMAIL_FROM_FILTER: undefined,
  FOLDER_SOURCE_KEY: "folder-local",
  FOLDER_SOURCE_PATH: "/tmp",
  FOLDER_RECURSIVE: false,
  OCR_PROVIDER: "auto" as "auto" | "google-vision" | "tesseract" | "deepseek" | "mock",
  GOOGLE_APPLICATION_CREDENTIALS: undefined as string | undefined,
  DEEPSEEK_API_KEY: undefined as string | undefined,
  DEEPSEEK_BASE_URL: "https://api.deepseek.com/v1",
  DEEPSEEK_OCR_MODEL: "deepseek-chat",
  DEEPSEEK_TIMEOUT_MS: 45000,
  MOCK_OCR_TEXT: undefined as string | undefined,
  MOCK_OCR_CONFIDENCE: undefined as number | undefined,
  CONFIDENCE_EXPECTED_MAX_TOTAL: 100000,
  CONFIDENCE_EXPECTED_MAX_DUE_DAYS: 90,
  CONFIDENCE_AUTO_SELECT_MIN: 91,
  TALLY_ENDPOINT: undefined as string | undefined,
  TALLY_COMPANY: undefined as string | undefined,
  TALLY_PURCHASE_LEDGER: "Purchase",
  DEFAULT_APPROVER: "system"
};

const axiosGetMock = jest.fn();
const accessMock = jest.fn();
const getProjectIdMock = jest.fn();

const mockProviderInstance = { name: "mock" };
const tesseractProviderInstance = { name: "tesseract" };
const deepSeekProviderInstance = { name: "deepseek" };
const googleProviderInstance = { name: "google-vision" };

const MockOcrProviderCtorMock = jest.fn(() => mockProviderInstance);
const TesseractOcrProviderCtorMock = jest.fn(() => tesseractProviderInstance);
const DeepSeekOcrProviderCtorMock = jest.fn(() => deepSeekProviderInstance);
const GoogleVisionOcrProviderCtorMock = jest.fn(() => googleProviderInstance);

jest.mock("../config/env.js", () => ({
  env: mockEnv
}));

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => axiosGetMock(...args)
  }
}));

jest.mock("node:fs/promises", () => ({
  access: (...args: unknown[]) => accessMock(...args)
}));

jest.mock("@google-cloud/vision", () => ({
  ImageAnnotatorClient: jest.fn(() => ({
    getProjectId: (...args: unknown[]) => getProjectIdMock(...args)
  }))
}));

jest.mock("../ocr/MockOcrProvider.js", () => ({
  MockOcrProvider: jest.fn().mockImplementation(() => MockOcrProviderCtorMock())
}));

jest.mock("../ocr/TesseractOcrProvider.js", () => ({
  TesseractOcrProvider: jest.fn().mockImplementation(() => TesseractOcrProviderCtorMock())
}));

jest.mock("../ocr/DeepSeekOcrProvider.js", () => ({
  DeepSeekOcrProvider: jest.fn().mockImplementation(() => DeepSeekOcrProviderCtorMock())
}));

jest.mock("../ocr/GoogleVisionOcrProvider.js", () => ({
  GoogleVisionOcrProvider: jest.fn().mockImplementation(() => GoogleVisionOcrProviderCtorMock())
}));

jest.mock("../utils/logger.js", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

import { resolveOcrProvider } from "./dependencies.ts";

describe("resolveOcrProvider", () => {
  beforeEach(() => {
    mockEnv.OCR_PROVIDER = "auto";
    mockEnv.DEEPSEEK_API_KEY = undefined;
    mockEnv.GOOGLE_APPLICATION_CREDENTIALS = undefined;
    axiosGetMock.mockReset();
    accessMock.mockReset();
    getProjectIdMock.mockReset();
    MockOcrProviderCtorMock.mockClear();
    TesseractOcrProviderCtorMock.mockClear();
    DeepSeekOcrProviderCtorMock.mockClear();
    GoogleVisionOcrProviderCtorMock.mockClear();
  });

  it("uses mock provider when explicitly configured", async () => {
    mockEnv.OCR_PROVIDER = "mock";

    const provider = await resolveOcrProvider();
    expect(provider).toBe(mockProviderInstance);
  });

  it("prefers deepseek when deepseek key validates", async () => {
    mockEnv.DEEPSEEK_API_KEY = "valid-key";
    axiosGetMock.mockResolvedValue({ data: { data: [] } });

    const provider = await resolveOcrProvider();

    expect(provider).toBe(deepSeekProviderInstance);
    expect(axiosGetMock).toHaveBeenCalledTimes(1);
    expect(GoogleVisionOcrProviderCtorMock).not.toHaveBeenCalled();
  });

  it("falls back to google vision when deepseek validation fails", async () => {
    mockEnv.DEEPSEEK_API_KEY = "invalid-key";
    axiosGetMock.mockRejectedValue(new Error("401 Unauthorized"));
    getProjectIdMock.mockResolvedValue("demo-project");

    const provider = await resolveOcrProvider();

    expect(provider).toBe(googleProviderInstance);
    expect(DeepSeekOcrProviderCtorMock).not.toHaveBeenCalled();
    expect(GoogleVisionOcrProviderCtorMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to tesseract when deepseek and google are unavailable", async () => {
    mockEnv.DEEPSEEK_API_KEY = "invalid-key";
    mockEnv.GOOGLE_APPLICATION_CREDENTIALS = "/bad/path.json";
    axiosGetMock.mockRejectedValue(new Error("network failure"));
    accessMock.mockRejectedValue(new Error("ENOENT"));
    getProjectIdMock.mockRejectedValue(new Error("missing credentials"));

    const provider = await resolveOcrProvider();

    expect(provider).toBe(tesseractProviderInstance);
    expect(TesseractOcrProviderCtorMock).toHaveBeenCalledTimes(1);
  });
});
