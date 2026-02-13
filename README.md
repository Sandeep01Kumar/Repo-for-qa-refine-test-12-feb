# hao-backprop-test

A Node.js Express.js server tutorial project demonstrating basic HTTP endpoint routing. Originally a raw `http` module server returning "Hello World", now powered by Express.js with multiple route handlers.

## Prerequisites

- **Node.js** 18 or higher (Express 5 requirement)
- **npm** (included with Node.js)

## Installation

Clone the repository and install dependencies:

```bash
npm install
```

## Usage

Start the server:

```bash
npm start
```

Or run directly:

```bash
node server.js
```

The server runs at **http://127.0.0.1:3000/**

## API Endpoints

| Method | Path       | Response              | Content Type |
|--------|------------|-----------------------|--------------|
| GET    | `/`        | `Hello, World!\n`     | text/plain   |
| GET    | `/evening` | `Good evening`        | text/plain   |

### GET /

Returns the classic "Hello, World!" greeting with a trailing newline.

```
curl http://127.0.0.1:3000/
Hello, World!
```

### GET /evening

Returns a "Good evening" plaintext response.

```
curl http://127.0.0.1:3000/evening
Good evening
```

Unmatched routes return a 404 response.

## License

MIT
