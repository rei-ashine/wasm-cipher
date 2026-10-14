// Development server: rebuilds on change with webpack's watch mode, serves
// dist/ on localhost and reloads open pages after each build. Uses only
// Node built-ins.
const http = require("http");
const fs = require("fs");
const path = require("path");
const webpack = require("webpack");
const config = require("./webpack.config.js");

const HOST = "127.0.0.1";
const PORT = parsePort(process.env.PORT, 8080);
const ROOT = config.output.path;

// Requests must name this machine, so a page on another site cannot reach
// the server through DNS rebinding
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1"]);

// Pages open this stream and reload when a build finishes
const RELOAD_PATH = "/__livereload";
const RELOAD_SCRIPT = `<script>new EventSource("${RELOAD_PATH}").onmessage = () => location.reload();</script>`;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function parsePort(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`Invalid PORT "${value}": expected an integer from 0 to 65535`);
    process.exit(1);
  }
  return port;
}

// Build state. Requests wait while webpack is compiling, so the browser
// never sees a missing dist/ on first start or a half-written bundle.
let compiling = true;
let buildError = null;
let waiting = [];
const reloadClients = new Set();

const compiler = webpack(config);
compiler.hooks.invalid.tap("serve", () => {
  compiling = true;
});
const watcher = compiler.watch({}, (err, stats) => {
  compiling = false;
  if (err) {
    console.error(err);
    buildError = String(err.stack || err);
  } else {
    console.log(stats.toString({ colors: true, modules: false }));
    buildError = stats.hasErrors()
      ? stats.toString({ colors: false, all: false, errors: true })
      : null;
  }
  const pending = waiting;
  waiting = [];
  pending.forEach((handle) => handle());
  reloadClients.forEach((client) => client.write("data: reload\n\n"));
});

function whenBuilt(handle) {
  if (compiling) waiting.push(handle);
  else handle();
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function isAllowedHost(host) {
  if (!host) return false;
  return ALLOWED_HOSTS.has(host.replace(/:\d+$/, "").toLowerCase());
}

function openReloadStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");
  reloadClients.add(res);
  req.on("close", () => reloadClients.delete(res));
}

function injectReload(html) {
  const end = html.lastIndexOf("</body>");
  return end === -1
    ? html + RELOAD_SCRIPT
    : html.slice(0, end) + RELOAD_SCRIPT + html.slice(end);
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Maps a URL to a file inside ROOT, or returns null if it must be rejected.
function resolveFile(url) {
  // Read the target as a plain path: new URL() would take a leading "//"
  // as a host name and drop the first path segment
  const rawPath = url.split(/[?#]/, 1)[0];
  if (!rawPath.startsWith("/")) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  // fs throws synchronously on paths containing NUL
  if (pathname.includes("\0")) return null;

  // Resolve inside ROOT only, so "../" cannot reach other files
  const file = path.join(ROOT, path.normalize(pathname));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  return file;
}

function serveFile(res, file) {
  fs.stat(file, (statErr, stats) => {
    if (statErr) {
      send(res, 404, "Not Found");
      return;
    }
    const target = stats.isDirectory() ? path.join(file, "index.html") : file;
    fs.readFile(target, (readErr, data) => {
      if (readErr) {
        send(res, 404, "Not Found");
        return;
      }
      const ext = path.extname(target).toLowerCase();
      const body = ext === ".html" ? injectReload(data.toString("utf8")) : data;
      send(res, 200, body, MIME_TYPES[ext] || "application/octet-stream");
    });
  });
}

const server = http.createServer((req, res) => {
  if (!isAllowedHost(req.headers.host)) {
    send(res, 403, "Invalid Host header");
    return;
  }
  if (req.url === RELOAD_PATH) {
    openReloadStream(req, res);
    return;
  }
  const file = resolveFile(req.url);
  if (file === null) {
    send(res, 400, "Bad Request");
    return;
  }
  whenBuilt(() => {
    if (buildError) {
      // HTML with the reload script, so the page recovers once the build
      // is fixed
      const page = `<!doctype html><meta charset="utf-8"><title>Build failed</title><pre>Build failed:\n\n${escapeHtml(buildError)}</pre>${RELOAD_SCRIPT}`;
      send(res, 500, page, MIME_TYPES[".html"]);
      return;
    }
    serveFile(res, file);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use; set PORT to choose another`);
  } else {
    console.error(err);
  }
  watcher.close(() => process.exit(1));
});

server.listen(PORT, HOST, () => {
  const { port } = server.address();
  console.log(`Serving ${ROOT} at http://${HOST}:${port}/`);
});
