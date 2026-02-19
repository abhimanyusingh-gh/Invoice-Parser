import { Schema, model, type InferSchemaType } from "mongoose";

const checkpointSchema = new Schema(
  {
    sourceKey: { type: String, required: true, unique: true },
    marker: { type: String, required: true },
    metadata: { type: Map, of: String, default: {} }
  },
  {
    timestamps: true
  }
);

type Checkpoint = InferSchemaType<typeof checkpointSchema>;

export const CheckpointModel = model<Checkpoint>("Checkpoint", checkpointSchema);
