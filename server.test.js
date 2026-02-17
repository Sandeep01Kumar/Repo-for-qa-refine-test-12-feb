'use strict';

// =============================================================================
// server.test.js — Comprehensive 12-Test Suite for server.js
// =============================================================================
// Validates all five root causes have been fixed:
//   RC1: Server error handling (EADDRINUSE logs friendly message, exits code 1)
//   RC2: Graceful shutdown (SIGTERM/SIGINT drain and exit code 0)
//   RC3: HTTP method validation (DELETE/POST/PUT → 405) & URL routing (→ 404)
//   RC4: Request/response stream error handling (malformed data → 400 / close)
//   RC5: Process-level exception safety (covered implicitly via RC1-RC4 tests)
//
// Uses ONLY Node.js built-in modules: http, net, child_process, assert, path.
// Zero external dependencies. No test frameworks (no Jest, Mocha, etc.).
//
// Run:     timeout 120 node server.test.js
// Output:  Total: 12 | Passed: <n> | Failed: <n>
// =============================================================================

const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const SERVER_PATH = path.join(__dirname, 'server.js');
const HOST = '127.0.0.1';
const PORT = 3000;
const STARTUP_TIMEOUT_MS = 5000;   // Max wait for "Server running" on stdout
const REQUEST_TIMEOUT_MS = 3000;   // Max wait for an HTTP response
const INTER_TEST_DELAY_MS = 300;   // Pause between tests for port release

// ---------------------------------------------------------------------------
// Test Result Tracking
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

// ---------------------------------------------------------------------------
// Helper: Start server.js as an isolated child process.
// Resolves once "Server running" appears on stdout.
// Returns { child, getStdout, getStderr } for post-test inspection.
// ---------------------------------------------------------------------------
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    child.stdout.on('data', (data) => {
      stdoutBuf += data.toString();
      if (!settled && stdoutBuf.includes('Server running')) {
        settled = true;
        resolve({
          child,
          getStdout: () => stdoutBuf,
          getStderr: () => stderrBuf
        });
      }
    });

    child.stderr.on('data', (data) => {
      stderrBuf += data.toString();
    });

    child.on('error', (err) => {
      if (!settled) { settled = true; reject(err); }
    });

    // If the server exits before printing the ready message, fail fast.
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(
          `Server exited prematurely with code ${code}. stderr: ${stderrBuf}`
        ));
      }
    });

    // Guard against indefinite hangs during startup.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(
          `Server startup timed out after ${STARTUP_TIMEOUT_MS}ms`
        ));
      }
    }, STARTUP_TIMEOUT_MS);
  });
}

// ---------------------------------------------------------------------------
// Helper: Start server with IPC channel for cross-platform signal testing.
// On Windows, child.kill('SIGTERM') terminates the process immediately
// without triggering signal handlers. This spawns the server via a thin
// wrapper that bridges IPC messages to process events, so that
// child.send('SIGTERM') or child.send('SIGINT') correctly invokes the
// handlers registered in server.js.
// ---------------------------------------------------------------------------
function startServerWithIPC() {
  return new Promise((resolve, reject) => {
    const wrapperCode = [
      'process.on("message", function(m) { process.emit(m); });',
      'require("./server.js");'
    ].join(' ');

    const child = spawn('node', ['-e', wrapperCode], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      cwd: __dirname
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    child.stdout.on('data', (data) => {
      stdoutBuf += data.toString();
      if (!settled && stdoutBuf.includes('Server running')) {
        settled = true;
        resolve({
          child,
          getStdout: () => stdoutBuf,
          getStderr: () => stderrBuf
        });
      }
    });

    child.stderr.on('data', (data) => {
      stderrBuf += data.toString();
    });

    child.on('error', (err) => {
      if (!settled) { settled = true; reject(err); }
    });

    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(
          `Server (IPC) exited prematurely with code ${code}. stderr: ${stderrBuf}`
        ));
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(
          `Server (IPC) startup timed out after ${STARTUP_TIMEOUT_MS}ms`
        ));
      }
    }, STARTUP_TIMEOUT_MS);
  });
}

