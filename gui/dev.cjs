const http = require('node:http');
const { build } = require('./build.cjs');

function startPreview({ port = 1234 } = {}) {
    const html = Buffer.from(build());
    const server = http.createServer((request, response) => {
        if (request.url !== '/') {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found\n');
            return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405, { Allow: 'GET, HEAD' });
            response.end();
            return;
        }
        response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': html.length,
            'Cache-Control': 'no-store'
        });
        response.end(request.method === 'HEAD' ? undefined : html);
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve(server);
        });
    });
}

module.exports = { startPreview };

if (require.main === module) {
    startPreview().then(() => {
        console.log('GUI preview: http://127.0.0.1:1234/ (restart after edits; device APIs unavailable)');
    }).catch(error => {
        console.error(`GUI preview failed: ${error.message}`);
        process.exitCode = 1;
    });
}
