import { describe, expect, it } from "vitest";
import { startReportServer, waitForReportServer } from "./report-server.js";

describe("local report server", () => {
  it("serves the report and deterministic health endpoint", async () => {
    const server = await startReportServer("<!doctype html><title>fixture</title>");
    try {
      const report = await fetch(server.url);
      expect(report.status).toBe(200);
      expect(report.headers.get("content-type")).toContain("text/html");
      expect(await report.text()).toContain("fixture");

      const health = await fetch(new URL("/healthz", server.url));
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({
        status: "ok",
        service: "j-rig-report",
        trust: "unsigned-local",
        audience: "loopback",
      });

      const missing = await fetch(new URL("/missing", server.url));
      expect(missing.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("supports a configured port and rejects non-loopback binds", async () => {
    const server = await startReportServer("report", { port: 0, host: "127.0.0.1" });
    await server.close();
    await expect(startReportServer("report", { host: "0.0.0.0" })).rejects.toThrow(
      "refuses non-loopback host",
    );
    await expect(startReportServer("report", { port: 65_536 })).rejects.toThrow(
      "port must be an integer",
    );
  });

  it("closes cleanly when the operator sends SIGINT", async () => {
    const server = await startReportServer("report");
    const listeners = new Map<string, () => void>();
    const signals = {
      once(event: "SIGINT" | "SIGTERM", listener: () => void) {
        listeners.set(event, listener);
      },
      removeListener(event: "SIGINT" | "SIGTERM", _listener: () => void) {
        void _listener;
        listeners.delete(event);
      },
    };

    const stopped = waitForReportServer(server, signals);
    listeners.get("SIGINT")?.();
    await stopped;
    await expect(fetch(server.url)).rejects.toThrow();
  });
});
