const express = require('express');

const app = express();

// GET / — Preserved "Hello, World!" endpoint (character-for-character identical response with trailing newline)
app.get('/', (req, res) => {
  res.send('Hello, World!\n');
});

// GET /evening — New endpoint returning "Good evening" as plaintext
app.get('/evening', (req, res) => {
  res.send('Good evening');
});

// Bind to 127.0.0.1:3000 with preserved startup log message
app.listen(3000, '127.0.0.1', () => {
  console.log('Server running at http://127.0.0.1:3000/');
});
