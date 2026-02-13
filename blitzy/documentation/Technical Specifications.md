# Technical Specification

# 0. Agent Action Plan

## 0.1 Executive Summary

Based on the bug description, the Blitzy platform understands that the bug is a comprehensive set of robustness deficiencies in `server.js` — a minimal Node.js HTTP server — that collectively leave the application vulnerable to ungraceful crashes, resource leaks, unhandled errors, and indiscriminate request acceptance.

The `server.js` file (originally 14 lines, 342 bytes) implements an HTTP server using the built-in `http` module bound to `127.0.0.1:3000`. The server responds to every incoming request — regardless of HTTP method, URL path, or payload — with a blanket `200 OK` and a static `Hello, World!\n` body. While functionally operational, the implementation omits critical production-grade safeguards across five distinct categories:

- **Missing Error Handling**: No `server.on('error')` listener exists, meaning server-level errors (e.g., `EADDRINUSE` when the port is occupied) trigger Node.js's default behavior of throwing an unhandled `'error'` event and crashing the process without diagnostic output. No `req.on('error')` or `res.on('error')` handlers exist on individual request/response streams. No global `process.on('uncaughtException')` or `process.on('unhandledRejection')` safety nets are registered.

- **No Graceful Shutdown**: No `SIGTERM` or `SIGINT` signal handlers are present. When the process is terminated, all open connections are abruptly severed without allowing in-flight requests to complete or performing any resource cleanup.

- **No Input Validation**: The request handler accepts all HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, etc.) and all URL paths (`/`, `/admin`, `/anything`) identically, returning `200 OK` for every combination. This violates HTTP semantics and provides no meaningful routing or request filtering.

- **No Resource Cleanup**: No mechanism tracks open TCP connections. On shutdown, there is no way to enumerate or destroy lingering sockets, leading to potential resource leaks and hanging connections.

- **No Timeout Configuration**: No explicit `server.setTimeout()` is configured, relying entirely on Node.js defaults with no visibility into or control over idle connection behavior.

The specific error type is a **design deficiency** — the code is syntactically valid and executes without immediate errors under ideal conditions, but lacks the defensive patterns required for robust HTTP request processing.

## 0.2 Root Cause Identification

Based on research, the root causes are six distinct omissions in `server.js` that collectively compromise the robustness of the HTTP server. Each root cause is definitively identified with evidence from the source code and confirmed by industry best practices documented in the Node.js official documentation and community resources.

**Root Cause 1: Missing Server-Level Error Handler**
- Located in: `server.js`, after line 10 (original) — no `server.on('error', ...)` listener registered
- Triggered by: Any server-level error emission such as `EADDRINUSE` (port already in use), `EACCES` (permission denied), or other socket-level failures
- Evidence: The original `server.js` transitions directly from `http.createServer()` at line 6 to `server.listen()` at line 12 with zero intermediate error handling. Node.js `EventEmitter` objects that emit `'error'` events without a registered listener will throw the error as an uncaught exception, crashing the process
- This conclusion is definitive because: Node.js documentation explicitly states that unhandled `'error'` events on `EventEmitter` instances cause the process to exit with a stack trace. The `http.Server` class inherits from `net.Server`, which emits `'error'` events for binding failures

**Root Cause 2: Absent Graceful Shutdown Mechanism**
- Located in: `server.js` — entirely missing; no `process.on('SIGTERM')` or `process.on('SIGINT')` handlers exist anywhere in the file
- Triggered by: Process termination signals (`SIGTERM` from `kill`, `SIGINT` from `Ctrl+C`)
- Evidence: The 14-line original file contains no reference to `process.on`, `server.close`, or any signal handling. When the process receives a termination signal, Node.js's default behavior is to immediately exit, severing all open TCP connections mid-flight
- This conclusion is definitive because: Without explicit signal handlers, the Node.js runtime terminates instantly upon receiving `SIGTERM`/`SIGINT`, with no opportunity to drain in-flight requests or clean up resources. This is confirmed by Node.js official documentation and multiple community sources on graceful shutdown patterns

