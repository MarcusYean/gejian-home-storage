/** 真实浏览器交互冒烟测试 v2：三级层级 + 原有交互（零依赖，复用 taste-skill 的 CDP 客户端） */
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const url = process.env.SMOKE_URL || pathToFileURL(resolve(root, 'index.html')).href;
const cdp = resolve('C:/Users/Administrator/.workbuddy/skills/design-taste-frontend/scripts/lib/cdp.mjs');
const { Browser: B } = await import(pathToFileURL(cdp).href);
mkdirSync(resolve(root, '.build/shots'), { recursive: true });

const browser = await B.launch({ width: 1440, height: 900 });
const page = await browser.newPage({ width: 1440, height: 900 });
await page.goto(url, { settleMs: 900 });
await new Promise(r => setTimeout(r, 700));

const results = [];
const check = (name, cond, detail) => results.push([cond ? 'PASS' : 'FAIL', name, detail || '']);
async function mouse(selector) {
  const r = await page.eval((s) => {
    const e = document.querySelector(s); if (!e) return null;
    try { if (!e.ownerSVGElement && !e.closest('#plan')) e.scrollIntoView({ block: 'center', inline: 'center' }); } catch (err) {}
    const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, selector);
  if (!r) throw new Error('missing element ' + selector);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await new Promise(r2 => setTimeout(r2, 130));
}
async function drag(x1, y1, x2, y2) {
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1, buttons: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (x1 + x2) / 2, y: (y1 + y2) / 2, button: 'left', buttons: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x2, y: y2, button: 'left', buttons: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1, buttons: 0 });
  await new Promise(r => setTimeout(r, 220));
}
async function overlapsCount() {
  return await page.eval(() => {
    const rs = Array.from(document.querySelectorAll('#scene [data-zone] .zone-shape')).map(e => ({
      x: parseFloat(e.getAttribute('x')), y: parseFloat(e.getAttribute('y')),
      w: parseFloat(e.getAttribute('width')), h: parseFloat(e.getAttribute('height'))
    })).filter(r => Number.isFinite(r.x) && Number.isFinite(r.w));
    let bad = 0;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.x < b.x + b.w - 0.6 && a.x + a.w > b.x + 0.6 && a.y < b.y + b.h - 0.6 && a.y + a.h > b.y + 0.6) bad++;
    }
    return { n: rs.length, bad };
  });
}
async function goDefaultArea() {
  await mouse('#backRoomBtn');
  await mouse('#scene [data-area="a_tatami"] .zone-shape');
}

/* 1. 基础渲染与三级层级 */
const base = await page.eval(() => ({
  title: document.title,
  h1: document.querySelector('h1').textContent,
  crumb: document.querySelector('#crumb').textContent,
  zones: document.querySelectorAll('#scene [data-zone]').length,
  rooms: document.querySelectorAll('#spaceTree [data-room]:not([data-area])').length,
  treeAreas: document.querySelectorAll('#spaceTree .tree-row.lvl2').length,
  treeCells: document.querySelectorAll('#spaceTree .tree-row.lvl3').length,
  tools: document.querySelectorAll('#toolbar [data-tool]').length,
  tray: document.querySelectorAll('#trayList [data-item]').length,
  tpl: document.querySelectorAll('#tplGrid [data-tpl]').length,
  propName: document.querySelector('[data-field="name"]') && document.querySelector('[data-field="name"]').value,
  count: document.querySelector('#spaceCount').textContent
}));
check('单页加载 + 三级标题', /格间/.test(base.title) && /榻榻米/.test(base.h1), JSON.stringify(base));
check('初始区域 6 个收纳格 / 9 工具 / 8 待收纳 / 6 模板', base.zones === 6 && base.tools === 9 && base.tray === 8 && base.tpl === 6, 'zones=' + base.zones);
check('空间树呈现房间 › 区域 › 收纳格三级', base.rooms === 6 && base.treeAreas === 4 && base.treeCells === 6 && /房间 ·/.test(base.count), JSON.stringify({ rooms: base.rooms, areas: base.treeAreas, cells: base.treeCells, count: base.count }));
check('面包屑显示完整路径', /主卧/.test(base.crumb) && /榻榻米/.test(base.crumb) && /收纳格/.test(base.crumb), base.crumb);
check('属性面板绑定第三级收纳格', base.propName === '换季被褥格', 'name=' + base.propName);

