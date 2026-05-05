// Allows scripts/smoke-materialize.ts to import server modules outside Next.js.
// `server-only` is a guard that throws on import; we shim it to an empty module
// so we can run end-to-end smoke tests directly via tsx.
const Module = require("module");
const path = require("path");

const STUB_PATH = path.join(__dirname, "server-only-empty.cjs");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(request, ...rest) {
  if (request === "server-only") {
    return STUB_PATH;
  }
  return originalResolve.call(this, request, ...rest);
};
