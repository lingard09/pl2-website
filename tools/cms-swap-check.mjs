/* CMS 이미지 ↔ 영상 교체 검사 (2026-11-19)
 *
 * 바꿀 수 있는 자리 후보(tools/cms.py swap_ok)를 PC(1440)·모바일(390) 화면에서 실제로 바꿔 보고,
 * 크기·위치·페이지 높이·보이는 모양(object-fit, 모서리 등)이 달라지는 자리를 tools/cms-noswap.json 에 적는다.
 * 페이지 CSS 가 img / video 태그 이름으로 모양을 잡는 자리가 여기에 걸린다.
 * CSS·html 구조를 바꾸면 다시 돌린다.
 *
 * 쓰는 법 (프로젝트 루트):
 *   SKIP_GIT_CHECK=1 ./tools/build-dist.sh
 *   CMS_NOSWAP=off python3 tools/cms.py index dist      # 후보 전부를 목록에
 *   (cd dist && python3 -m http.server 8766 &)
 *   PLAYWRIGHT=/path/to/playwright/index.mjs node tools/cms-swap-check.mjs
 */
import fs from 'fs';

const PW = process.env.PLAYWRIGHT || '/Users/jin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const BASE = process.env.BASE || 'http://127.0.0.1:8766';
const index = JSON.parse(fs.readFileSync('dist/admin/cms-index.json', 'utf8'));

const IMG_ONLY = ['src', 'alt', 'loading', 'decoding', 'draggable', 'srcset', 'sizes', 'width', 'height'];
const VIDEO_ONLY = ['poster', 'preload', 'autoplay', 'muted', 'loop', 'playsinline', 'controls', 'width', 'height'];
const PROPS = ['object-fit', 'object-position', 'border-top-left-radius', 'border-bottom-right-radius', 'filter',
  'display', 'position', 'clip-path', 'mix-blend-mode', 'box-sizing', 'max-width', 'max-height'];

const bad = {};
const b = await chromium.launch();
for (const p of index.pages) {
  const cands = Object.keys(index.ids).filter((id) => index.ids[id].swap && index.ids[id].files.includes(p.file));
  if (!cands.length) continue;
  for (const [w, h] of [[1440, 900], [390, 800]]) {
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    await pg.goto(BASE + '/' + p.route, { waitUntil: 'load' });
    // 지연 로딩 이미지까지 다 받아야 원래 크기를 안다
    await pg.evaluate(async () => {
      document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager'));
      await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
      await Promise.all([...document.querySelectorAll('video[poster]')].map((v) => new Promise((r) => {
        const im = new Image(); im.onload = im.onerror = r; im.src = v.poster;
      })));
    });
    await pg.waitForTimeout(800);
    const res = await pg.evaluate(async ({ cands, IMG_ONLY, VIDEO_ONLY, PROPS }) => {
      const sizeOf = (src) => new Promise((r) => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.onerror = () => r([0, 0]); im.src = src; });
      const out = {};
      for (const id of cands) {
        const el = document.querySelector(`[data-cms="${id}"]`);
        if (!el) continue;
        let nw, nh, rep;
        if (el.tagName === 'IMG') {
          [nw, nh] = [el.naturalWidth, el.naturalHeight];
          rep = document.createElement('video');
          for (const a of el.attributes) if (!IMG_ONLY.includes(a.name)) rep.setAttribute(a.name, a.value);
          rep.setAttribute('data-cms-swap', '');
          rep.setAttribute('poster', el.currentSrc || el.src);
          rep.muted = true; rep.preload = 'none';
        } else {
          [nw, nh] = await sizeOf(el.poster);
          rep = document.createElement('img');
          for (const a of el.attributes) if (!VIDEO_ONLY.includes(a.name)) rep.setAttribute(a.name, a.value);
          rep.setAttribute('data-cms-swap', '');
          rep.src = el.poster; rep.alt = '';
        }
        if (!nw || !nh) { out[id] = 'no-size'; continue; }
        const docH = () => document.documentElement.scrollHeight;
        const snap = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { r: [r.x, r.y, r.width, r.height], css: PROPS.map((k) => cs.getPropertyValue(k)), h: docH() }; };
        const a = snap(el);
        el.replaceWith(rep);
        // 포스터·이미지가 그려져 원래 크기가 잡힌 뒤에 잰다
        if (rep.tagName === 'IMG') { if (!rep.complete) await new Promise((r) => { rep.onload = rep.onerror = r; }); }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));
        const a2 = (() => { rep.replaceWith(el); const x = snap(el); el.replaceWith(rep); return x; })();
        const c = snap(rep);
        rep.replaceWith(el);
        // 기다리는 사이 움직인(모션) 만큼은 차이로 치지 않는다
        if (a2.r.some((v, i) => Math.abs(v - a.r[i]) > 1.5)) { a.r = a2.r; a.h = a2.h; }
        const diff = [];
        if (a.r.some((v, i) => Math.abs(v - c.r[i]) > 1.5)) diff.push('rect ' + a.r.map(Math.round) + ' → ' + c.r.map(Math.round));
        if (Math.abs(a.h - c.h) > 2) diff.push('page ' + a.h + ' → ' + c.h);
        PROPS.forEach((k, i) => { if (a.css[i] !== c.css[i]) diff.push(k + ' ' + a.css[i] + ' → ' + c.css[i]); });
        if (diff.length) out[id] = diff.join('; ');
      }
      return out;
    }, { cands, IMG_ONLY, VIDEO_ONLY, PROPS });
    for (const [id, why] of Object.entries(res)) bad[id] = (bad[id] ? bad[id] + ' | ' : '') + w + ': ' + why;
    await pg.close();
  }
  process.stdout.write('.');
}
await b.close();
const all = Object.keys(index.ids).filter((id) => index.ids[id].swap);
const ids = Object.keys(bad).sort();
fs.writeFileSync('tools/cms-noswap.json', JSON.stringify({ note: 'tools/cms-swap-check.mjs 가 만든다. 이미지↔영상으로 바꾸면 모양이 달라지는 자리', ids, why: bad }, null, 1) + '\n');
console.log(`\n후보 ${all.length}개 중 바꿀 수 없는 자리 ${ids.length}개 → tools/cms-noswap.json`);