/* 2. 主题 */
await mouse('#themeToggle');
const theme = await page.eval(() => ({ t: document.documentElement.dataset.theme, fill: document.querySelector('.zone-shape').getAttribute('fill') }));
check('深浅主题切换并刷新画布配色', theme.t === 'dark' && theme.fill === '#1f2630', JSON.stringify(theme));
await mouse('#themeToggle');

/* 3. 房间概览（第一级 / 第二级） */
await mouse('#backRoomBtn');
const roomView = await page.eval(() => ({
  h1: document.querySelector('h1').textContent,
  areas: document.querySelectorAll('#scene [data-area]').length,
  roomProp: !!document.querySelector('[data-field="room-name"]'),
  backHidden: document.querySelector('#backRoomBtn').hidden,
  crumb: document.querySelector('#crumb').textContent
}));
check('房间概览显示 4 个区域轮廓 + 房间属性', /房间概览/.test(roomView.h1) && roomView.areas === 4 && roomView.roomProp && roomView.backHidden, JSON.stringify(roomView));
await page.screenshot({ path: resolve(root, '.build/shots/room-overview.jpg') });
await mouse('#scene [data-area="a_wardrobe"] .zone-shape');
const ward = await page.eval(() => ({ h1: document.querySelector('h1').textContent, zones: document.querySelectorAll('#scene [data-zone]').length, crumb: document.querySelector('#crumb').textContent }));
check('点击区域轮廓进入第二级，画布切为其内部收纳格', /衣柜/.test(ward.h1) && ward.zones === 6 && /衣柜/.test(ward.crumb), JSON.stringify(ward));

/* 4. 三级树导航 */
await mouse('#spaceTree [data-room="kitchen"]');
const kit = await page.eval(() => ({ h1: document.querySelector('h1').textContent, areas: document.querySelectorAll('#scene [data-area]').length }));
check('树中点击房间 → 房间概览', /厨房/.test(kit.h1) && kit.areas === 3, JSON.stringify(kit));
await mouse('#spaceTree [data-area="a_spice"]');
const spice = await page.eval(() => ({ h1: document.querySelector('h1').textContent, zones: document.querySelectorAll('#scene [data-zone]').length }));
check('树中点击区域 → 进入其内部 4 格', /调料架/.test(spice.h1) && spice.zones === 4, JSON.stringify(spice));
await mouse('#spaceTree .tree-row.lvl3');
const cell = await page.eval(() => ({ active: document.querySelectorAll('#spaceTree .tree-row.lvl3.active').length, prop: !!document.querySelector('[data-field="name"]') }));
check('树中点击第三级收纳格 → 选中并绑定属性', cell.active === 1 && cell.prop, JSON.stringify(cell));

/* 5. 新建区域 / 房间 */
await mouse('#addAreaBtn');
const newArea = await page.eval(() => ({ h1: document.querySelector('h1').textContent, zones: document.querySelectorAll('#scene [data-zone]').length, added: Array.from(document.querySelectorAll('#spaceTree .tree-row.lvl2')).some(b => /新区域/.test(b.textContent)) }));
check('新建区域自动带 1 格并可直接切分', /新区域/.test(newArea.h1) && newArea.zones === 1 && newArea.added, JSON.stringify(newArea));
await mouse('#undoBtn');
const u = await page.eval(() => document.querySelector('h1').textContent);
check('撤销回退新建区域', /榻榻米/.test(u), u);
await mouse('#redoBtn');
const r2 = await page.eval(() => document.querySelector('h1').textContent);
check('重做恢复新建区域', /新区域/.test(r2), r2);
await mouse('#undoBtn');

