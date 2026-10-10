// Development server: rebuilds on change with webpack's watch mode and
// serves dist/ on localhost. Uses only Node built-ins.
const http = require("http");
const fs = require("fs");
const path = require("path");
const webpack = require("webpack");
const config = require("./webpack.config.js");

const HOST = "127.0.0.1";
const PORT = parsePort(process.env.PORT, 8080);
const ROOT = config.output.path;

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
});

function whenBuilt(handle) {
  if (compiling) waiting.push(handle);
  else handle();
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

// Maps a URL to a file inside ROOT, or returns null if it must be rejected.
function resolveFile(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
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
      send(res, 200, data, MIME_TYPES[ext] || "application/octet-stream");
    });
  });
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url);
  if (file === null) {
    send(res, 400, "Bad Request");
    return;
  }
  whenBuilt(() => {
    if (buildError) {
      send(res, 500, `Build failed:\n\n${buildError}\n`);
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
