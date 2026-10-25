const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const { startPreview } = require('../dev.cjs');

function request(port, pathname, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: pathname, method, agent: false }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
        });
        req.on('error', reject);
        req.end();
    });
}

test('preview serves only the built page on loopback and fails when the port is busy', async () => {
    const server = await startPreview({ port: 0 });
    try {
        const address = server.address();
        assert.equal(address.address, '127.0.0.1');
        const root = await request(address.port, '/');
        assert.equal(root.status, 200);
        assert.match(root.headers['content-type'], /^text\/html; charset=utf-8$/);
        assert.match(root.body, /<title>SigGen<\/title>/);
        assert.ok(!/<script[^>]*\bsrc\s*=/.test(root.body));
        const head = await request(address.port, '/', 'HEAD');
        assert.equal(head.status, 200);
        assert.equal(head.body, '');
        for (const pathname of ['/gui/package.json', '/../gui/package.json', '/%2e%2e/gui/package.json', '/config', '/setup', '/stop', '/reboot']) {
            const response = await request(address.port, pathname);
            assert.equal(response.status, 404, pathname);
            assert.equal(response.body, 'Not found\n');
        }
        assert.equal((await request(address.port, '/', 'POST')).status, 405);
        await assert.rejects(startPreview({ port: address.port }), { code: 'EADDRINUSE' });
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
