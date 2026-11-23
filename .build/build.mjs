/** 把编译后的 Tailwind CSS 与原生 JS 内嵌进单页 HTML */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const tpl = readFileSync(resolve(here, 'index.tpl.html'), 'utf8');
const css = readFileSync(resolve(here, 'tw.out.css'), 'utf8');
const js = readFileSync(resolve(here, 'app.js'), 'utf8');

if (js.includes('</script')) throw new Error('app.js contains a closing script tag');
if (css.includes('</style')) throw new Error('css contains a closing style tag');

const html = tpl.split('/*__TW_CSS__*/').join(css).split('/*__APP_JS__*/').join(js);
writeFileSync(resolve(root, 'index.html'), html, 'utf8');
console.log('index.html written:', (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1), 'KB');
