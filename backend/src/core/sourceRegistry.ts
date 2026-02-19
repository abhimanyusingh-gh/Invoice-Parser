import { env } from "../config/env.js";
import type { IngestionSource } from "./interfaces/IngestionSource.js";
import { EmailIngestionSource } from "../sources/EmailIngestionSource.js";
import { FolderIngestionSource } from "../sources/FolderIngestionSource.js";

export function buildIngestionSources(): IngestionSource[] {
  const sources: IngestionSource[] = [];

  for (const sourceType of env.ingestionSources) {
    if (sourceType === "email") {
      if (!env.EMAIL_HOST || !env.EMAIL_USERNAME || !env.EMAIL_PASSWORD) {
        throw new Error("Email source selected but EMAIL_HOST/EMAIL_USERNAME/EMAIL_PASSWORD are missing.");
      }

      sources.push(
        new EmailIngestionSource({
          key: env.EMAIL_SOURCE_KEY,
          host: env.EMAIL_HOST,
          port: env.EMAIL_PORT,
          secure: env.EMAIL_SECURE,
          username: env.EMAIL_USERNAME,
          password: env.EMAIL_PASSWORD,
          mailbox: env.EMAIL_MAILBOX,
          fromFilter: env.EMAIL_FROM_FILTER
        })
      );
      continue;
    }

    if (sourceType === "folder") {
      if (!env.FOLDER_SOURCE_PATH) {
        throw new Error("Folder source selected but FOLDER_SOURCE_PATH is missing.");
      }

      sources.push(
        new FolderIngestionSource({
          key: env.FOLDER_SOURCE_KEY,
          folderPath: env.FOLDER_SOURCE_PATH,
          recursive: env.FOLDER_RECURSIVE
        })
      );
      continue;
    }

    throw new Error(`Unsupported ingestion source '${sourceType}'. Add an IngestionSource implementation to support it.`);
  }

  return sources;
}
