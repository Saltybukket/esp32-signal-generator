const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('a failed asset read preserves the deployed page and neighboring data', () => {
  const root = fs.mkdtempSync(path.join(__dirname, '.build-'));
  try {
    const source = path.join(root, 'gui');
    const data = path.join(root, 'data');
    fs.mkdirSync(source);
    fs.mkdirSync(data);
    fs.copyFileSync(path.join(__dirname, '..', 'build.cjs'), path.join(source, 'build.cjs'));
    fs.writeFileSync(path.join(source, 'index.html'), '<script src="./missing.js"></script>');
    fs.writeFileSync(path.join(data, 'index.html'), 'last successful build');
    fs.writeFileSync(path.join(data, 'keep.txt'), 'other device asset');
    const result = spawnSync(process.execPath, [path.join(source, 'build.cjs')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing\.js/);
    assert.equal(fs.readFileSync(path.join(data, 'index.html'), 'utf8'), 'last successful build');
    assert.equal(fs.readFileSync(path.join(data, 'keep.txt'), 'utf8'), 'other device asset');
    assert.deepEqual(fs.readdirSync(data).sort(), ['index.html', 'keep.txt']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('builds deterministically with nested styles and classic scripts in source order', () => {
  const root = fs.mkdtempSync(path.join(__dirname, '.build-'));
  try {
    const source = path.join(root, 'gui');
    fs.mkdirSync(path.join(source, 'css'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '..', 'build.cjs'), path.join(source, 'build.cjs'));
    fs.writeFileSync(path.join(source, 'index.html'), '<link rel="stylesheet" href="./css/style.css"><script src="./first.js"></script><p>UI</p><script src="./last.js"></script>');
    fs.writeFileSync(path.join(source, 'css/style.css'), '@import "./font.css";\nbody { color: blue; }');
    fs.writeFileSync(path.join(source, 'css/font.css'), '@font-face { src: url(./icons.woff2); }');
    fs.writeFileSync(path.join(source, 'css/icons.woff2'), Buffer.from([1, 2, 3]));
    fs.writeFileSync(path.join(source, 'first.js'), 'window.first = "</script>";');
    fs.writeFileSync(path.join(source, 'last.js'), 'window.last = window.first;');
    const run = () => spawnSync(process.execPath, [path.join(source, 'build.cjs')], { encoding: 'utf8' });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const output = fs.readFileSync(path.join(root, 'data/index.html'), 'utf8');
    assert.equal(output, '<style>\n@font-face { src: url("data:font/woff2;base64,AQID"); }\nbody { color: blue; }\n</style><script>\nwindow.first = "<\\/script>";\n</script><p>UI</p><script>\nwindow.last = window.first;\n</script>');
    assert.equal(run().status, 0);
    assert.equal(fs.readFileSync(path.join(root, 'data/index.html'), 'utf8'), output);
    assert.deepEqual(fs.readdirSync(path.join(root, 'data')), ['index.html']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('refuses a linked image rather than producing an incomplete device page', () => {
  const root = fs.mkdtempSync(path.join(__dirname, '.build-'));
  try {
    const source = path.join(root, 'gui');
    fs.mkdirSync(source);
    fs.copyFileSync(path.join(__dirname, '..', 'build.cjs'), path.join(source, 'build.cjs'));
    fs.writeFileSync(path.join(source, 'index.html'), '<img src="https://example.invalid/icon.png">');
    const result = spawnSync(process.execPath, [path.join(source, 'build.cjs')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /inline/);
    assert.equal(fs.existsSync(path.join(root, 'data/index.html')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