**Root Cause 3: No Request/Response Stream Error Handling**
- Located in: `server.js`, lines 6-10 (original) — the `http.createServer` callback
- Triggered by: Malformed HTTP requests, aborted client connections, or errors during response writing (e.g., writing to a destroyed socket)
- Evidence: The handler at lines 7-9 (`res.statusCode = 200; res.setHeader(...); res.end(...)`) processes every request unconditionally without attaching `req.on('error')` or `res.on('error')` listeners. If the request stream encounters an error during parsing or the response stream encounters a write error, the event goes unhandled
- This conclusion is definitive because: The `http.IncomingMessage` and `http.ServerResponse` objects are both `Stream` instances that can emit `'error'` events. Without listeners, these propagate as unhandled errors

**Root Cause 4: Complete Absence of Input Validation**
- Located in: `server.js`, lines 6-10 (original) — the `http.createServer` callback
- Triggered by: Any HTTP request, regardless of method (`POST`, `DELETE`, `PATCH`, etc.) or URL path (`/admin`, `/api/secret`, etc.)
- Evidence: The handler body contains zero conditional logic — no `if` statements, no `switch`, no routing. Properties `req.method` and `req.url` are never read. Every request receives an identical `200 OK` response with `Hello, World!\n`
- This conclusion is definitive because: The handler is a straight-line sequence of three statements (`res.statusCode = 200`, `res.setHeader(...)`, `res.end(...)`) with no branching

**Root Cause 5: No Connection Tracking for Resource Cleanup**
- Located in: `server.js` — entirely missing; no `server.on('connection')` handler or connection registry exists
- Triggered by: Shutdown scenarios where open connections need to be destroyed, or diagnostic scenarios requiring visibility into active connections
- Evidence: The original file has no data structures (arrays, sets, maps) for tracking sockets and no event listeners on the `'connection'` event of the server
- This conclusion is definitive because: Without tracking open sockets, the `server.close()` call (even if it were present) would need to wait indefinitely for keep-alive connections to time out naturally

**Root Cause 6: No Global Process Error Safety Nets**
- Located in: `server.js` — entirely missing; no `process.on('uncaughtException')` or `process.on('unhandledRejection')` handlers
- Triggered by: Any uncaught exception or unhandled promise rejection that bubbles up to the event loop
- Evidence: The original 14-line file contains no `process.on(...)` calls of any kind
- This conclusion is definitive because: Node.js documentation confirms that the default behavior for `uncaughtException` is to print the stack trace and exit with code 1, and `unhandledRejection` defaults to process termination in Node.js 15+

## 0.3 Diagnostic Execution

### 0.3.1 Code Examination Results

- File analyzed: `server.js` (relative to repository root)
- Problematic code block: Lines 1-14 (entire file — all six root causes span the full file)
- Specific failure points:
  - Line 6: `http.createServer` callback — no `req.on('error')` or `res.on('error')` handlers attached (Root Cause 3); no inspection of `req.method` or `req.url` (Root Cause 4)
  - Line 7: `res.statusCode = 200` — unconditionally set to 200 for all requests (Root Cause 4)
  - Line 10: End of createServer callback — no server error listener follows (Root Cause 1)
  - Line 12: `server.listen()` — no preceding `server.on('error')`, no signal handlers, no connection tracking registered (Root Causes 1, 2, 5, 6)
- Execution flow leading to bug: When `node server.js` is executed, the server binds to port 3000 and enters the event loop. From that point, any of the following triggers one or more root causes:
  - A second instance starts → EADDRINUSE emitted → no `server.on('error')` → process crashes (RC1)
  - `kill PID` sent → no SIGTERM handler → immediate exit, connections severed (RC2)
  - Malformed HTTP request → req error emitted → no handler → possible crash (RC3)
  - `POST /admin` request → 200 OK returned → incorrect HTTP semantics (RC4)
  - Idle keep-alive connections → no tracking → no cleanup possible (RC5)
  - Any uncaught throw → no `process.on('uncaughtException')` → crash without logging (RC6)

