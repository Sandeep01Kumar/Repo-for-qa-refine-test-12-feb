"""Flask HTTP server application — drop-in replacement for the Node.js server.js.

Responds to every inbound HTTP request (all methods, all URL paths) with:
  - Status: 200 OK
  - Content-Type: text/plain
  - Body: Hello, World!\n

Binds to 127.0.0.1:3000 and prints a startup confirmation message to stdout.
"""

from flask import Flask, Response

# ---------------------------------------------------------------------------
# Application instance
# ---------------------------------------------------------------------------
app = Flask(__name__)


# ---------------------------------------------------------------------------
# Catch-all route — mirrors the Node.js http.createServer callback that
# handles every request regardless of HTTP method or URL path.
#
# Two decorators are required so Flask matches:
#   1. The bare root path  "/"
#   2. Every other path    "/<anything>"
# ---------------------------------------------------------------------------
@app.route('/', defaults={'path': ''}, methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
def catch_all(path):
    """Return a plain-text 'Hello, World!' response for any request."""
    return Response('Hello, World!\n', status=200, mimetype='text/plain')


# ---------------------------------------------------------------------------
# Server entry point — equivalent to server.listen(port, hostname, callback)
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    print('Server running at http://127.0.0.1:3000/')
    app.run(host='127.0.0.1', port=3000)
