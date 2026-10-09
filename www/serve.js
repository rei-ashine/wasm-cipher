// Development server: rebuilds on change with webpack's watch mode and
// serves dist/ on localhost. Uses only Node built-ins.
const http = require("http");
const fs = require("fs");
const path = require("path");
const webpack = require("webpack");
const config = require("./webpack.config.js");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 8080;
const ROOT = config.output.path;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

webpack(config).watch({}, (err, stats) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(stats.toString({ colors: true, modules: false }));
});

http
  .createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400).end("Bad Request");
      return;
    }

    // Resolve inside ROOT only, so "../" cannot reach other files
    let file = path.join(ROOT, path.normalize(pathname));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }

    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        res.writeHead(404).end("Not Found");
        return;
      }
      const type = MIME_TYPES[path.extname(file)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(data);
    });
  })
  .listen(PORT, HOST, () => {
    console.log(`Serving ${ROOT} at http://${HOST}:${PORT}/`);
  });
