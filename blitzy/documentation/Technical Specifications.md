# Technical Specification

# 0. Agent Action Plan

## 0.1 Executive Summary

Based on the bug description, the Blitzy platform understands that the bug is a systemic lack of robustness in `server.js`, a minimal Node.js HTTP server that uses only the built-in `http` module with zero external dependencies. The server, located at the repository root, contains 14 lines of code and serves a "Hello, World!" response. It operates in a completely unprotected state across five critical dimensions:

- **Missing Error Handling:** The server contains zero `try/catch` blocks, zero `server.on('error', ...)` listeners, and zero `process.on('uncaughtException', ...)` handlers. An environmental failure such as a port conflict (`EADDRINUSE`) causes an unhandled exception that crashes the process with no meaningful diagnostic output.
- **No Graceful Shutdown:** There are zero `SIGTERM` or `SIGINT` signal handlers. When the process is terminated by an operating system signal or orchestrator (e.g., Kubernetes, Docker, systemd), all active HTTP connections are severed immediately with no opportunity to complete in-flight requests.
- **No Input Validation:** The request handler responds with `200 OK` and "Hello, World!" to every request regardless of HTTP method (`GET`, `POST`, `DELETE`, `PUT`, etc.) or URL path (`/`, `/admin`, `/anything`). There is no routing or method filtering.
- **No Resource Cleanup:** There is no `server.on('close', ...)` handler to log or perform cleanup, no connection timeout configuration (`keepAliveTimeout`, `headersTimeout`), and no protection against resource exhaustion from idle connections.
- **No Process-Level Safety Net:** Unhandled promise rejections and uncaught exceptions propagate with no recovery strategy, leaving the server in an undefined state.

**Reproduction Steps (Executed and Confirmed):**
- Start the server: `node server.js`
- Send a DELETE request: `curl -X DELETE http://127.0.0.1:3000/` → Returns `200 OK` (expected: `405`)
- Start a second server on the same port: `node server.js` → Crashes with unhandled `EADDRINUSE` exception
- Send SIGTERM to the process: `kill <PID>` → Process terminates immediately with no cleanup log

**Error Type Classification:** Logic omission (missing defensive code), environmental fragility (unhandled operational errors), and protocol non-compliance (HTTP method semantics ignored).

## 0.2 Root Cause Identification

Based on exhaustive static and dynamic analysis, there are **five distinct root causes**, all located within the single file `server.js` (14 lines, original version):

**Root Cause 1: Absent Server Error Listener**
- Located in: `server.js` — no `server.on('error', ...)` exists anywhere in the file
- Triggered by: Any `EADDRINUSE` (port conflict), `EACCES` (permission denied), or other system-level error emitted by the `http.Server` object
- Evidence: Running two instances of the server simultaneously on port 3000 causes an unhandled `EADDRINUSE` exception that terminates the process with a raw Node.js stack trace rather than a user-friendly diagnostic message
- This conclusion is definitive because: Node.js `http.Server` inherits from `net.Server`, which emits `'error'` events. Without a listener, Node.js throws the error as an uncaught exception per its default EventEmitter behavior.

**Root Cause 2: Absent Graceful Shutdown Logic**
- Located in: `server.js` — zero `process.on('SIGTERM', ...)` or `process.on('SIGINT', ...)` handlers exist
- Triggered by: Process termination signals from the OS, container orchestrators (Kubernetes, Docker), process managers (PM2, systemd), or user pressing Ctrl+C
- Evidence: `grep -n "SIGTERM\|SIGINT\|process\.\|close\|shutdown\|cleanup" server.js` returned zero matches
- This conclusion is definitive because: Without signal handlers, Node.js's default behavior on `SIGTERM` is immediate termination, severing all in-flight connections.

**Root Cause 3: Absent HTTP Method Validation**
- Located in: `server.js`, lines 4-7 (original) — the request handler callback
- Triggered by: Any HTTP request with any method (GET, POST, DELETE, PUT, PATCH, OPTIONS)
- Evidence: Sending `curl -X DELETE http://127.0.0.1:3000/` returns `200 OK` with "Hello, World!" — the server blindly serves its response without checking `req.method`
- This conclusion is definitive because: The request handler contains no conditional logic whatsoever; it unconditionally writes status 200 and the response body for every request.

