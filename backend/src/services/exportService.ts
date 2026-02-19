import { Types } from "mongoose";
import type { AccountingExporter } from "../core/interfaces/AccountingExporter.js";
import { ExportBatchModel } from "../models/ExportBatch.js";
import { InvoiceModel } from "../models/Invoice.js";

interface ExportRequest {
  ids?: string[];
  requestedBy: string;
}

export class ExportService {
  constructor(private readonly exporter: AccountingExporter) {}

  async exportApprovedInvoices(request: ExportRequest) {
    const query: Record<string, unknown> = {
      status: "APPROVED"
    };

    if (request.ids && request.ids.length > 0) {
      query._id = {
        $in: request.ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id))
      };
    }

    const invoices = await InvoiceModel.find(query);
    if (invoices.length === 0) {
      return {
        batchId: undefined,
        total: 0,
        successCount: 0,
        failureCount: 0,
        items: []
      };
    }

    const results = await this.exporter.exportInvoices(invoices);

    const successCount = results.filter((item) => item.success).length;
    const failureCount = results.length - successCount;

    const batch = await ExportBatchModel.create({
      system: this.exporter.system,
      total: results.length,
      successCount,
      failureCount,
      requestedBy: request.requestedBy
    });

    const resultMap = new Map(results.map((item) => [item.invoiceId, item]));

    await Promise.all(
      invoices.map(async (invoice) => {
        const result = resultMap.get(String(invoice._id));
        if (!result) {
          return;
        }

        if (result.success) {
          invoice.status = "EXPORTED";
          invoice.export = {
            system: this.exporter.system,
            batchId: String(batch._id),
            exportedAt: new Date(),
            externalReference: result.externalReference
          };
        } else {
          invoice.export = {
            system: this.exporter.system,
            batchId: String(batch._id),
            exportedAt: new Date(),
            error: result.error
          };
          const existingIssues = (invoice.get("processingIssues") as string[] | undefined) ?? [];
          invoice.set("processingIssues", [...existingIssues, `Export failure: ${result.error}`]);
        }

        await invoice.save();
      })
    );

    return {
      batchId: String(batch._id),
      total: results.length,
      successCount,
      failureCount,
      items: results
    };
  }
}
