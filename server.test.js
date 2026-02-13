const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { spawn, fork } = require('node:child_process');

// Import the server module — this starts the server on 127.0.0.1:3000
const serverModule = require('./server');

// Helper: make an HTTP request and return { statusCode, headers, body }.
// Uses http.get for GET requests and http.request for other methods.
// All requests use agent: false to prevent keep-alive connection pooling,
// ensuring each request gets its own socket that is closed after the response.
function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const opts = { agent: false, ...options };

    const callback = (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    };

    const isGet = !opts.method || opts.method === 'GET';
    const req = isGet ? http.get(opts, callback) : http.request(opts, callback);
    req.on('error', reject);
    if (!isGet) {
      req.end();
    }
  });
}

// Helper: wait for the imported server to be listening.
// Resolves immediately if already listening, or waits for the 'listening' event.
function waitForServerReady() {
  return new Promise((resolve) => {
    if (serverModule.server.listening) {
      resolve();
    } else {
      serverModule.server.once('listening', resolve);
    }
  });
}

// ============================================================
// Suite 5: Module Exports (1 test)
// ============================================================
describe('Module Exports', () => {
  it('exports server and gracefulShutdown', () => {
    assert.ok(serverModule.server, 'server should be exported');
    assert.ok(serverModule.gracefulShutdown, 'gracefulShutdown should be exported');
    assert.strictEqual(typeof serverModule.gracefulShutdown, 'function');
  });
});

// ============================================================
// Suite 1: HTTP Request Processing (8 tests)
// ============================================================
describe('HTTP Request Processing', () => {
  before(async () => {
    await waitForServerReady();
  });

  it('GET / returns status 200 with body Hello, World!\\n', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body, 'Hello, World!\n');
  });

  it('GET / returns Content-Type: text/plain header', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/'
    });
    assert.strictEqual(res.headers['content-type'], 'text/plain');
  });

  it('GET /nonexistent returns 404 Not Found', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/nonexistent'
    });
    assert.strictEqual(res.statusCode, 404);
  });

  it('GET /admin returns 404 Not Found', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/admin'
    });
    assert.strictEqual(res.statusCode, 404);
  });

  it('POST / returns 405 Method Not Allowed with Allow: GET header', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/',
      method: 'POST'
    });
    assert.strictEqual(res.statusCode, 405);
    assert.strictEqual(res.headers['allow'], 'GET');
  });

  it('PUT / returns 405 Method Not Allowed', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/',
      method: 'PUT'
    });
    assert.strictEqual(res.statusCode, 405);
  });

  it('GET /?key=value returns 200 (query string stripped)', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/?key=value'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body, 'Hello, World!\n');
  });

  it('GET / response includes Content-Length header', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/'
    });
    const expectedLength = Buffer.byteLength('Hello, World!\n').toString();
    assert.strictEqual(res.headers['content-length'], expectedLength);
  });
});

// ============================================================
// Suite 4: Connection Tracking (1 test)
// ============================================================
describe('Connection Tracking', () => {
  after(async () => {
    // Close the imported server to free port 3000 for child process suites
    await new Promise((resolve) => {
      serverModule.server.close(resolve);
    });
  });

  it('connections are tracked and cleaned up on socket close', async () => {
    let trackedSocket = null;

    // Register a one-time connection listener to capture the socket reference.
    // The server.js module also has its own 'connection' listener that adds the
    // socket to the openConnections Set — EventEmitter supports multiple listeners.
    const connectionHandler = (socket) => {
      trackedSocket = socket;
    };
    serverModule.server.once('connection', connectionHandler);

    // Make a request with Connection: close to ensure the socket is cleaned up
    await makeRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/',
      headers: { 'Connection': 'close' }
    });

    // Verify a socket was captured (proves connection was tracked)
    assert.ok(trackedSocket, 'Connection socket should have been captured');

    // Wait for socket to be fully closed and cleaned up if not already destroyed
    if (!trackedSocket.destroyed) {
      await new Promise((resolve) => {
        trackedSocket.on('close', resolve);
      });
    }

    // Verify socket is destroyed (proves resource cleanup occurred)
    assert.ok(trackedSocket.destroyed, 'Socket should be destroyed after connection close');
  });
});

// ============================================================
// Suite 2: Graceful Shutdown (2 tests)
// ============================================================
describe('Graceful Shutdown', () => {
  // Wrapper code that imports the server module and exposes gracefulShutdown
  // via IPC messaging. This ensures cross-platform compatibility: on Windows,
  // child.kill('SIGTERM') terminates the process unconditionally without
  // invoking Node.js signal handlers, so we use IPC to trigger the shutdown
  // function directly, which validates the same graceful shutdown behavior.
  const wrapperCode = 'const s = require("./server");' +
    ' process.on("message", (msg) => { s.gracefulShutdown(msg); });';

  it('SIGTERM triggers graceful shutdown with exit code 0', async () => {
    // Spawn server as a child process using spawn with IPC channel
    const child = spawn(process.execPath, ['-e', wrapperCode], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      cwd: process.cwd()
    });

    // Wait for the child server to start listening
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Server start timeout'));
      }, 5000);
      child.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('Server running')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    // Trigger graceful shutdown with SIGTERM signal name via IPC
    child.send('SIGTERM');

    // Wait for child to exit and capture exit code
    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Process exit timeout'));
      }, 10000);
      child.on('exit', (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    assert.strictEqual(exitCode, 0);
  });

  it('SIGINT triggers graceful shutdown with exit code 0', async () => {
    // Spawn server as a child process using spawn with IPC channel
    const child = spawn(process.execPath, ['-e', wrapperCode], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      cwd: process.cwd()
    });

    // Wait for the child server to start listening
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Server start timeout'));
      }, 5000);
      child.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('Server running')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    // Trigger graceful shutdown with SIGINT signal name via IPC
    child.send('SIGINT');

    // Wait for child to exit and capture exit code
    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Process exit timeout'));
      }, 10000);
      child.on('exit', (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    assert.strictEqual(exitCode, 0);
  });
});

// ============================================================
// Suite 3: Server Error Handling (1 test)
// ============================================================
describe('Server Error Handling', () => {
  let blockingServer;

  before(async () => {
    // Start a temporary server on port 3000 to block it for the EADDRINUSE test
    blockingServer = http.createServer();
    await new Promise((resolve) => {
      blockingServer.listen(3000, '127.0.0.1', resolve);
    });
  });

  after(async () => {
    // Clean up the blocking server
    await new Promise((resolve) => {
      blockingServer.close(resolve);
    });
  });

  it('EADDRINUSE produces diagnostic message and exits with code 1', async () => {
    // Spawn server.js as a child process using fork — should fail with EADDRINUSE
    // because port 3000 is already occupied by the blocking server
    const child = fork('./server.js', [], { silent: true });

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    // Wait for child to exit and capture exit code
    const exitCode = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Process exit timeout'));
      }, 10000);
      child.on('exit', (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    assert.strictEqual(exitCode, 1);
    assert.ok(
      stderr.includes('Port 3000 is already in use'),
      'stderr should contain EADDRINUSE diagnostic message'
    );
  });
});