**Root Cause 4: Absent Request/Response Error Handling**
- Located in: `server.js`, lines 4-7 (original) — inside the `createServer` callback
- Triggered by: Client-side disconnects, aborted requests, or broken pipe scenarios that emit `'error'` events on the `req` or `res` streams
- Evidence: `grep -n "error\|Error\|catch\|try\|throw" server.js` returned zero matches across the entire file
- This conclusion is definitive because: `http.IncomingMessage` and `http.ServerResponse` are streams that emit `'error'` events. Without listeners, these propagate as unhandled exceptions.

**Root Cause 5: Absent Process-Level Exception Handlers**
- Located in: `server.js` — no `process.on('uncaughtException', ...)` or `process.on('unhandledRejection', ...)` exists
- Triggered by: Any unhandled throw or rejected promise anywhere in the request handling pipeline
- Evidence: `grep -n "uncaughtException\|unhandledRejection" server.js` returned zero matches
- This conclusion is definitive because: Without these handlers, a single unexpected error silently or noisily crashes the entire server process with no opportunity for logging or cleanup.

## 0.3 Diagnostic Execution

### 0.3.1 Code Examination Results

- **File analyzed:** `server.js` (repository root)
- **Problematic code block:** Lines 1-14 (entire file)
- **Specific failure points:**
  - Line 4-7 (request handler): No method check, no URL routing, no error listeners on `req`/`res`
  - Line 9 (`server.listen`): No `server.on('error', ...)` bound before `listen()` call
  - Entire file: No signal handlers, no timeout configuration, no process-level safety nets

**Original `server.js` (14 lines):**
```javascript
const http = require('http');
const hostname = '127.0.0.1';
const port = 3000;
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello, World!\n');
});
server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
```

**Execution flow leading to each bug:**
- **EADDRINUSE crash:** `server.listen()` → OS returns `EADDRINUSE` → `http.Server` emits `'error'` event → No listener → EventEmitter throws → Process crashes with raw stack trace
- **Unvalidated method:** Any HTTP request → `createServer` callback fires → No `req.method` check → Unconditional 200 response
- **Abrupt termination:** OS sends SIGTERM → No `process.on('SIGTERM')` handler → Node.js default: immediate `process.exit()` → Active sockets destroyed

### 0.3.2 Repository Analysis Findings

| Tool Used | Command Executed | Finding | File:Line |
|-----------|-----------------|---------|-----------|
| grep | `grep -n "error\|Error\|catch\|try\|throw" server.js` | Zero matches — no error handling exists | `server.js:*` |
| grep | `grep -n "SIGTERM\|SIGINT\|process\.\|close\|shutdown\|cleanup" server.js` | Zero matches — no shutdown logic exists | `server.js:*` |
| grep | `grep -n "method\|url\|header\|validate\|sanitize" server.js` | Zero matches — no request validation exists | `server.js:*` |
| grep | `grep -n "timeout\|keepAlive\|maxHeaders\|maxConnections\|destroy" server.js` | Zero matches — no resource management exists | `server.js:*` |
| grep | `grep -n "uncaughtException\|unhandledRejection" server.js` | Zero matches — no process-level handlers exist | `server.js:*` |
| wc | `wc -l server.js` | 14 lines total in original file | `server.js` |
| find | `find / -name "*.js" -not -path "*/node_modules/*"` | Only `server.js` found — sole JS file in repository | `server.js` |
| bash | `node -e "[fork server, send DELETE, check response]"` | DELETE returns 200 OK — confirms missing method validation | `server.js:4-7` |
| bash | `node -e "[start two servers on port 3000]"` | Second server crashes with `EADDRINUSE` — confirms missing error handler | `server.js:9` |
| bash | `node -e "[send garbage data via net.Socket]"` | Returns 400 from Node.js runtime parser (baseline protection) | `server.js:*` |
| cat | `cat package.json` | Zero dependencies — pure Node.js stdlib project | `package.json` |

### 0.3.3 Web Search Findings

**Search queries executed:**
- `Node.js http server error handling best practices`
- `Node.js graceful shutdown SIGTERM SIGINT http server`
- `Node.js http.createServer request validation URL method`

