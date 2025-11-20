import { spawn, exec } from "child_process";
import http from "http";
import path from "path";

const PROJECT_DIR = path.resolve(__dirname, "../..");
const PORT = 3000;
const MAX_WAIT_TIME_MS = 30000; // 30 seconds
const POLL_INTERVAL_MS = 500;
const SERVER_URL = `http://localhost:${PORT}`;

interface LaunchResult {
  success: boolean;
  message: string;
  alreadyRunning?: boolean;
}

/**
 * Check if the server is already running on port 3000
 */
async function isServerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(SERVER_URL, (res) => {
      resolve(res.statusCode !== undefined);
    });

    req.on("error", () => {
      resolve(false);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for the server to become ready by polling
 */
async function waitForServer(maxWaitMs: number): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (await isServerRunning()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return false;
}

/**
 * Open Chrome with the specified URL
 */
function openChrome(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`open -a "Google Chrome" "${url}"`, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Start the dev server
 */
function startDevServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PORT: PORT.toString() };
    const child = spawn("npm", ["run", "dev"], {
      cwd: PROJECT_DIR,
      env,
      stdio: "ignore",
      detached: true,
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.unref(); // Allow parent process to exit independently

    // Give it a moment to start
    setTimeout(() => {
      resolve();
    }, 1000);
  });
}

/**
 * Main launcher function
 */
export async function launchDevServer(): Promise<LaunchResult> {
  try {
    // Check if server is already running
    const running = await isServerRunning();
    if (running) {
      // Server is already running, just open Chrome
      try {
        await openChrome(SERVER_URL);
        return {
          success: true,
          message: "Server was already running. Opened Chrome.",
          alreadyRunning: true,
        };
      } catch (error) {
        return {
          success: false,
          message: `Server is running but failed to open Chrome: ${error instanceof Error ? error.message : String(error)}`,
          alreadyRunning: true,
        };
      }
    }

    // Start the dev server
    await startDevServer();

    // Wait for server to be ready
    const ready = await waitForServer(MAX_WAIT_TIME_MS);
    if (!ready) {
      return {
        success: false,
        message: `Server did not start within ${MAX_WAIT_TIME_MS / 1000} seconds.`,
      };
    }

    // Open Chrome
    try {
      await openChrome(SERVER_URL);
      return {
        success: true,
        message: "Dev server started and Chrome opened successfully.",
      };
    } catch (error) {
      return {
        success: false,
        message: `Server started but failed to open Chrome: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to launch dev server: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