### 0.3.2 Repository Analysis Findings

| Tool Used | Command Executed | Finding | File:Line |
|-----------|-----------------|---------|-----------|
| read_file | `read_file server.js [1, -1]` | 14-line server with zero error handling, zero input validation, zero signal handling | server.js:1-14 |
| read_file | `read_file package.json [1, -1]` | Zero runtime dependencies; test script exits with error; main points to nonexistent `index.js` | package.json:1-12 |
| read_file | `read_file package-lock.json [1, -1]` | lockfileVersion 3 confirming npm 7+/Node.js 15+ compatibility | package-lock.json:1-6 |
| read_file | `read_file README.md [1, -1]` | Project described as "test project for backprop integration. Do not touch!" | README.md:1-3 |
| grep (bash) | `grep -n 'error\|Error\|catch\|SIGTERM\|SIGINT\|close\|timeout' server.js` | Zero matches — confirming total absence of error handling, signal handling, and timeout configuration | server.js: no matches |
| grep (bash) | `grep -n 'req.method\|req.url\|404\|405' server.js` | Zero matches — confirming no input validation of any kind | server.js: no matches |
| bash | `node --version` | v20.20.0 — compatible with lockfileVersion 3 requirements (Node.js 15+) | Environment |
| bash | `npm install` | Up to date — zero dependencies to install, confirming zero-dependency baseline | package.json dependencies |

### 0.3.3 Web Search Findings

- **Search queries executed:**
  - `Node.js http.createServer best practices error handling graceful shutdown`
  - `Node.js http server error event listener unhandled exception request timeout`
  - `Node.js process uncaughtException unhandledRejection handler best practice`

- **Web sources referenced:**
  - Node.js official documentation (`nodejs.org/api/process.html`) — `uncaughtException` and `unhandledRejection` event specifications
  - Medium (Juliano Firme) — Graceful shutdown pattern using `server.close()` within `SIGTERM` handler
  - PM2 documentation (`pm2.io/docs/runtime/best-practices/graceful-shutdown/`) — Five-step graceful shutdown sequence
  - Better Stack community guide — Common Node.js errors including `EADDRINUSE` and `ECONNRESET`
  - Heroku blog — Best practices for handling Node.js errors on shutdown using `server.close()` and `process.exit()`
  - DZone — Unhandled promise rejection crash prevention with `process.on('unhandledRejection')`

- **Key findings incorporated:**
  - `server.close()` stops accepting new connections but does not forcibly terminate keep-alive sockets — connection tracking is required
  - `setTimeout(...).unref()` pattern is necessary to force-exit if graceful shutdown stalls
  - `process.on('uncaughtException')` should log and exit, not attempt recovery
  - Double-shutdown guard (`isShuttingDown` flag) prevents race conditions when multiple signals arrive rapidly

### 0.3.4 Fix Verification Analysis

- **Steps followed to reproduce bugs:**
  - Started server with `node server.js`, then started a second instance — confirmed the second process crashed with an unhandled `EADDRINUSE` error
  - Sent `SIGTERM` to running server — confirmed immediate exit with no graceful shutdown message
  - Issued `POST /` and `GET /nonexistent` requests via `curl` — confirmed both returned `200 OK` with `Hello, World!\n`

- **Confirmation tests used to ensure bugs were fixed:**
  - 13 automated tests across 5 test suites using Node.js built-in `node:test` runner — all passing
  - Test suite 1 (HTTP Request Processing, 8 tests): Verified GET `/` returns 200, unknown paths return 404, non-GET methods return 405, query strings handled correctly, `Content-Length` header present
  - Test suite 2 (Graceful Shutdown, 2 tests): Verified SIGTERM and SIGINT both trigger graceful shutdown with exit code 0
  - Test suite 3 (Server Error Handling, 1 test): Verified EADDRINUSE produces diagnostic message and exit code 1
  - Test suite 4 (Connection Tracking, 1 test): Verified connections are properly tracked and cleaned up on shutdown
  - Test suite 5 (Module Exports, 1 test): Verified `server` and `gracefulShutdown` are exported for testability

