const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function createStaticServer(rootDir) {
  const root = path.resolve(rootDir);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        let relativePath = decodeURIComponent(url.pathname);
        if (relativePath === '/' || relativePath === '') {
          relativePath = '/index.html';
        }

        const filePath = path.normalize(path.join(root, relativePath));
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        fs.readFile(filePath, (error, data) => {
          if (error) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
          res.end(data);
        });
      } catch (error) {
        res.writeHead(500);
        res.end('Server error');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://localhost:${port}/` });
    });

    server.on('error', reject);
  });
}

module.exports = { createStaticServer };
