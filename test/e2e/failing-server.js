// This server intentionally fails to start to test error reporting
console.error('Failed to start web server: Port already in use');
console.error('Error: listen EADDRINUSE: address already in use :::3456');
process.exit(1);