- **Boundary conditions and edge cases covered:**
  - Root path with query string (`/?key=value`) correctly matches `/` via URL pathname parsing
  - Double-shutdown guard prevents race condition when signals arrive in rapid succession
  - `res.headersSent` check in request error handler prevents "headers already sent" crash
  - `setTimeout(...).unref()` prevents forced-shutdown timer from keeping process alive

- **Verification was successful, confidence level: 95%**
  - High confidence because all 13 tests pass, covering the primary fix areas. The remaining 5% accounts for edge cases that are difficult to test in isolation (e.g., actual malformed TCP packets triggering `req.on('error')`, and real-world `uncaughtException` scenarios that would require injecting faults into the event loop).

## 0.4 Bug Fix Specification

### 0.4.1 The Definitive Fix

- **File to modify:** `server.js`
- **Current implementation (lines 1-14):** A 14-line server with zero error handling, zero input validation, zero graceful shutdown, and zero resource cleanup
- **Required change:** Replace the entire file content with a 122-line robust implementation that addresses all six root causes while preserving the original `Hello, World!` response behavior for `GET /`
- **This fixes the root causes by:** Adding six distinct defensive layers — server error listener (RC1), graceful shutdown with signal handlers (RC2), request/response stream error handlers (RC3), HTTP method and path validation (RC4), connection tracking via a `Set` (RC5), and global `uncaughtException`/`unhandledRejection` handlers (RC6)

### 0.4.2 Change Instructions

**DELETE** the entire original content of `server.js` (lines 1-14).

**INSERT** the following complete replacement at line 1:

- **Line 1-2:** Add `require('url')` import for proper URL pathname parsing
  ```js
  const http = require('http');
  const url = require('url');
  ```

- **Lines 7-10:** Add connection tracking `Set` and shutdown guard flag for resource cleanup
  ```js
  const openConnections = new Set();
  let isShuttingDown = false;
  ```

- **Lines 12-52:** Replace the original 5-line createServer callback with a comprehensive handler that includes:
  - `req.on('error')` listener (lines 14-21) — catches malformed request errors, responds with 400 Bad Request, checks `res.headersSent` before setting headers to prevent double-header crash
  - `res.on('error')` listener (lines 24-26) — catches response write errors and logs them
  - URL pathname parsing via `url.parse()` (line 29) — strips query strings for clean route matching
  - HTTP method validation (lines 32-38) — returns 405 Method Not Allowed with `Allow: GET` header for non-GET requests
  - URL path validation (lines 40-45) — returns 404 Not Found for paths other than `/`
  - `Content-Length` header addition (line 50) — explicitly sets `Content-Length` via `Buffer.byteLength()` for robust response handling

- **Lines 54-58:** Add server timeout configuration
  ```js
  server.setTimeout(30000, (socket) => {
    socket.destroy();
  });
  ```

- **Lines 61-68:** Add server-level error handler with specific `EADDRINUSE` detection
  ```js
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') { ... }
    process.exit(1);
  });
  ```

- **Lines 71-76:** Add connection tracking via `server.on('connection')` — registers each socket in `openConnections` Set and removes it on socket `close` event

- **Lines 79-100:** Add `gracefulShutdown()` function that:
  - Guards against double invocation via `isShuttingDown` flag (line 81)
  - Calls `server.close()` to stop accepting new connections (line 85)
  - Iterates and destroys all tracked open connections (lines 91-93)
  - Sets a 5-second forced-shutdown timeout with `.unref()` to prevent timer from keeping process alive (lines 96-99)

- **Lines 103-104:** Register `SIGTERM` and `SIGINT` signal handlers invoking `gracefulShutdown()`

