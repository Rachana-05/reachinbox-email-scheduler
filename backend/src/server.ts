import dotenv from "dotenv";

dotenv.config();

import app from "./app";
import { initializeElasticsearch } from "./elasticsearch";

const PORT =
  Number(process.env.PORT) || 5001;

const startServer = async () => {
  try {
    await initializeElasticsearch();

    app.listen(PORT, () => {
      console.log(
        `🚀 Server running on http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "❌ Failed to start server:",
      error
    );

    process.exit(1);
  }
};

startServer();