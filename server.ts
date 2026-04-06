// checkSchemaVersion has NO pino dependency — must be imported before any module
// that loads lib/logger.ts (which spawns pino's worker thread).  Importing it
// first guarantees process.exit(1) fires cleanly if the schema is wrong.
import { checkSchemaVersion } from "./lib/db/checkSchemaVersion";
import { createServer } from "http";
import { parse } from "url";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const PORTS = [3001, 3002, 3003];

function tryListen(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url!, true);
      handle(req, res, parsedUrl);
    });

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.log(`Port ${port} in use, trying next...`);
      }
      reject(err);
    });

    server.listen(port, () => {
      console.log(`> Ready on http://localhost:${port}`);
      resolve();
    });
  });
}

// Run before pino's worker thread is registered (pino loads later via route imports).
checkSchemaVersion();

async function start() {
  await app.prepare();

  for (const port of PORTS) {
    try {
      await tryListen(port);
      return;
    } catch (err: any) {
      if (err.code !== "EADDRINUSE") throw err;
    }
  }

  throw new Error(`All ports (${PORTS.join(", ")}) are in use.`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
