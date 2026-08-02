import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);

export interface ReportServerOptions {
  /** Only loopback addresses are accepted; the default is IPv4 loopback. */
  host?: string;
  /** TCP port, or 0 to ask the OS for an available local port. */
  port?: number;
}

export interface ReportServerHandle {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

interface SignalSource {
  once(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  removeListener(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

function validateOptions(options: ReportServerOptions): { host: string; port: number } {
  const host = options.host ?? "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`report server refuses non-loopback host "${host}"; use 127.0.0.1 or ::1`);
  }

  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`report server port must be an integer from 0 to 65535 (received ${port})`);
  }
  return { host, port };
}

function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  headOnly: boolean,
): void {
  const bodyBytes = Buffer.byteLength(body, "utf8");
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": bodyBytes,
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });
  if (headOnly) response.end();
  else response.end(body);
}

function requestPath(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  } catch {
    return "";
  }
}

/** Build the small, deterministic request handler used by the local server. */
export function createReportRequestHandler(html: string) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const headOnly = request.method === "HEAD";
    const readable = request.method === "GET" || headOnly;
    const path = requestPath(request);

    if (!readable) {
      send(response, 405, "text/plain; charset=utf-8", "Method Not Allowed\n", false);
      return;
    }

    if (path === "/healthz") {
      send(
        response,
        200,
        "application/json; charset=utf-8",
        '{"status":"ok","service":"j-rig-report","trust":"unsigned-local","audience":"loopback"}\n',
        headOnly,
      );
      return;
    }

    if (path === "/" || path === "/index.html") {
      send(response, 200, "text/html; charset=utf-8", html, headOnly);
      return;
    }

    send(response, 404, "text/plain; charset=utf-8", "Not Found\n", headOnly);
  };
}

/** Start a report server. It can only bind to loopback. */
export async function startReportServer(
  html: string,
  options: ReportServerOptions = {},
): Promise<ReportServerHandle> {
  const { host, port } = validateOptions(options);
  const server = createServer(createReportRequestHandler(html));

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.removeListener("error", onError);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;
  const urlHost = host === "::1" ? `[${host}]` : host;
  return {
    server,
    host,
    port: actualPort,
    url: `http://${urlHost}:${actualPort}/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** Wait for Ctrl-C/termination and close the server without leaking handlers. */
export async function waitForReportServer(
  handle: ReportServerHandle,
  signalSource: SignalSource = process,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      signalSource.removeListener("SIGINT", stop);
      signalSource.removeListener("SIGTERM", stop);
      handle.close().then(resolve).catch(reject);
    };
    signalSource.once("SIGINT", stop);
    signalSource.once("SIGTERM", stop);
  });
}