**Web sources referenced:**
- Node.js Official Documentation (`nodejs.org/api/http.html`, `nodejs.org/api/errors.html`)
- Express.js Guide: Health Checks and Graceful Shutdown (`expressjs.com`)
- Lagoon Documentation: Node.js Graceful Shutdown (`docs.lagoon.sh`)
- RisingStack Engineering: Graceful Shutdown with Node.js and Kubernetes (`blog.risingstack.com`)
- DigitalOcean: How To Create a Web Server in Node.js (`digitalocean.com`)
- Sematext Blog: Node.js Error Handling Best Practices (`sematext.com`)
- Toptal: Best Practices for Node.js Error-handling (`toptal.com`)
- Honeybadger Blog: A Comprehensive Guide to Error Handling in Node.js (`honeybadger.io`)

**Key findings incorporated:**
- The `server.on('error', ...)` listener must be attached before `server.listen()` to catch bind errors like `EADDRINUSE` and `EACCES`. This is standard Node.js EventEmitter behavior documented in the official Node.js Errors API.
- Graceful shutdown requires calling `server.close()` inside `SIGTERM`/`SIGINT` handlers. `server.close()` stops accepting new connections and waits for in-flight requests to complete before invoking its callback. A force-exit timeout should be added via `setTimeout(...).unref()` to prevent the process from hanging indefinitely.
- HTTP `405 Method Not Allowed` responses should include an `Allow` header listing permitted methods, per RFC 7231 Section 6.5.5. The `req.method` property should be checked against a whitelist of allowed methods.
- The `req` and `res` objects are Node.js streams that can emit `'error'` events (e.g., on client disconnect). Attaching error listeners prevents unhandled exceptions from crashing the server.
- `process.on('uncaughtException')` and `process.on('unhandledRejection')` should be used as a last-resort safety net to log errors and initiate graceful shutdown rather than allowing silent crashes.

### 0.3.4 Fix Verification Analysis

**Steps followed to reproduce bugs (all confirmed before fix):**
- Started server and sent `DELETE` request → Got `200 OK` (bug confirmed)
- Started two servers on port 3000 → Second crashed with unhandled `EADDRINUSE` (bug confirmed)
- Sent `SIGTERM` to running server → Immediate termination with no shutdown log (bug confirmed)

**Confirmation tests after fix (12 tests, all passing):**

| Test | Assertion | Result |
|------|-----------|--------|
| GET / | Returns 200 with "Hello, World!" | PASS |
| DELETE / | Returns 405 "Method Not Allowed" | PASS |
| POST / | Returns 405 "Method Not Allowed" | PASS |
| PUT / | Returns 405 "Method Not Allowed" | PASS |
| Allow Header | 405 response includes `Allow: GET` | PASS |
| GET /nonexistent | Returns 404 "Not Found" | PASS |
| GET /admin | Returns 404 "Not Found" | PASS |
| EADDRINUSE | Logs "Port 3000 is already in use" and exits with code 1 | PASS |
| SIGTERM | Logs shutdown sequence and exits with code 0 | PASS |
| SIGINT | Logs shutdown sequence and exits with code 0 | PASS |
| Content-Type | GET / returns `Content-Type: text/plain` | PASS |
| Malformed Request | Raw garbage data returns `400 Bad Request` | PASS |

**Boundary conditions and edge cases covered:**
- Multiple disallowed HTTP methods tested (DELETE, POST, PUT)
- Multiple invalid URL paths tested (`/nonexistent`, `/admin`)
- Duplicate shutdown signal (guard variable `isShuttingDown` prevents double execution)
- Forced shutdown timeout for hung connections (5-second `setTimeout` with `.unref()`)
- Requests arriving during shutdown get `503 Service Unavailable` with `Connection: close` header

**Verification was successful, with confidence level: 95%** — All 12 automated tests pass consistently. The remaining 5% uncertainty accounts for race conditions in real-world high-concurrency deployment scenarios that cannot be fully simulated in a unit test environment.

## 0.4 Bug Fix Specification

### 0.4.1 The Definitive Fix