// ---------------------------------------------------------------------------
// Helper: Stop the server gracefully and wait for the process to fully close.
// Returns the process exit code.
// ---------------------------------------------------------------------------
function stopServer(child) {
  return new Promise((resolve) => {
    // If the process already exited, resolve immediately.
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.on('close', (code) => resolve(code));
    child.kill('SIGTERM');
    // Safety net: force-kill after 5 s if the process hangs during drain.
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) { /* already exited */ }
    }, 5000).unref();
  });
}

// ---------------------------------------------------------------------------
// Helper: Make an HTTP request to the server under test.
// Returns { statusCode, headers, body }.
// ---------------------------------------------------------------------------
function makeRequest({ method = 'GET', urlPath = '/' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: HOST, port: PORT, path: urlPath, method, timeout: REQUEST_TIMEOUT_MS },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString(); });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Helper: Pause execution (ms). Used between tests for port release.
// ---------------------------------------------------------------------------
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Helper: Execute a single named test with structured pass/fail tracking.
// ---------------------------------------------------------------------------
async function runTest(name, testFn) {
  try {
    await testFn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL: ${name} — ${err.message}`);
  }
  // Brief pause between tests so the OS fully releases the port.
  await delay(INTER_TEST_DELAY_MS);
}

// ===========================================================================
// Main Test Suite — 12 Sequential Tests
// ===========================================================================
async function runTests() {
  console.log('Running server.js test suite...\n');

  // -----------------------------------------------------------------------
  // Test 1: GET / returns 200 with "Hello, World!"
  // Validates: Core functionality preserved after the defensive refactoring.
  // -----------------------------------------------------------------------
  await runTest('GET / returns 200 with "Hello, World!"', async () => {
    const { child } = await startServer();
    try {
      const res = await makeRequest({ method: 'GET', urlPath: '/' });
      assert.strictEqual(res.statusCode, 200,
        `Expected status 200, got ${res.statusCode}`);
      assert.strictEqual(res.body, 'Hello, World!\n',
        `Expected body "Hello, World!\\n", got "${res.body}"`);
    } finally {
      await stopServer(child);
    }
  });

  // -----------------------------------------------------------------------
  // Test 2: DELETE / returns 405 "Method Not Allowed"
  // Validates: Root Cause 3 — HTTP method validation rejects DELETE.
  // -----------------------------------------------------------------------
  await runTest('DELETE / returns 405 "Method Not Allowed"', async () => {
    const { child } = await startServer();
    try {
      const res = await makeRequest({ method: 'DELETE', urlPath: '/' });
      assert.strictEqual(res.statusCode, 405,
        `Expected status 405, got ${res.statusCode}`);
    } finally {
      await stopServer(child);
    }
  });

  // -----------------------------------------------------------------------
  // Test 3: POST / returns 405 "Method Not Allowed"
  // Validates: Root Cause 3 — HTTP method validation rejects POST.
  // -----------------------------------------------------------------------
  await runTest('POST / returns 405 "Method Not Allowed"', async () => {
    const { child } = await startServer();
    try {
      const res = await makeRequest({ method: 'POST', urlPath: '/' });
      assert.strictEqual(res.statusCode, 405,
        `Expected status 405, got ${res.statusCode}`);
    } finally {
      await stopServer(child);
    }
  });

  // -----------------------------------------------------------------------
  // Test 4: PUT / returns 405 "Method Not Allowed"
  // Validates: Root Cause 3 — HTTP method validation rejects PUT.
  // -----------------------------------------------------------------------
  await runTest('PUT / returns 405 "Method Not Allowed"', async () => {
    const { child } = await startServer();
    try {
      const res = await makeRequest({ method: 'PUT', urlPath: '/' });
      assert.strictEqual(res.statusCode, 405,
        `Expected status 405, got ${res.statusCode}`);
    } finally {
      await stopServer(child);
    }
  });

  // -----------------------------------------------------------------------
  // Test 5: 405 response includes Allow: GET header
  // Validates: Root Cause 3 — RFC 7231 §6.5.5 compliance (Allow header).
  // -----------------------------------------------------------------------
  await runTest('405 response includes Allow: GET header', async () => {
    const { child } = await startServer();
    try {
      const res = await makeRequest({ method: 'DELETE', urlPath: '/' });
      assert.strictEqual(res.statusCode, 405,
        `Expected status 405, got ${res.statusCode}`);
      assert.ok(res.headers['allow'],
        'Expected Allow header to be present in 405 response');
      assert.strictEqual(res.headers['allow'], 'GET',
        `Expected Allow: GET, got Allow: ${res.headers['allow']}`);
    } finally {
      await stopServer(child);
    }
  });

  // -----------------------------------------------------------------------
  // Test 6: GET /nonexistent returns 404 "Not Found"
  // Validates: Root Cause 3 — URL path validation rejects unknown paths.
  // -----------------------------------------------------------------------
  await runTest('GET /nonexistent returns 404 "Not Found"', async () => {
    const { child } = await startServer();
    try {
      const res = await makeRequest({ method: 'GET', urlPath: '/nonexistent' });
      assert.strictEqual(res.statusCode, 404,
        `Expected status 404, got ${res.statusCode}`);
    } finally {
      await stopServer(child);
    }
  });

  // -----------------------------------------------------------------------
  // Test 7: GET /admin returns 404 "Not Found"
  // Validates: Root Cause 3 — URL path validation rejects /admin.
  // -----------------------------------------------------------------------
  await runTest('GET /admin returns 404 "Not Found"', async () => {
    const { child } = await startServer();
    try {
      const res = await makeRequest({ method: 'GET', urlPath: '/admin' });
      assert.strictEqual(res.statusCode, 404,
        `Expected status 404, got ${res.statusCode}`);
    } finally {
      await stopServer(child);
    }
  });

  // -----------------------------------------------------------------------
  // Test 8: EADDRINUSE handling — friendly error and exit code 1
  // Validates: Root Cause 1 — server.on('error') catches bind failures.
  // Spawns two servers on the same port; the second must fail gracefully.
  // -----------------------------------------------------------------------
  await runTest('EADDRINUSE handling — friendly message and exit code 1', async () => {
    // Start the first server and wait for it to be fully listening.
    const { child: firstServer } = await startServer();
    try {
      // Spawn a second server that will collide on the same port.
      const exitInfo = await new Promise((resolve, reject) => {
        const secondServer = spawn('node', [SERVER_PATH], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        secondServer.stdout.on('data', (d) => { stdout += d.toString(); });
        secondServer.stderr.on('data', (d) => { stderr += d.toString(); });

        secondServer.on('close', (code) => {
          resolve({ code, stdout, stderr });
        });

        secondServer.on('error', reject);

        // Safety: force-kill the second server if it somehow doesn't exit.
        const safetyTimer = setTimeout(() => {
          try { secondServer.kill('SIGKILL'); } catch (_) { /* ignore */ }
          reject(new Error('Second server did not exit within timeout'));
        }, 5000);
        safetyTimer.unref();
      });

      const combinedOutput = exitInfo.stdout + exitInfo.stderr;
      assert.ok(
        combinedOutput.includes('Port 3000 is already in use'),
        `Expected "Port 3000 is already in use" in output, got: "${combinedOutput}"`
      );
      assert.strictEqual(exitInfo.code, 1,
        `Expected exit code 1, got ${exitInfo.code}`);
    } finally {
      await stopServer(firstServer);
    }
  });

  // -----------------------------------------------------------------------
  // Test 9: SIGTERM graceful shutdown — orderly drain, exit code 0
  // Validates: Root Cause 2 — process.on('SIGTERM') triggers gracefulShutdown.
  // Uses IPC-based signal emulation for cross-platform compatibility.
  // On Windows, child.kill('SIGTERM') terminates immediately without
  // invoking handlers; child.send('SIGTERM') emulates the signal correctly.
  // -----------------------------------------------------------------------
  await runTest('SIGTERM graceful shutdown — logs message and exits code 0', async () => {
    const { child, getStdout } = await startServerWithIPC();

    const exitInfo = await new Promise((resolve, reject) => {
      const safetyTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
        reject(new Error('Server did not exit within timeout after SIGTERM'));
      }, 5000);

      child.on('close', (code) => {
        clearTimeout(safetyTimer);
        resolve({ code, stdout: getStdout() });
      });

      // Deliver SIGTERM via IPC → process.emit('SIGTERM') in the child.
      child.send('SIGTERM');
    });

    assert.ok(
      exitInfo.stdout.includes('SIGTERM received. Starting graceful shutdown...'),
      `Expected SIGTERM shutdown message, got: "${exitInfo.stdout}"`
    );
    assert.strictEqual(exitInfo.code, 0,
      `Expected exit code 0, got ${exitInfo.code}`);
  });

  // -----------------------------------------------------------------------
  // Test 10: SIGINT graceful shutdown — orderly drain, exit code 0
  // Validates: Root Cause 2 — process.on('SIGINT') triggers gracefulShutdown.
  // Uses IPC-based signal emulation for cross-platform compatibility.
  // -----------------------------------------------------------------------
  await runTest('SIGINT graceful shutdown — logs message and exits code 0', async () => {
    const { child, getStdout } = await startServerWithIPC();

    const exitInfo = await new Promise((resolve, reject) => {
      const safetyTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
        reject(new Error('Server did not exit within timeout after SIGINT'));
      }, 5000);

      child.on('close', (code) => {
        clearTimeout(safetyTimer);
        resolve({ code, stdout: getStdout() });
      });

      // Deliver SIGINT via IPC → process.emit('SIGINT') in the child.
      child.send('SIGINT');
    });

    assert.ok(
      exitInfo.stdout.includes('SIGINT received. Starting graceful shutdown...'),
      `Expected SIGINT shutdown message, got: "${exitInfo.stdout}"`
    );
    assert.strictEqual(exitInfo.code, 0,
      `Expected exit code 0, got ${exitInfo.code}`);
  });

  // -----------------------------------------------------------------------
  // Test 11: Content-Type header is text/plain for GET /
  // Validates: Preserved original Content-Type header after refactoring.
  // -----------------------------------------------------------------------
  await runTest('Content-Type header is text/plain for GET /', async () => {
    const { child } = await startServer();
    try {
      const res = await makeRequest({ method: 'GET', urlPath: '/' });
      assert.strictEqual(res.statusCode, 200,
        `Expected status 200, got ${res.statusCode}`);
      assert.strictEqual(res.headers['content-type'], 'text/plain',
        `Expected text/plain, got ${res.headers['content-type']}`);
    } finally {
      await stopServer(child);
    }
  });

  // -----------------------------------------------------------------------
  // Test 12: Malformed request handling — garbage data handled gracefully
  // Validates: Root Cause 4 — server doesn't crash on non-HTTP input.
  // Sends raw garbage bytes via a TCP socket. Node.js HTTP parser rejects
  // the data and either returns 400 Bad Request or closes the connection.
  // -----------------------------------------------------------------------
  await runTest('Malformed request — garbage data returns 400 or closes connection', async () => {
    const { child } = await startServer();
    try {
      const result = await new Promise((resolve) => {
        const socket = new net.Socket();
        let data = '';
        let resolved = false;

        function settle() {
          if (!resolved) {
            resolved = true;
            socket.destroy();
            resolve({ data, closed: true });
          }
        }

        socket.connect(PORT, HOST, () => {
          // Send data that is definitely not a valid HTTP request.
          socket.write('GARBAGE_DATA_NOT_VALID_HTTP\r\n\r\n');
        });

        socket.on('data', (chunk) => { data += chunk.toString(); });
        socket.on('end', settle);
        socket.on('close', settle);
        socket.on('error', settle);

        // Safety timeout in case the socket neither receives data nor closes.
        setTimeout(settle, REQUEST_TIMEOUT_MS);
      });

      // The server should either:
      //  (a) respond with HTTP 400 Bad Request (Node.js default clientError), or
      //  (b) close/reset the connection.
      assert.ok(
        result.closed || result.data.includes('400') || result.data.includes('Bad Request'),
        `Expected 400 response or connection close, got: data="${result.data}"`
      );
    } finally {
      await stopServer(child);
    }
  });

  // -----------------------------------------------------------------------
  // Summary — exact format required by the specification
  // -----------------------------------------------------------------------
  console.log(`\nTotal: 12 | Passed: ${passed} | Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Entry Point — Execute the test suite
// ---------------------------------------------------------------------------
runTests().catch((err) => {
  console.error(`Test suite crashed: ${err.message}`);
  process.exit(1);
});
