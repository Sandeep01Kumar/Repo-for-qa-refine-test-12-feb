const http = require('http');
const url = require('url');

const hostname = '127.0.0.1';
const port = 3000;

const openConnections = new Set();
let isShuttingDown = false;

// Create HTTP server with comprehensive request handling
const server = http.createServer((req, res) => {
  // Handle request stream errors
  req.on('error', (err) => {
    console.error('Request error:', err);
    if (!res.headersSent) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Bad Request\n');
    }
  });

  // Handle response stream errors
  res.on('error', (err) => {
    console.error('Response error:', err);
  });

  // Parse URL pathname, stripping query strings
  const pathname = url.parse(req.url).pathname;

  // Validate HTTP method - only GET is allowed
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Allow', 'GET');
    res.end('Method Not Allowed\n');
    return;
  }

  // Validate URL path - only '/' is a known route
  if (pathname !== '/') {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Not Found\n');
    return;
  }

  // Successful GET / response
  const body = 'Hello, World!\n';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
});

// Configure server timeout (30 seconds)
server.setTimeout(30000, (socket) => {
  socket.destroy();
});

// Handle server-level errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

// Track open connections for cleanup on shutdown
server.on('connection', (socket) => {
  openConnections.add(socket);
  socket.on('close', () => {
    openConnections.delete(socket);
  });
});

// Graceful shutdown function
function gracefulShutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('Server closed. All connections drained.');
    process.exit(0);
  });

  // Destroy all open connections
  for (const socket of openConnections) {
    socket.destroy();
  }

  // Force shutdown after 5 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000).unref();
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Global error safety nets
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the server
server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

module.exports = { server, gracefulShutdown };
