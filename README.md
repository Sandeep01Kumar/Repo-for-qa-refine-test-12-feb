# hao-backprop-test

A Node.js server tutorial project built with [Express.js](https://expressjs.com/). This project demonstrates a simple HTTP server with multiple route handlers serving plaintext responses.

## Prerequisites

- [Node.js](https://nodejs.org/) version 18 or higher

## Installation

Clone the repository and install the dependencies:

```bash
npm install
```

## Getting Started

Start the server using npm:

```bash
npm start
```

Or run directly with Node.js:

```bash
node server.js
```

The server will start and listen at **http://127.0.0.1:3000/**.

You should see the following output in your terminal:

```
Server running at http://127.0.0.1:3000/
```

## API Endpoints

| Method | Path       | Response            | Content Type |
|--------|------------|---------------------|--------------|
| GET    | `/`        | `Hello, World!\n`   | text/plain   |
| GET    | `/evening` | `Good evening`      | text/plain   |

### GET /

Returns a "Hello, World!" greeting with a trailing newline.

**Example:**

```bash
curl http://127.0.0.1:3000/
```

**Response:**

```
Hello, World!
```

### GET /evening

Returns a "Good evening" greeting.

**Example:**

```bash
curl http://127.0.0.1:3000/evening
```

**Response:**

```
Good evening
```