- **Lines 107-116:** Register `process.on('uncaughtException')` and `process.on('unhandledRejection')` global safety nets that log and invoke graceful shutdown

- **Line 122:** Add `module.exports = { server, gracefulShutdown }` for testability

### 0.4.3 Fix Validation

- **Test command to verify fix:**
  ```bash
  cd /tmp/blitzy/Repo-for-qa-refine-test-12-feb/QaBranch13Febbu && node --test server.test.js
  ```
- **Expected output after fix:** All 13 tests passing across 5 suites with `# pass 13` and `# fail 0`
- **Confirmation method:**
  - Verify exit code 0 from test runner
  - Verify `GET /` still returns `200 OK` with `Hello, World!\n` (backward compatibility)
  - Verify `POST /` returns `405 Method Not Allowed`
  - Verify `GET /unknown` returns `404 Not Found`
  - Verify `SIGTERM` triggers graceful shutdown with exit code 0
  - Verify second server instance on same port gets clean `EADDRINUSE` error message and exits with code 1

### 0.4.4 User Interface Design

No Figma screens or UI elements were provided or applicable to this change. The `server.js` fix is a backend-only modification to a CLI-invoked HTTP server.

## 0.5 Scope Boundaries

### 0.5.1 Changes Required (Exhaustive List)

| File | Lines Changed | Specific Change |
|------|---------------|-----------------|
| `server.js` | Lines 1-14 (deleted) → Lines 1-122 (replaced) | Complete rewrite: added `url` module import, connection tracking Set, shutdown guard, request/response error handlers, input validation (method + path), `Content-Length` header, server timeout, `server.on('error')`, connection tracking, `gracefulShutdown()` function, `SIGTERM`/`SIGINT` handlers, `uncaughtException`/`unhandledRejection` handlers, module exports |
| `server.test.js` | New file (entire) | Created 13 comprehensive unit tests across 5 suites covering HTTP request processing, graceful shutdown, server error handling, connection tracking, and module exports |

No other files require modification.

### 0.5.2 Explicitly Excluded

- **Do not modify:** `package.json` — No new dependencies are required; all fixes use Node.js built-in modules (`http`, `url`). The test framework uses the built-in `node:test` runner available in Node.js 18+.
- **Do not modify:** `package-lock.json` — No dependency changes necessitate a lockfile update.
- **Do not modify:** `README.md` — The project documentation states "Do not touch!" and the behavioral contract for `GET /` is preserved.
- **Do not modify:** `LoginTest.java`, `industry.csv`, `100Pages.pdf`, `demo.jpg`, `sample.doc`, `test.py.txt`, `test.blitzyignore.txt`, `test1.blitzyignore.txt` — These are test artifacts unrelated to the server robustness fixes.
- **Do not refactor:** The hardcoded `hostname` and `port` constants — while extracting these to environment variables is a common production pattern, it is outside the scope of this bug fix and would alter the established test fixture behavior.
- **Do not add:** HTTPS/TLS support, request body parsing, logging frameworks, external dependencies, or any feature beyond the five specified robustness categories (error handling, graceful shutdown, input validation, resource cleanup, robust HTTP processing).

## 0.6 Verification Protocol

### 0.6.1 Bug Elimination Confirmation

- **Execute:** `node --test server.test.js` from the repository root
- **Verify output matches:** `# tests 13`, `# pass 13`, `# fail 0`
- **Confirm errors no longer appear in:** Process stderr — the EADDRINUSE scenario now produces a clean diagnostic message (`Port 3000 is already in use`) and a controlled `process.exit(1)` instead of an unhandled error stack trace
- **Validate functionality with:** The following manual verification steps confirm each root cause is resolved:

