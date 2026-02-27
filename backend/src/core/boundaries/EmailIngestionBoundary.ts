import type { IngestedFile } from "../interfaces/IngestionSource.js";

export interface EmailIngestionBoundary {
  fetchNewFiles(lastCheckpoint: string | null): Promise<IngestedFile[]>;
}

