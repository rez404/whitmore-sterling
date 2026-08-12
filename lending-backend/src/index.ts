import { assertRunnable, config } from "./config.js";
import { wallet } from "./chain.js";
import { startLoop } from "./keeper.js";
import { startServer } from "./server.js";

console.log("[boot] Whitmore Sterling keeper");
console.log("[boot] rpc      ", config.rpcUrl);
console.log("[boot] chain    ", config.chainId);
console.log("[boot] vaults   ", config.vaults.length ? config.vaults.join(", ") : "(none)");
console.log("[boot] interval ", `${config.intervalMs / 1000}s`);
console.log("[boot] keeper   ", wallet?.address ?? "(read-only, no key)");
console.log("[boot] mode     ", config.dryRun ? "DRY RUN — no transactions will be sent" : "LIVE");

try {
  assertRunnable();
} catch (e: any) {
  console.error("[boot] refusing to start:", e.message);
  process.exit(1);
}

const server = startServer();
const stopLoop = startLoop();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[shutdown] ${signal} received`);
    stopLoop();
    server.close(() => process.exit(0));
    // Do not wait forever on a hung connection.
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