| Root Cause | Verification Command | Expected Result |
|------------|---------------------|-----------------|
| RC1: Server error | Start two server instances simultaneously | Second instance logs `Port 3000 is already in use` and exits with code 1 |
| RC2: Graceful shutdown | Start server, then `kill -SIGTERM <PID>` | Server logs `SIGTERM received. Shutting down gracefully...` and exits with code 0 |
| RC3: Stream errors | Request error handlers registered | `req.on('error')` and `res.on('error')` listeners prevent unhandled stream errors |
| RC4: Input validation | `curl -X POST http://127.0.0.1:3000/` | Returns `405 Method Not Allowed` with `Allow: GET` header |
| RC4: Input validation | `curl http://127.0.0.1:3000/nonexistent` | Returns `404 Not Found` |
| RC4: Input validation | `curl http://127.0.0.1:3000/` | Returns `200 OK` with `Hello, World!` (preserved behavior) |
| RC5: Resource cleanup | Start server, make requests, send SIGTERM | Server tracks and destroys all open connections before exiting |
| RC6: Global handlers | `process.on('uncaughtException')` registered | Logs error and invokes graceful shutdown instead of crashing |

### 0.6.2 Regression Check

- **Run existing test suite:** `node --test server.test.js` — all 13 tests pass, confirming no regression in core functionality
- **Verify unchanged behavior in:**
  - `GET /` still returns `200 OK` with `Content-Type: text/plain` and body `Hello, World!\n` — the primary functional contract is fully preserved
  - Server still binds to `127.0.0.1:3000` — the hostname and port remain unchanged
  - Server startup still logs `Server running at http://127.0.0.1:3000/` — the console output is preserved
- **Confirm performance metrics:**
  - No external dependencies added — the zero-dependency baseline is maintained
  - Only two Node.js built-in modules are used (`http`, `url`) — no performance-impacting imports
  - The `Set` used for connection tracking adds O(1) per-connection overhead, which is negligible for the project's localhost-only single-user scope

## 0.7 Execution Requirements

### 0.7.1 Research Completeness Checklist

- ✓ Repository structure fully mapped — all 11 files at root level enumerated via `get_source_folder_contents`
- ✓ All related files examined with retrieval tools — `server.js`, `package.json`, `package-lock.json`, `README.md` all read in full
- ✓ Bash analysis completed for patterns/dependencies — `grep` confirmed zero error handling, zero input validation, and zero signal handling in original `server.js`
- ✓ Root cause definitively identified with evidence — six distinct root causes documented with specific line numbers and code references
- ✓ Single solution determined and validated — comprehensive 122-line replacement with 13 passing unit tests across 5 suites
- ✓ Web search investigation completed — three targeted searches across Node.js documentation, community guides, and GitHub issues
- ✓ No `.blitzyignore` files with content found — both `test.blitzyignore.txt` and `test1.blitzyignore.txt` are 0-byte empty placeholders

### 0.7.2 Fix Implementation Rules

- Make the exact specified changes only — the `server.js` replacement and `server.test.js` creation constitute the complete fix
- Zero modifications outside the bug fix — no changes to `package.json`, `README.md`, or any test artifact files
- No interpretation or improvement of working code — the hardcoded hostname/port constants, the project metadata in `package.json`, and the `"main": "index.js"` discrepancy are all preserved as-is
- Preserve all whitespace and formatting except where changed — the coding style of the original file (2-space indentation, single quotes, semicolons) is replicated in all new code
- All new code uses only Node.js built-in modules (`http`, `url`, `node:test`, `node:assert`) — the zero-dependency constraint is strictly maintained
- The `module.exports` addition at line 122 is the only structural enhancement beyond the five specified robustness categories — it exists solely to enable unit testing and has no runtime behavioral impact

## 0.8 References

### 0.8.1 Repository Files and Folders Searched

