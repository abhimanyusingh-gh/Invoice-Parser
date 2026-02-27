import axios from "axios";

interface TokenApiResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

export interface RefreshGoogleAccessTokenInput {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tokenEndpoint: string;
  timeoutMs: number;
}

export interface RefreshGoogleAccessTokenResult {
  accessToken: string;
  expiresInSeconds: number;
}

interface OAuthHttpClient {
  post(url: string, body: string, options: { headers: Record<string, string>; timeout: number }): Promise<{ data: unknown }>;
}

export async function refreshGoogleAccessToken(
  input: RefreshGoogleAccessTokenInput,
  httpClient: OAuthHttpClient = axios
): Promise<RefreshGoogleAccessTokenResult> {
  const payload = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token"
  });

  const response = await httpClient.post(input.tokenEndpoint, payload.toString(), {
    timeout: input.timeoutMs,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  const body = (response?.data ?? {}) as TokenApiResponse;
  const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";
  if (!accessToken) {
    throw new Error("Google OAuth token response does not contain access_token.");
  }

  const expiresInSeconds = normalizePositiveInteger(body.expires_in, 3600);
  return {
    accessToken,
    expiresInSeconds
  };
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return fallback;
}
