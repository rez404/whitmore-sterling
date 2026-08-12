import { createServer } from "node:http";
import { config } from "./config.js";
import { runOnce, state } from "./keeper.js";

export function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (url.pathname === "/health") {
      const healthy = state.errors === 0 || state.runs > state.errors;
      res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: healthy, ...state, history: state.history.slice(0, 10) }, null, 2));
      return;
    }

    if (url.pathname === "/metrics") {
      const lines = [
        "# HELP keeper_runs_total Scheduler ticks completed",
        "# TYPE keeper_runs_total counter",
        `keeper_runs_total ${state.runs}`,
        "# HELP keeper_compounds_total Vault compound transactions sent",
        "# TYPE keeper_compounds_total counter",
        `keeper_compounds_total ${state.compounded}`,
        "# HELP keeper_errors_total Errors encountered",
        "# TYPE keeper_errors_total counter",
        `keeper_errors_total ${state.errors}`,
        "# HELP keeper_balance_eth Gas balance of the keeper wallet",
        "# TYPE keeper_balance_eth gauge",
        `keeper_balance_eth ${state.keeperBalanceEth ?? 0}`,
      ];
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      res.end(lines.join("\n") + "\n");
      return;
    }

    // Manual trigger, handy during a deploy. Read-only while DRY_RUN is on.
    if (url.pathname === "/run" && req.method === "POST") {
      const results = await runOnce();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ results }, null, 2));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found", routes: ["/health", "/metrics", "POST /run"] }));
  });

  server.listen(config.port, () => console.log(`[server] listening on :${config.port}`));
  return server;
}