| File/Folder | Path | Purpose of Search |
|-------------|------|-------------------|
| Root directory | `/` (repository root) | Mapped complete codebase structure — 11 files, flat layout |
| `server.js` | `server.js` | Primary target — analyzed all 14 lines for robustness deficiencies |
| `package.json` | `package.json` | Verified zero dependencies, project metadata, Node.js version constraints |
| `package-lock.json` | `package-lock.json` | Confirmed lockfileVersion 3, validating npm 7+/Node.js 15+ compatibility |
| `README.md` | `README.md` | Established project purpose ("test project for backprop integration") and constraints |
| `test.blitzyignore.txt` | `test.blitzyignore.txt` | Checked for ignore patterns — confirmed 0 bytes (empty) |
| `test1.blitzyignore.txt` | `test1.blitzyignore.txt` | Checked for ignore patterns — confirmed 0 bytes (empty) |
| `LoginTest.java` | `LoginTest.java` | Verified unrelated test artifact — not impacted by server fixes |
| `industry.csv` | `industry.csv` | Verified unrelated test artifact — not impacted by server fixes |
| `test.py.txt` | `test.py.txt` | Verified unrelated test artifact — 0 bytes, not impacted |

### 0.8.2 Files Modified

| File | Action | Description |
|------|--------|-------------|
| `server.js` | Modified | Replaced 14-line original with 122-line robust implementation addressing error handling, graceful shutdown, input validation, resource cleanup, and timeout configuration |
| `server.test.js` | Created | New file with 13 unit tests across 5 test suites validating all fix areas |
| `server.js.bak` | Created | Backup of original server.js for reference |

### 0.8.3 Attachments

No attachments were provided for this project.

### 0.8.4 Figma Screens

No Figma screens were provided or applicable to this change.

### 0.8.5 Web Sources Referenced

| Source | URL | Key Finding Applied |
|--------|-----|---------------------|
| Node.js Official Documentation — Process Events | `https://nodejs.org/api/process.html` | `uncaughtException` and `unhandledRejection` handler patterns; correct use as a last-resort safety net, not for recovery |
| Medium — Graceful Shutdown in Node.js (Juliano Firme) | `https://medium.com/@julianofirme23/graceful-shutdown-in-node-js` | `server.close()` within `SIGTERM` handler pattern; explanation of why signal catching without `server.close()` keeps the process alive |
| PM2 Documentation — Graceful Shutdown Best Practices | `https://pm2.io/docs/runtime/best-practices/graceful-shutdown/` | Five-step graceful shutdown sequence; `server.close()` callback pattern with error handling |
| Better Stack Community — 16 Common Node.js Errors | `https://betterstack.com/community/guides/scaling-nodejs/nodejs-errors/` | `EADDRINUSE`, `ECONNRESET` error patterns; `req.on('close')` for detecting client disconnect |
| Heroku Blog — Best Practices for Node.js Error Handling | `https://www.heroku.com/blog/best-practices-nodejs-errors/` | Graceful shutdown strategy using `server.close()` and `process.exit()`; terminus and stoppable library patterns (pattern adopted, not the libraries) |
| Code Concisely — Graceful Shutdown in Express | `https://www.codeconcisely.com/posts/graceful-shutdown-in-express/` | `setTimeout(...).unref()` pattern for forced shutdown timeout; `server.listening` check before closing |
| DZone — Unhandled Promise Rejections | `https://dzone.com/articles/unhandled-promise-rejections-nodejs-crash` | Node.js 15+ default termination on unhandled rejection; `process.on('unhandledRejection')` as diagnostic and safety net |
| GitHub — http-graceful-shutdown package | `https://github.com/the-moebius/http-graceful-shutdown` | Connection tracking with idle indicators; rationale for actively closing connections rather than using `unref()` |

### 0.8.6 Tech Spec Sections Referenced

| Section | Heading | Relevance |
|---------|---------|-----------|
| 1.1 | Executive Summary | Confirmed project purpose as Backprop test fixture; informed constraint preservation |
| 3.2 | Programming Languages | Verified Node.js v20.20.0 runtime, CommonJS module system, lockfileVersion 3 requirements |
| 5.2 | Component Details | Understood original server architecture, request processing flow, and lifecycle states to ensure backward compatibility |

