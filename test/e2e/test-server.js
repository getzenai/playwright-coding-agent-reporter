const http = require('http');

const PORT = process.env.PORT || 3456;

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] Request: ${req.method} ${req.url}`);

  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Test Server</title></head>
        <body>
          <h1>Test Server Running</h1>
          <div id="content">Server is working!</div>
        </body>
      </html>
    `);
  } else if (req.url === '/slow') {
    // Simulate a slow response
    console.log('Handling slow request...');
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Slow Page</title></head>
          <body>
            <h1>Slow Response</h1>
            <div id="content">Finally loaded!</div>
          </body>
        </html>
      `);
    }, 5000); // 5 second delay
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('Press Ctrl+C to stop the server');
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