/* 6. 回到主卧榻榻米：横切第三级 */
await mouse('#spaceTree [data-room="bedroom"]');
await mouse('#spaceTree [data-area="a_tatami"]');
await mouse('#toolbar [data-tool="hcut"]');
await mouse('#scene [data-zone="z_t1"] .zone-shape');
const afterCut = await page.eval(() => ({ n: document.querySelectorAll('#scene [data-zone]').length, undo: !document.querySelector('#undoBtn').disabled }));
check('横切把 1 个收纳格拆成 2 个', afterCut.n === 7 && afterCut.undo, JSON.stringify(afterCut));
await mouse('#undoBtn');
check('撤销回退切分', await page.eval(() => document.querySelectorAll('#scene [data-zone]').length) === 6);
await mouse('#redoBtn');
check('重做恢复切分', await page.eval(() => document.querySelectorAll('#scene [data-zone]').length) === 7);
await mouse('#undoBtn');
await mouse('#toolbar [data-tool="select"]');

/* 7. 模板库插入到当前区域 */
await mouse('#tplBtn');
check('模板库弹窗打开', await page.eval(() => document.querySelector('#tplModal').classList.contains('show')));
await mouse('#tplGrid [data-tpl="drawer"]');
const afterTpl = await page.eval(() => ({ n: document.querySelectorAll('#scene [data-zone]').length, open: document.querySelector('#tplModal').classList.contains('show'), use: document.querySelector('.tpl-use').textContent }));
check('抽屉柜模板插入 12 格并关闭弹窗', afterTpl.n === 12 && !afterTpl.open && /当前区域/.test(afterTpl.use), JSON.stringify(afterTpl));
await mouse('#undoBtn');

/* 8. 搜索返回三级路径并跨区域定位 */
await page.eval(() => { const i = document.querySelector('#searchInput'); i.value = '香薰'; i.dispatchEvent(new Event('input', { bubbles: true })); });
const sr = await page.eval(() => ({ open: !document.querySelector('#searchResults').hidden, n: document.querySelectorAll('#searchResults [data-result]').length, sub: document.querySelector('#searchResults .sr-item') && document.querySelector('#searchResults .sr-item').textContent }));
check('搜索物品返回房间/区域/收纳格完整路径', sr.open && sr.n >= 1 && /主卧/.test(sr.sub) && /置物架墙/.test(sr.sub), JSON.stringify(sr));
await mouse('#searchResults [data-result="0"]');
const focused = await page.eval(() => ({ flash: !!document.querySelector('#scene .zone.flash'), h1: document.querySelector('h1').textContent }));
check('点击结果跨区域定位并高亮闪烁', focused.flash && /置物架墙/.test(focused.h1), JSON.stringify(focused));

