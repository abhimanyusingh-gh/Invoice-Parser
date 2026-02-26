import path from "node:path";

const DEFAULT_PREVIEW_STORAGE_ROOT = "/tmp/invoice-previews";

export function getPreviewStorageRoot(): string {
  const configured = process.env.PREVIEW_STORAGE_ROOT?.trim();
  if (!configured) {
    return path.resolve(DEFAULT_PREVIEW_STORAGE_ROOT);
  }
  return path.resolve(configured);
}

export function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const root = path.resolve(rootPath);
  const resolved = path.resolve(candidatePath);
  const relative = path.relative(root, resolved);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
