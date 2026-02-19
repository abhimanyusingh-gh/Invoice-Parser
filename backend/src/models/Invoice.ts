import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { InvoiceStatuses } from "../types/invoice.js";
import { ConfidenceTones, RiskFlags } from "../types/confidence.js";

const invoiceSchema = new Schema(
  {
    sourceType: { type: String, required: true },
    sourceKey: { type: String, required: true },
    sourceDocumentId: { type: String, required: true },
    attachmentName: { type: String, required: true },
    mimeType: { type: String, required: true },
    receivedAt: { type: Date, required: true },

    ocrProvider: { type: String },
    ocrText: { type: String },
    ocrConfidence: { type: Number },
    confidenceScore: { type: Number, default: 0 },
    confidenceTone: { type: String, enum: ConfidenceTones, default: "red" },
    autoSelectForApproval: { type: Boolean, default: false },
    riskFlags: { type: [String], enum: RiskFlags, default: [] },
    riskMessages: { type: [String], default: [] },

    parsed: {
      invoiceNumber: { type: String },
      vendorName: { type: String },
      invoiceDate: { type: String },
      dueDate: { type: String },
      totalAmountMinor: {
        type: Number,
        validate: {
          validator: Number.isInteger,
          message: "parsed.totalAmountMinor must be an integer."
        }
      },
      currency: { type: String },
      notes: { type: [String], default: [] }
    },

    status: { type: String, enum: InvoiceStatuses, required: true },
    processingIssues: { type: [String], default: [] },

    approval: {
      approvedBy: { type: String },
      approvedAt: { type: Date }
    },

    export: {
      system: { type: String },
      batchId: { type: String },
      exportedAt: { type: Date },
      externalReference: { type: String },
      error: { type: String }
    },

    metadata: { type: Map, of: String, default: {} }
  },
  {
    timestamps: true
  }
);

invoiceSchema.index(
  {
    sourceType: 1,
    sourceKey: 1,
    sourceDocumentId: 1,
    attachmentName: 1
  },
  { unique: true }
);

invoiceSchema.index({ status: 1, createdAt: -1 });

type Invoice = InferSchemaType<typeof invoiceSchema>;
export type InvoiceDocument = HydratedDocument<Invoice>;

export const InvoiceModel = model<Invoice>("Invoice", invoiceSchema);