/* 9. 点选物品 → 点收纳格放置 */
await page.eval(() => { const i = document.querySelector('#searchInput'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
await mouse('#spaceTree [data-room="bedroom"]');
await mouse('#spaceTree [data-area="a_tatami"]');
await mouse('#trayList [data-item]');
const armed = await page.eval(() => ({ bar: document.querySelector('#armedBar').classList.contains('show'), n: document.querySelectorAll('#trayList [data-item]').length }));
check('点选物品进入待放置状态', armed.bar && armed.n === 8, JSON.stringify(armed));
await mouse('#scene [data-zone="z_t6"] .zone-shape');
const placed = await page.eval(() => ({ tray: document.querySelectorAll('#trayList [data-item]').length, bar: document.querySelector('#armedBar').classList.contains('show'), cap: document.querySelector('.cap-meta').textContent.trim(), h1: document.querySelector('h1').textContent, crumb: document.querySelector('#crumb').textContent, toast: document.querySelector('#toastText').textContent, tool: document.querySelector('#toolbar .tool.active') && document.querySelector('#toolbar .tool.active').textContent }));
check('点击目标收纳格完成放置（三级归属写入）', placed.tray === 7 && !placed.bar, JSON.stringify(placed));
await mouse('#undoBtn');

/* 10. 图层显隐 / 锁定 */
await mouse('#layerList [data-layer="items"][data-act="visible"]');
const hidden = await page.eval(() => ({ cls: document.querySelector('#layerList .layer-row.is-hidden') !== null, texts: Array.from(document.querySelectorAll('#scene text')).some(t => t.textContent === '拖入物品') }));
check('隐藏物品图层生效', hidden.cls && !hidden.texts, JSON.stringify(hidden));
await mouse('#layerList [data-layer="items"][data-act="visible"]');
await mouse('#layerList [data-layer="notes"][data-act="lock"]');
check('图层锁定可切换', await page.eval(() => !!document.querySelector('#layerList .layer-btn.is-locked')));

/* 11. 导出菜单 & 缩放 */
await mouse('#exportBtn');
check('导出菜单包含 SVG / PNG / 三级 JSON', await page.eval(() => document.querySelectorAll('#exportMenu [data-export]').length) === 3 && /三级数据 JSON/.test(await page.eval(() => document.querySelector('#exportMenu').textContent)));
await page.eval(() => document.querySelector('#exportMenu').hidden = true);
const z0 = await page.eval(() => document.querySelector('#zoomLabel').textContent);
await mouse('#zoomIn');
const z1 = await page.eval(() => document.querySelector('#zoomLabel').textContent);
await mouse('#fitBtn');
const z2 = await page.eval(() => document.querySelector('#zoomLabel').textContent);
check('缩放 / 适应宽度可用', z0 !== z1 && z1 !== z2, [z0, z1, z2].join(' -> '));

/* 11b. 防重叠 / 尺寸微调 / 照片 / 区域快速切换 */
await mouse('#spaceTree [data-room="bedroom"]');
await mouse('#spaceTree [data-area="a_tatami"]');
const baseOv = await overlapsCount();
check('初始收纳格零重叠', baseOv.n === 6 && baseOv.bad === 0, JSON.stringify(baseOv));
await mouse('#toolbar [data-tool="rect"]');
const rr = await page.eval(() => { const e = document.querySelector('#scene [data-zone="z_t1"] .zone-shape'); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
await drag(rr.x + 28, rr.y + 28, rr.x + rr.w * .62, rr.y + rr.h * .62);
const carved = await overlapsCount();
check('在已有格子上绘制 = 切开原格，零重叠', carved.n > 6 && carved.bad === 0, JSON.stringify(carved));
await mouse('#undoBtn');
await mouse('#toolbar [data-tool="select"]');
check('选中格提供右下角尺寸手柄', await page.eval(() => document.querySelectorAll('#scene [data-handle="resize"]').length) === 1);
const t1 = await page.eval(() => { const e = document.querySelector('#scene [data-zone="z_t1"] .zone-shape'); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
await drag(t1.x, t1.y, t1.x + 260, t1.y);
check('拖动收纳格贴边停靠、零重叠', (await overlapsCount()).bad === 0, JSON.stringify(await overlapsCount()));
await mouse('#undoBtn');
await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await new Promise(r => setTimeout(r, 180));
check('方向键微调仍保持零重叠', (await overlapsCount()).bad === 0);
await mouse('#crumb [data-crumb-area]');
const am = await page.eval(() => ({ open: !document.querySelector('#areaMenu').hidden, n: document.querySelectorAll('#areaMenu [data-goto-area]').length }));
check('面包屑区域下拉可快速切换', am.open && am.n === 4, JSON.stringify(am));
await mouse('#areaMenu [data-goto-area="a_wardrobe"]');
check('下拉切换区域生效', /衣柜/.test(await page.eval(() => document.querySelector('h1').textContent)));
await mouse('#spaceTree [data-area="a_tatami"]');
await mouse('#trayList [data-item-info]');
const im = await page.eval(() => ({ open: document.querySelector('#itemModal').classList.contains('show'), title: document.querySelector('#itemTitle').textContent, upload: !!document.querySelector('[data-photo="upload"]') }));
check('物品详情弹窗含照片上传入口', im.open && im.upload, JSON.stringify(im));
await page.screenshot({ path: resolve(root, '.build/shots/item-modal.jpg') });
await page.eval(() => {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const f = new File([bytes], 't.png', { type: 'image/png' });
  const dt = new DataTransfer(); dt.items.add(f);
  const input = document.querySelector('#photoInput');
  Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 700));
const photo = await page.eval(() => ({
  modal: !!document.querySelector('#itemBody .item-photo img[src^="data:image"]'),
  tray: !!document.querySelector('#trayList img.ph[src^="data:image"]'),
  toast: document.querySelector('#toastText').textContent
}));
check('上传照片后弹窗与托盘同步显示缩略图', photo.modal && photo.tray, JSON.stringify(photo));
await page.screenshot({ path: resolve(root, '.build/shots/item-modal-photo.jpg') });
await mouse('#itemClose');
for (const k of ['svg', 'png', 'json']) {
  await mouse('#exportBtn');
  await mouse('#exportMenu [data-export="' + k + '"]');
  await new Promise(r => setTimeout(r, 300));
}
check('带照片的三种导出均无异常', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));

/* 12. 三档截图与响应式 */
await page.screenshot({ path: resolve(root, '.build/shots/desktop.jpg') });
await page.setViewport({ width: 768, height: 1024 });
await new Promise(r => setTimeout(r, 350));
await page.screenshot({ path: resolve(root, '.build/shots/tablet.jpg') });
const tab = await page.eval(() => ({ right: getComputedStyle(document.querySelector('#rightPanel')).position, collapsed: document.querySelector('#rightPanel').getBoundingClientRect().left >= window.innerWidth - 5 }));
check('平板右栏折叠为抽屉', tab.right === 'fixed' && tab.collapsed, JSON.stringify(tab));
await mouse('#detailBtn');
check('平板「详情」可展开右栏', await page.eval(() => document.querySelector('#rightPanel').classList.contains('open')));
await mouse('#drawerScrim');

await page.setViewport({ width: 390, height: 844, mobile: true });
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: resolve(root, '.build/shots/mobile.jpg') });
await mouse('#trayList [data-item-info]');
await page.screenshot({ path: resolve(root, '.build/shots/mobile-item-modal.jpg') });
const mmCol = await page.eval(() => getComputedStyle(document.querySelector('#itemBody')).gridTemplateColumns.split(' ').length);
check('手机物品详情弹窗为单列布局', mmCol === 1, 'columns=' + mmCol);
await mouse('#itemClose');
const mob = await page.eval(() => ({
  nav: getComputedStyle(document.querySelector('.mobile-nav')).display,
  toolH: document.querySelector('#toolbar .tool').getBoundingClientRect().height,
  leftHidden: document.querySelector('#leftPanel').getBoundingClientRect().right <= 2,
  trayFixed: getComputedStyle(document.querySelector('.tray')).position,
  crumb: document.querySelector('#crumb').textContent,
  selBar: getComputedStyle(document.querySelector('#mobileSelBar')).display,
  selBtnH: document.querySelector('#mobileSelBar button').getBoundingClientRect().height,
  selText: document.querySelector('#msName').textContent
}));
check('手机底部导航 / 44px 工具 / 隐藏侧栏 / 固定托盘 / 三级面包屑', mob.nav === 'flex' && mob.toolH >= 44 && mob.leftHidden && mob.trayFixed === 'fixed' && /收纳格/.test(mob.crumb), JSON.stringify(mob));
check('手机选中快捷条显示当前格信息且按钮易点', mob.selBar === 'flex' && mob.selBtnH >= 38 && mob.selText.length > 0, JSON.stringify({ display: mob.selBar, h: mob.selBtnH, text: mob.selText }));
await mouse('.mobile-nav [data-drawer="left"]');
const drawer = await page.eval(() => ({ open: document.querySelector('#leftPanel').classList.contains('open'), lvl: document.querySelectorAll('#leftPanel .tree-row.lvl3').length }));
check('手机「空间」抽屉滑出并显示三级树', drawer.open && drawer.lvl >= 1, JSON.stringify(drawer));
await page.screenshot({ path: resolve(root, '.build/shots/mobile-drawer.jpg') });
await mouse('.drawer-close');

await page.setViewport({ width: 1440, height: 900, mobile: false });
await new Promise(r => setTimeout(r, 250));
await mouse('#themeToggle');
await new Promise(r => setTimeout(r, 250));
await page.screenshot({ path: resolve(root, '.build/shots/dark.jpg') });

check('无运行时 JS 异常', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));

console.log('\n==== SMOKE TEST v2 ====');
results.forEach(r => console.log(r[0].padEnd(5), r[1], r[2] ? '· ' + r[2] : ''));
const fails = results.filter(r => r[0] === 'FAIL');
console.log('\n' + (results.length - fails.length) + '/' + results.length + ' passed');
await browser.close();
process.exit(fails.length ? 1 : 0);