- **File modified:** `server.js` (repository root)
- **Original implementation (lines 1-14):** A bare 14-line HTTP server with no error handling, no validation, no shutdown logic, and no resource management
- **Fixed implementation (lines 1-120):** A robust HTTP server with all five root causes addressed
- **This fixes the root causes by:** Adding server error listeners for `EADDRINUSE`/`EACCES`, signal handlers for `SIGTERM`/`SIGINT`, HTTP method and URL validation, request/response stream error handlers, process-level exception handlers, connection timeout configuration, and a shutdown-in-progress guard

### 0.4.2 Change Instructions

**DELETE the entire original `server.js` content (lines 1-14) and REPLACE with the following 120-line implementation:**

**Lines 1-13 — Configuration and State:**
```javascript
const ALLOWED_METHODS = ['GET'];
const SHUTDOWN_TIMEOUT_MS = 5000;
let isShuttingDown = false;
```
- Adds an `ALLOWED_METHODS` whitelist to define valid HTTP methods
- Adds a `SHUTDOWN_TIMEOUT_MS` constant for forced shutdown deadline
- Adds an `isShuttingDown` flag to guard against duplicate shutdown sequences and to reject in-flight requests during drain

**Lines 15-58 — Request Handler with Validation and Error Handling:**
- INSERT `req.on('error', ...)` at line 17 — catches request stream errors (client aborts) and responds with `400 Bad Request` if headers have not been sent
- INSERT `res.on('error', ...)` at line 26 — catches response stream errors (broken pipe) and logs them without crashing
- INSERT shutdown guard at line 31 — returns `503 Service Unavailable` with `Connection: close` header for requests arriving during shutdown
- INSERT HTTP method validation at line 38 — returns `405 Method Not Allowed` with `Allow: GET` header for any method not in `ALLOWED_METHODS`
- INSERT URL path validation at line 48 — returns `404 Not Found` for any URL path other than `/`
- PRESERVE original response logic at lines 55-57 — `200 OK` with "Hello, World!" for valid `GET /` requests

**Lines 60-62 — Timeout Configuration:**
```javascript
server.keepAliveTimeout = 5000;
server.headersTimeout = 8000;
```
- INSERT `keepAliveTimeout` and `headersTimeout` to prevent resource exhaustion from idle or slow connections

**Lines 64-74 — Server Error Handler:**
- INSERT `server.on('error', ...)` — catches `EADDRINUSE`, `EACCES`, and other server-level errors with human-readable log messages, then exits with code 1

**Lines 76-79 — Server Close Logger:**
- INSERT `server.on('close', ...)` — logs when all connections have been terminated and the server is fully closed

**Lines 82-100 — Graceful Shutdown Function:**
- INSERT `gracefulShutdown(signal)` function — sets `isShuttingDown = true`, calls `server.close()` to drain connections, and schedules a force-exit timeout via `setTimeout(...).unref()`

**Lines 102-116 — Process-Level Handlers:**
- INSERT `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)` at lines 103-104 — trigger graceful shutdown on termination signals
- INSERT `process.on('uncaughtException', ...)` at line 107 — logs the error and triggers graceful shutdown
- INSERT `process.on('unhandledRejection', ...)` at line 113 — logs the rejection reason and triggers graceful shutdown

**Lines 118-120 — Server Listen (preserved from original):**
- No changes to the `server.listen()` call — retains the same host, port, and startup log message

### 0.4.3 Fix Validation

- **Test command to verify fix:** `timeout 120 node server.test.js`
- **Expected output after fix:** `Total: 12 | Passed: 12 | Failed: 0`
- **Confirmation method:**
  - Run the 12-test suite (`server.test.js`) — validates method rejection, URL routing, error handling, graceful shutdown, and malformed request handling
  - Manually start the server (`node server.js`) and confirm `curl http://127.0.0.1:3000/` returns `200 OK` with "Hello, World!"
  - Manually send `curl -X DELETE http://127.0.0.1:3000/` and confirm `405 Method Not Allowed`
  - Attempt to start a second server (`node server.js` in a new terminal) and confirm the process logs "Port 3000 is already in use" and exits with code 1
  - Send `SIGTERM` to the running process (`kill <PID>`) and confirm logs show the graceful shutdown sequence

