// =============================================================================
// server.js — Robust Node.js HTTP Server
// =============================================================================
// A production-hardened HTTP server built exclusively on the Node.js standard
// library (zero external dependencies). Addresses five critical robustness
// dimensions: server error handling, graceful shutdown, HTTP method/URL
// validation, request/response stream error handling, and process-level
// exception safety nets.
// =============================================================================

const http = require('http');

const hostname = '127.0.0.1';
const port = 3000;

// Whitelist of HTTP methods this server will accept. Any method not in this
// array receives a 405 Method Not Allowed response with an Allow header.
const ALLOWED_METHODS = ['GET'];

// Maximum time (ms) to wait for in-flight connections to drain during graceful
// shutdown before forcing process termination.
const SHUTDOWN_TIMEOUT_MS = 5000;

// Guard flag that prevents duplicate shutdown sequences and causes the request
// handler to reject new requests with 503 Service Unavailable during drain.
let isShuttingDown = false;

// =============================================================================
// Request Handler — Validation, Error Handling, and Response
// =============================================================================
const server = http.createServer((req, res) => {
  // ---- Request stream error handler (Root Cause 4) -------------------------
  // Catches client-side aborts, broken connections, and malformed payloads that
  // cause the request stream to emit an 'error' event. Responds with 400 Bad
  // Request if response headers have not already been sent.
  req.on('error', (err) => {
    console.error(`Request error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request\n');
    }
  });

  // ---- Response stream error handler (Root Cause 4) ------------------------
  // Catches broken pipe and other write-side errors (e.g., client disconnects
  // mid-response). Logged but intentionally not re-thrown so the server process
  // continues serving other clients.
  res.on('error', (err) => {
    console.error(`Response error: ${err.message}`);
  });

  // ---- Shutdown guard (Root Cause 2) ---------------------------------------
  // If the server is in the process of shutting down, reject new requests with
  // 503 Service Unavailable and signal the client to close its connection so
  // the drain completes as quickly as possible.
  if (isShuttingDown) {
    res.writeHead(503, {
      'Content-Type': 'text/plain',
      'Connection': 'close'
    });
    res.end('Service Unavailable\n');
    return;
  }

  // ---- HTTP method validation (Root Cause 3) -------------------------------
  // Only methods in the ALLOWED_METHODS whitelist are served. All others
  // receive 405 Method Not Allowed with an Allow header per RFC 7231 §6.5.5.
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.writeHead(405, {
      'Content-Type': 'text/plain',
      'Allow': ALLOWED_METHODS.join(', ')
    });
    res.end('Method Not Allowed\n');
    return;
  }

  // ---- URL path validation (Root Cause 3) ----------------------------------
  // Only the root path '/' is a valid endpoint. All other paths receive a
  // 404 Not Found response.
  if (req.url !== '/') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found\n');
    return;
  }

  // ---- Successful response (preserved from original) -----------------------
  // Valid GET / request: respond with 200 OK and the "Hello, World!" payload.
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello, World!\n');
});

// =============================================================================
// Timeout Configuration — Resource Exhaustion Prevention
// =============================================================================
// keepAliveTimeout: milliseconds of inactivity on a keep-alive socket before
// the server destroys it, preventing idle connections from consuming resources.
server.keepAliveTimeout = 5000;

// headersTimeout: maximum milliseconds to wait for the complete HTTP headers.
// Protects against slowloris-style attacks and misconfigured clients.
server.headersTimeout = 8000;

// =============================================================================
// Server Error Handler (Root Cause 1) — Bind and Runtime Errors
// =============================================================================
// Attached BEFORE server.listen() to guarantee the listener is in place when
// the 'error' event fires. Without this, Node.js throws the error as an
// uncaught exception (default EventEmitter behavior).
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Server cannot start.`);
  } else if (err.code === 'EACCES') {
    console.error(`Permission denied. Cannot bind to port ${port}.`);
  } else {
    console.error(`Server error: ${err.message}`);
  }
  process.exit(1);
});

// =============================================================================
// Server Close Logger — Connection Drain Confirmation
// =============================================================================
// Fires once all connections have been terminated and the server is fully
// closed, providing a definitive log entry for operational observability.
server.on('close', () => {
  console.log('All connections drained. Server closed.');
});

// =============================================================================
// Graceful Shutdown (Root Cause 2) — Signal-Driven Connection Drain
// =============================================================================
// Orchestrates an orderly shutdown: stops accepting new connections, waits for
// in-flight requests to complete, and force-exits if draining exceeds the
// configured timeout.
function gracefulShutdown(signal) {
  // Guard against duplicate invocations (e.g., rapid Ctrl+C presses or
  // SIGTERM followed by SIGINT in quick succession).
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections. The callback fires once all existing
  // connections have been closed, at which point the process exits cleanly.
  server.close(() => {
    process.exit(0);
  });

  // Safety net: if connections do not drain within the deadline, force-exit
  // with a non-zero code. The .unref() call ensures this timer alone does not
  // keep the event loop alive if all connections drain before the timeout.
  setTimeout(() => {
    console.error('Forced shutdown: connections did not drain in time.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

// =============================================================================
// Process-Level Handlers (Root Causes 2 & 5) — Signals and Exceptions
// =============================================================================

// SIGTERM: sent by container orchestrators (Kubernetes, Docker), process
// managers (PM2, systemd), and manual `kill <PID>` commands.
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// SIGINT: sent when the user presses Ctrl+C in the terminal.
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Uncaught exceptions: last-resort handler for synchronous throws that escape
// all try/catch blocks. Logs the error and initiates graceful shutdown rather
// than allowing the process to crash silently.
process.on('uncaughtException', (err) => {
  console.error(`Uncaught exception: ${err.message}`);
  gracefulShutdown('uncaughtException');
});

// Unhandled promise rejections: last-resort handler for rejected promises with
// no .catch() handler. Logs the reason and initiates graceful shutdown.
process.on('unhandledRejection', (reason) => {
  console.error(`Unhandled rejection: ${reason}`);
  gracefulShutdown('unhandledRejection');
});

// =============================================================================
// Server Listen — Start Accepting Connections (preserved from original)
// =============================================================================
server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
