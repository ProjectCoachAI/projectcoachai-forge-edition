/*
 * Tests for Forge.renderMarkdown (diary-web/js/forge-api.js).
 *
 * Run from the repository root:
 *   npm install --no-save jsdom
 *   node --test diary-web/tests/renderer.test.js
 *
 * Each test feeds the renderer a small input and checks the HTML that comes
 * out. Every bug fixed around Oct 2026 (stray backslashes, broken tables,
 * attribute injection through quotes) has a test here so it cannot return
 * unnoticed. Add a case whenever a new rendering bug is found.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'forge-api.js'), 'utf8');
const dom = new JSDOM('<body></body>', { runScripts: 'outside-only', url: 'https://diary.projectcoachai.com/app' });
dom.window.eval(source);
const render = dom.window.Forge.renderMarkdown;

// Parse the output the way a browser would, so tests check real elements,
// not string fragments.
function parse(md) {
  const box = dom.window.document.createElement('div');
  box.innerHTML = render(md);
  return box;
}

test('empty input gives empty output', () => {
  assert.strictEqual(render(''), '');
  assert.strictEqual(render(null), '');
});

test('headings, bold, italics and inline code', () => {
  const box = parse('# Title\n\nSome **bold**, _italic_ and `code`.');
  assert.strictEqual(box.querySelector('h1').textContent, 'Title');
  assert.strictEqual(box.querySelector('strong').textContent, 'bold');
  assert.strictEqual(box.querySelector('em').textContent, 'italic');
  assert.strictEqual(box.querySelector('code').textContent, 'code');
});

test('snake_case words are not turned into italics', () => {
  const box = parse('Use pilatus_summary_v2 and my_file_name here.');
  assert.strictEqual(box.querySelector('em'), null);
  assert.ok(box.textContent.includes('pilatus_summary_v2'));
});

test('backslash escapes are removed from plain text', () => {
  const box = parse('- pilatus\\_summary.xlsx\n- \\[Q1\\] Best electric vehicles\n- 1\\. item\n- a\\*b');
  const text = box.textContent;
  assert.ok(text.includes('pilatus_summary.xlsx'));
  assert.ok(text.includes('[Q1] Best electric vehicles'));
  assert.ok(text.includes('1. item'));
  assert.ok(text.includes('a*b'));
  assert.ok(!text.includes('\\'), 'no backslash should remain: ' + text);
});

test('a real backslash path is left alone', () => {
  const box = parse('Open C:\\Users\\me\\file.txt');
  assert.ok(box.textContent.includes('C:\\Users\\me\\file.txt'));
});

test('code blocks keep their content exactly as written', () => {
  const code = '# not a heading\nx = "__init__" + \\_y\n**kwargs';
  const box = parse('Before\n\n```python\n' + code + '\n```\n\nAfter');
  const pre = box.querySelector('pre');
  assert.ok(pre, 'a <pre> block is produced');
  assert.strictEqual(box.querySelector('h1'), null, 'no heading made from a code comment');
  assert.strictEqual(pre.querySelector('strong'), null, 'no bold made inside code');
  assert.ok(pre.textContent.includes('# not a heading'));
  assert.ok(pre.textContent.includes('"__init__"'));
  assert.ok(pre.textContent.includes('\\_y'), 'backslash inside code is preserved');
});

test('tables render with a header row and body rows', () => {
  const box = parse('| Model | Type |\n|---|---|\n| PC-12 | Turboprop |\n| PC-24 | Jet |');
  assert.strictEqual(box.querySelectorAll('table').length, 1);
  assert.deepStrictEqual([...box.querySelectorAll('th')].map(n => n.textContent), ['Model', 'Type']);
  assert.strictEqual(box.querySelectorAll('tbody tr').length, 2);
  assert.strictEqual(box.querySelectorAll('td')[3].textContent, 'Jet');
});

test('lists render as lists', () => {
  const box = parse('- one\n- two\n\n1. a\n2. b');
  assert.strictEqual(box.querySelectorAll('ul li').length, 2);
  assert.strictEqual(box.querySelectorAll('ol li').length, 2);
});

test('HTML in the text is shown as text, never run', () => {
  const box = parse('<script>alert(1)</script> and <img src=x onerror=alert(1)> and a & b');
  assert.strictEqual(box.querySelector('script'), null);
  assert.strictEqual(box.querySelector('img'), null);
  assert.ok(box.textContent.includes('<script>alert(1)</script>'));
  assert.ok(box.textContent.includes('a & b'));
});

test('a quote in an image description cannot add attributes', () => {
  const box = parse('![a" onerror="alert(1)](https://example.com/a.png)');
  const img = box.querySelector('img');
  assert.ok(img, 'the image is still rendered');
  assert.strictEqual(img.getAttribute('src'), 'https://example.com/a.png');
  assert.strictEqual(img.getAttribute('alt'), 'a" onerror="alert(1)');
  // the only onerror is the renderer's own, which hides a broken image
  assert.strictEqual(img.getAttribute('onerror'), "this.style.display='none'");
});

test('a quote in a link address cannot add attributes', () => {
  const box = parse('[x](https://a.com/"onmouseover="alert(1)) text');
  const a = box.querySelector('a');
  assert.ok(a);
  assert.strictEqual(a.getAttribute('onmouseover'), null);
  assert.ok(a.getAttribute('href').startsWith('https://a.com/'));
});

test('a quote in an image caption stays text', () => {
  const box = parse('![ok](https://example.com/a.png)\n\ncaption" onclick="z');
  const caption = [...box.querySelectorAll('div')].find(d => d.textContent.includes('caption'));
  assert.ok(caption);
  assert.strictEqual(caption.getAttribute('onclick'), null);
  assert.ok(caption.textContent.includes('caption" onclick="z'));
});

test('only http(s) images and links are made clickable', () => {
  const box = parse('![x](javascript:alert(1)) and [y](javascript:alert(1)) and [z](https://ok.example/p)');
  assert.strictEqual(box.querySelector('img'), null);
  const links = [...box.querySelectorAll('a')];
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0].getAttribute('href'), 'https://ok.example/p');
  assert.strictEqual(links[0].getAttribute('rel'), 'noopener');
});

test('ordinary quotes and apostrophes read normally', () => {
  const box = parse('She said "hello" and it\'s fine.');
  assert.strictEqual(box.textContent.trim(), 'She said "hello" and it\'s fine.');
});

test('two or more images in a row are grouped in one strip', () => {
  const box = parse('![a](https://e.com/1.png)\n\n![b](https://e.com/2.png)\n\n');
  assert.strictEqual(box.querySelectorAll('img').length, 2);
  assert.strictEqual(box.querySelectorAll('img')[0].parentElement.parentElement, box.querySelectorAll('img')[1].parentElement.parentElement);
});
