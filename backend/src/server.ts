import { createApp } from "./app.js";
import { connectToDatabase } from "./db/connect.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

async function bootstrap() {
  await connectToDatabase();

  const app = await createApp();
  app.listen(env.PORT, () => {
    logger.info("Backend listening", { port: env.PORT });
  });
}

bootstrap().catch((error) => {
  logger.error("Failed to start backend", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
