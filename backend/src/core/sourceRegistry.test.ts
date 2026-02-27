import { buildIngestionSources } from "./sourceRegistry.js";
import type { IngestionSourceManifest } from "./runtimeManifest.js";

function buildEmailSource(overrides?: Partial<Extract<IngestionSourceManifest, { type: "email" }>>): IngestionSourceManifest {
  return {
    type: "email",
    key: "gmail-inbox",
    tenantId: "tenant-1",
    workloadTier: "standard",
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    username: "invoice@example.com",
    authMode: "password",
    password: "app-password",
    oauth2: {
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      accessToken: "",
      tokenEndpoint: "https://oauth2.googleapis.com/token"
    },
    mailbox: "INBOX",
    fromFilter: "",
    ...(overrides ?? {})
  };
}

describe("buildIngestionSources", () => {
  it("builds an email ingestion source using password auth", () => {
    const sources = buildIngestionSources([buildEmailSource()]);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.type).toBe("email");
    expect(sources[0]?.key).toBe("gmail-inbox");
  });

  it("throws when password auth is selected without password", () => {
    expect(() =>
      buildIngestionSources([
        buildEmailSource({
          password: ""
        })
      ])
    ).toThrow("Email source password auth selected but EMAIL_PASSWORD is missing.");
  });

  it("builds an email source for oauth2 auth with static access token", () => {
    const sources = buildIngestionSources([
      buildEmailSource({
        authMode: "oauth2",
        password: "",
        oauth2: {
          clientId: "",
          clientSecret: "",
          refreshToken: "",
          accessToken: "ya29.static-token",
          tokenEndpoint: "https://oauth2.googleapis.com/token"
        }
      })
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0]?.type).toBe("email");
  });

  it("throws when oauth2 auth is selected without token credentials", () => {
    expect(() =>
      buildIngestionSources([
        buildEmailSource({
          authMode: "oauth2",
          password: "",
          oauth2: {
            clientId: "",
            clientSecret: "",
            refreshToken: "",
            accessToken: "",
            tokenEndpoint: ""
          }
        })
      ])
    ).toThrow(
      "Email source OAuth2 selected but credentials are incomplete. Provide access token or client_id/client_secret/refresh_token/token_endpoint."
    );
  });
});

