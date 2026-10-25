// The ESP32 serves one HTML file. Inline trusted local assets in source order.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const sourceDir = __dirname;
const outputFile = path.resolve(sourceDir, '../data/index.html');

function localFile(reference, directory) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|[\\/])/i.test(reference)) {
        throw new Error(`Expected a relative local asset: ${reference}`);
    }
    const file = path.resolve(directory, reference);
    const relative = path.relative(sourceDir, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Asset is outside gui/: ${reference}`);
    }
    return file;
}

function inlineCss(file, parents = []) {
    if (parents.includes(file)) throw new Error(`Circular CSS import: ${file}`);
    const directory = path.dirname(file);
    return fs.readFileSync(file, 'utf8')
        .replace(/@import\s+(['"])([^'"]+)\1\s*;/g, (_, quote, reference) =>
            inlineCss(localFile(reference, directory), [...parents, file]))
        .replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g, (original, quote, reference) => {
            if (/^(?:data:|#)/i.test(reference)) return original;
            const asset = localFile(reference, directory);
            const types = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
            const type = types[path.extname(asset).toLowerCase()];
            if (!type) throw new Error(`Unsupported CSS asset: ${reference}`);
            return `url("data:${type};base64,${fs.readFileSync(asset).toString('base64')}")`;
        });
}

function build() {
    const html = fs.readFileSync(path.join(sourceDir, 'index.html'), 'utf8')
        .replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?\s*>/g, (_, reference) => {
            const css = inlineCss(localFile(reference, sourceDir));
            if (/@import\b/i.test(css)) throw new Error(`Unsupported CSS import in ${reference}`);
            return `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`;
        })
        .replace(/<script\s+src="([^"]+)"\s*>\s*<\/script>/g, (_, reference) => {
            const js = fs.readFileSync(localFile(reference, sourceDir), 'utf8');
            return `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`;
        })
        .replace(/\r\n?/g, '\n')
        .replace(/[\t ]+$/gm, '');
    if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel\s*=\s*["']stylesheet["']/i.test(html)) {
        throw new Error('Unresolved script or stylesheet in generated HTML');
    }
    const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    for (const match of markup.matchAll(/<(?:img|link)\b[^>]*\b(?:src|href)\s*=\s*(["'])([\s\S]*?)\1/gi)) {
        if (!/^data:/i.test(match[2])) throw new Error(`Image and icon assets must be inline: ${match[2]}`);
    }
    // Read and validate everything before touching the previously deployed page.
    const directory = path.dirname(outputFile);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryFile = path.join(directory, `.index.${randomUUID()}.tmp`);
    try {
        fs.writeFileSync(temporaryFile, html, { flag: 'wx' });
        fs.renameSync(temporaryFile, outputFile);
    } finally {
        if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    }
    console.log(`Built data/index.html (${Buffer.byteLength(html)} bytes)`);
    return html;
}

module.exports = { build };

if (require.main === module) {
    try {
        build();
    } catch (error) {
        console.error(`GUI build failed: ${error.message}`);
        process.exitCode = 1;
    }
}
