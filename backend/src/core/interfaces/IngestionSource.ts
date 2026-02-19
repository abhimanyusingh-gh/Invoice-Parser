export interface IngestedFile {
  sourceKey: string;
  sourceType: string;
  sourceDocumentId: string;
  attachmentName: string;
  mimeType: string;
  receivedAt: Date;
  buffer: Buffer;
  checkpointValue: string;
  metadata: Record<string, string>;
}

export interface IngestionSource {
  readonly key: string;
  readonly type: string;
  fetchNewFiles(lastCheckpoint: string | null): Promise<IngestedFile[]>;
}
