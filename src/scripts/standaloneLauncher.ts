#!/usr/bin/env node

import { launchDevServer } from "./launcher";

launchDevServer()
  .then((result) => {
    if (result.success) {
      console.log("✅", result.message);
      process.exit(0);
    } else {
      console.error("❌", result.message);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("❌ Failed to launch:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });





