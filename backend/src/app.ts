import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { buildDependencies } from "./core/dependencies.js";
import { createInvoiceRouter } from "./routes/invoices.js";
import { createExportRouter } from "./routes/export.js";
import { createJobsRouter } from "./routes/jobs.js";

export async function createApp() {
  const dependencies = await buildDependencies();
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.use("/", healthRouter);
  app.use("/api", createInvoiceRouter(dependencies.invoiceService));
  app.use("/api", createJobsRouter(dependencies.ingestionService));
  app.use("/api", createExportRouter(dependencies.exportService));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown server error";
    res.status(500).json({ message });
  });

  return app;
}