### 0.4.4 User Interface Design

Not applicable — this is a headless HTTP server with no UI. No Figma screens were provided.

## 0.5 Scope Boundaries

### 0.5.1 Changes Required (Exhaustive List)

| File | Lines Changed | Change Description |
|------|--------------|-------------------|
| `server.js` | Lines 1-14 replaced with lines 1-120 | Complete rewrite: added 5 error handling categories, HTTP method/URL validation, graceful shutdown, timeout configuration, and process-level safety handlers |
| `server.test.js` | New file (entire) | New 12-test suite covering all five root causes: method validation, URL routing, EADDRINUSE handling, SIGTERM/SIGINT shutdown, and malformed requests |

No other files require modification. The change is entirely self-contained within `server.js` and its new test file.

### 0.5.2 Explicitly Excluded

- **Do not modify:** `package.json` — no new dependencies are introduced; all fixes use the Node.js standard library (`http`, `net`, `child_process`, `assert`, `path`)
- **Do not modify:** `package-lock.json` — no dependency changes
- **Do not modify:** `README.md` — documentation updates are outside the scope of this bug fix
- **Do not modify:** `LoginTest.java`, `test.blitzyignore.txt`, `test1.blitzyignore.txt`, `test.py.txt` — placeholder files unrelated to the server
- **Do not refactor:** The server's single-file architecture — while a more complex project might separate routing, error handling, and configuration into modules, this refactoring is outside the scope of the bug fix
- **Do not add:** HTTPS/TLS support, request body parsing, CORS headers, rate limiting, or logging frameworks — these are feature enhancements, not bug fixes
- **Do not add:** External dependencies (Express.js, http-errors, node-graceful-shutdown, etc.) — the fix maintains the project's zero-dependency design

## 0.6 Verification Protocol

### 0.6.1 Bug Elimination Confirmation

- **Execute:** `timeout 120 node server.test.js`
- **Verify output matches:** `Total: 12 | Passed: 12 | Failed: 0`
- **Confirm each original bug is eliminated:**

| Original Bug | Verification Test | Expected Result |
|-------------|------------------|-----------------|
| DELETE returns 200 | Send `curl -X DELETE http://127.0.0.1:3000/` | `405 Method Not Allowed` with `Allow: GET` header |
| POST returns 200 | Send `curl -X POST http://127.0.0.1:3000/` | `405 Method Not Allowed` |
| EADDRINUSE crashes process | Start two servers on port 3000 | Second server logs "Port 3000 is already in use" and exits with code 1 |
| No shutdown log on SIGTERM | Send `kill <PID>` to running server | Logs "SIGTERM received. Starting graceful shutdown..." followed by "All connections drained." and exits with code 0 |
| No SIGINT handling | Press Ctrl+C on running server | Logs "SIGINT received. Starting graceful shutdown..." and exits with code 0 |
| Any URL returns 200 | Send `curl http://127.0.0.1:3000/admin` | `404 Not Found` |

- **Validate core functionality preserved:** `curl http://127.0.0.1:3000/` still returns `200 OK` with "Hello, World!" and `Content-Type: text/plain`

### 0.6.2 Regression Check

- **Run full test suite:** `timeout 120 node server.test.js` — all 12 tests cover both new defensive behavior and preserved original functionality
- **Verify unchanged behavior in:**
  - Normal `GET /` response — identical `200 OK` with "Hello, World!" body and `text/plain` content type
  - Server startup message — identical `Server running at http://127.0.0.1:3000/` log output
  - Listen host and port — unchanged `127.0.0.1:3000` binding
- **Confirm no new dependencies:** `cat package.json | grep -c dependencies` should return a block with no entries; `npm ls --depth=0` should show zero packages
- **Confirm performance baseline:** Server startup time remains sub-second; response latency for `GET /` remains sub-millisecond (no blocking operations added)

## 0.7 Execution Requirements

### 0.7.1 Research Completeness Checklist

