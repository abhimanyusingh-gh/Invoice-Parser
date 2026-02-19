import { Router } from "express";
import type { IngestionService } from "../services/ingestionService.js";

type IngestionJobState = "idle" | "running" | "completed" | "failed";

interface IngestionJobStatus {
  state: IngestionJobState;
  running: boolean;
  totalFiles: number;
  processedFiles: number;
  newInvoices: number;
  duplicates: number;
  failures: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  lastUpdatedAt: string;
}

let currentJobStatus: IngestionJobStatus = buildIdleStatus();

export function createJobsRouter(ingestionService: IngestionService) {
  const router = Router();

  router.get("/jobs/ingest/status", (_req, res) => {
    res.json(currentJobStatus);
  });

  router.post("/jobs/ingest", async (_req, res, next) => {
    if (currentJobStatus.running) {
      res.status(202).json(currentJobStatus);
      return;
    }

    try {
      const startedAt = new Date().toISOString();
      currentJobStatus = {
        state: "running",
        running: true,
        totalFiles: 0,
        processedFiles: 0,
        newInvoices: 0,
        duplicates: 0,
        failures: 0,
        startedAt,
        lastUpdatedAt: startedAt
      };

      void ingestionService
        .runOnce({
          onProgress: async (progress) => {
            currentJobStatus = {
              ...currentJobStatus,
              ...progress,
              state: progress.running ? "running" : currentJobStatus.state,
              running: progress.running
            };
          }
        })
        .then((summary) => {
          const completedAt = new Date().toISOString();
          currentJobStatus = {
            ...currentJobStatus,
            ...summary,
            processedFiles: Math.max(currentJobStatus.processedFiles, summary.totalFiles),
            state: "completed",
            running: false,
            completedAt,
            error: undefined,
            lastUpdatedAt: completedAt
          };
        })
        .catch((error) => {
          const completedAt = new Date().toISOString();
          currentJobStatus = {
            ...currentJobStatus,
            state: "failed",
            running: false,
            completedAt,
            error: error instanceof Error ? error.message : String(error),
            lastUpdatedAt: completedAt
          };
        });

      res.status(202).json(currentJobStatus);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function buildIdleStatus(): IngestionJobStatus {
  return {
    state: "idle",
    running: false,
    totalFiles: 0,
    processedFiles: 0,
    newInvoices: 0,
    duplicates: 0,
    failures: 0,
    lastUpdatedAt: new Date().toISOString()
  };
}
