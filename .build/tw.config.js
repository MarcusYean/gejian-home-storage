/** Tailwind CSS v3 — 只扫描单页原型，产出可内嵌的最小样式表 */
module.exports = {
  content: [
    './.build/index.tpl.html',
    './.build/app.js'
  ],
  theme: { extend: {} },
  plugins: [],
  corePlugins: { preflight: true }
};