- ✓ Repository structure fully mapped — root folder explored, all files cataloged (`server.js`, `package.json`, `package-lock.json`, `README.md`, `LoginTest.java`, and three empty placeholder files)
- ✓ All related files examined with retrieval tools — `server.js` (full content), `package.json` (zero dependencies confirmed), `README.md` (documentation read), `.blitzyignore` files searched and not found
- ✓ Bash analysis completed for patterns and dependencies — exhaustive `grep` searches for error handling, signal handling, validation, timeout, and exception patterns; all returned zero matches confirming complete absence
- ✓ Dynamic testing completed — three targeted runtime tests executed (DELETE method acceptance, EADDRINUSE crash, malformed request handling) confirming all bugs
- ✓ Root cause definitively identified with evidence — five distinct root causes documented with specific grep outputs, runtime test results, and line number references
- ✓ Single solution determined and validated — comprehensive fix applied to `server.js` with 12 automated tests passing, covering all five root causes

### 0.7.2 Fix Implementation Rules

- The exact changes specified in Section 0.4 have been applied
- Zero modifications outside the bug fix scope — no changes to `package.json`, `README.md`, or any other file
- No interpretation or improvement of working code — the `Hello, World!` response logic and listen configuration are preserved exactly as they were
- All whitespace and formatting conventions from the original file are preserved in the response logic section
- The fix introduces zero external dependencies, maintaining the project's built-in-modules-only design
- All added code includes detailed inline comments explaining the motive behind each change, directly referencing the root causes identified in Section 0.2
- The fix is compatible with Node.js v20.x (the runtime version installed in the project environment)

## 0.8 References

### 0.8.1 Files and Folders Searched

| File/Folder | Purpose of Search | Key Conclusion |
|-------------|------------------|----------------|
| `server.js` | Primary bug target — full content analysis | 14-line server with zero defensive code |
| `package.json` | Dependency check | Zero external dependencies; name "hello_world" |
| `package-lock.json` | Lock file verification | Confirms zero dependency tree |
| `README.md` | Documentation review | Warning not to modify project |
| `LoginTest.java` | Relevance check | Unrelated placeholder file |
| `test.blitzyignore.txt` | Ignore patterns | Empty file |
| `test1.blitzyignore.txt` | Ignore patterns | Empty file |
| `test.py.txt` | Relevance check | Empty file |
| Repository root (`""`) | Structure mapping via `get_source_folder_contents` | Minimal repository with only `server.js` as functional code |
| System-wide `.blitzyignore` | `find / -name ".blitzyignore"` | No ignore files found |
| System-wide `.nvmrc`/`.node-version` | Version specifier search | None found; Node.js v20.20.0 installed |

### 0.8.2 Attachments

No attachments were provided for this project.

### 0.8.3 Figma Screens

No Figma URLs or screens were provided for this project.

### 0.8.4 External Web Sources Referenced

| Source | URL | Key Insight |
|--------|-----|-------------|
| Node.js Official Errors Docs | `https://nodejs.org/api/errors.html` | `EADDRINUSE` is a standard system error; `'error'` event mechanism is required for stream/event-emitter APIs |
| Node.js Official HTTP Docs | `https://nodejs.org/api/http.html` | `http.createServer` exposes `req.method` and `req.url` for routing; `server.close()` stops accepting new connections |
| Express.js Graceful Shutdown Guide | `https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html` | `process.on('SIGTERM', ...)` with `server.close()` is the standard pattern |
| Lagoon Node.js Graceful Shutdown | `https://docs.lagoon.sh/using-lagoon-advanced/nodejs/` | `server.close()` finishes all running requests before invoking callback |
| RisingStack Graceful Shutdown | `https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/` | Force-exit timeout needed to prevent indefinite hangs; resources must be released |
| DigitalOcean HTTP Module Tutorial | `https://www.digitalocean.com/community/tutorials/how-to-create-a-web-server-in-node-js-with-the-http-module` | `405 Method Not Allowed` with `Allow` header is the correct response for unsupported methods |
| Sematext Error Handling Guide | `https://sematext.com/blog/node-js-error-handling/` | Operational vs. programmer errors distinction; centralized error handling best practice |
| Toptal Error Handling Guide | `https://www.toptal.com/developers/nodejs/node-js-error-handling` | Centralized error-handling component prevents code duplication |
| Honeybadger Error Handling Guide | `https://www.honeybadger.io/blog/errors-nodejs/` | Operational errors must be handled to prevent more serious problems |

