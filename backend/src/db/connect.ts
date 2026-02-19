import mongoose from "mongoose";
import { env } from "../config/env.js";

let connected = false;

export async function connectToDatabase() {
  if (connected) {
    return;
  }

  await mongoose.connect(env.MONGO_URI);
  connected = true;
}
