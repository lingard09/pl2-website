/* CMS 이미지 ↔ 영상 교체 검사 (2026-11-19)
 *
 * 바꿀 수 있는 자리 후보(tools/cms.py swap_ok)를 PC(1440)·모바일(390) 화면에서 실제로 바꿔 보고,
 * 크기·위치·페이지 높이·보이는 모양(object-fit, 모서리 등)이 달라지는 자리, 높이를 파일 비율에 맞출 수 없는 자리,
 * 크기 단계를 줄 수 없는 자리(옆에 다른 그림·글이 있는 칸)를 tools/cms-slots.json 에 적는다.
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

const bad = { swap: {}, fit: {}, scale: {} };
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
    const res = await pg.evaluate(async ({ cands, IMG_ONLY, VIDEO_ONLY, PROPS, wide }) => {
      const sizeOf = (src) => new Promise((r) => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.onerror = () => r([0, 0]); im.src = src; });
      const tick = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));
      const docH = () => document.documentElement.scrollHeight;
      const rect = (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y + scrollY, r.width, r.height]; };
      const near = (a, b, t = 1.5) => a.every((v, i) => Math.abs(v - b[i]) <= t);
      const others = (el, media) => [...document.querySelectorAll('[data-cms]')].filter((o) => o !== el && !o.contains(el) && !el.contains(o)
        && (!media || /^(IMG|VIDEO)$/.test(o.tagName) || o.hasAttribute('data-vimeo')) && o.getClientRects().length && o.getBoundingClientRect().width > 4);
      const overlaps = (el) => {
        const r = el.getBoundingClientRect();
        return new Set(others(el, false).filter((o) => { const q = o.getBoundingClientRect(); return q.left < r.right - 2 && q.right > r.left + 2 && q.top < r.bottom - 2 && q.bottom > r.top + 2; }).map((o) => o.getAttribute('data-cms')));
      };
      const clipped = (el) => {
        const r = el.getBoundingClientRect();
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
            const q = p.getBoundingClientRect();
            if (r.bottom > q.bottom + 2 || r.top < q.top - 2) return true;
          }
        }
        return false;
      };
      const out = {};
      for (const id of cands) {
        const el = document.querySelector(`[data-cms="${id}"]`);
        if (!el) continue;
        const o = (out[id] = {});
        const pic = el.parentElement && el.parentElement.tagName === 'PICTURE' ? el.parentElement : null;
        // ── 1) 이미지 ↔ 영상 ──
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
        if (!nw || !nh) { o.swap = o.fit = o.scale = 'no-size'; continue; }
        const snap = (e) => { const cs = getComputedStyle(e); return { r: rect(e), css: PROPS.map((k) => cs.getPropertyValue(k)), h: docH() }; };
        const kids = pic ? [...pic.childNodes] : null;
        const put = () => { if (pic) { pic.replaceChildren(rep); } else el.replaceWith(rep); };
        const back = () => { if (pic) { pic.replaceChildren(...kids); } else rep.replaceWith(el); };
        const a = snap(el);
        put();
        if (rep.tagName === 'IMG' && !rep.complete) await new Promise((r) => { rep.onload = rep.onerror = r; });
        await tick();
        back(); const a2 = snap(el); put();
        const c = snap(rep);
        back();
        if (!near(a2.r, a.r)) { a.r = a2.r; a.h = a2.h; } // 기다리는 사이 움직인(모션) 만큼은 빼고
        const d = [];
        if (!near(a.r, c.r)) d.push('rect ' + a.r.map(Math.round) + ' → ' + c.r.map(Math.round));
        if (Math.abs(a.h - c.h) > 2) d.push('page ' + a.h + ' → ' + c.h);
        PROPS.forEach((k, i) => { if (a.css[i] !== c.css[i]) d.push(k + ' ' + a.css[i] + ' → ' + c.css[i]); });
        if (d.length) o.swap = d.join('; ');
        // ── 2) 높이를 파일 비율에 맞춤: 1:1, 4:1 로 바꿔 보고 폭 그대로·높이 = 폭÷비율·안 잘림·새로 겹치는 것 없음 ──
        const r0 = rect(el), ov0 = overlaps(el);
        for (const [rw, rh] of [[1, 1], [4, 1]]) {
          el.setAttribute('data-cms-fit', '');
          el.style.setProperty('--cms-ar', rw + ' / ' + rh);
          el.style.setProperty('--cms-ar-mo', rw + ' / ' + rh);
          const r1 = rect(el);
          const fd = [];
          if (Math.abs(r1[2] - r0[2]) > 2) fd.push('width ' + Math.round(r0[2]) + ' → ' + Math.round(r1[2]));
          if (Math.abs(r1[3] - r1[2] * rh / rw) > 2) fd.push(`height ${Math.round(r1[3])} ≠ ${Math.round(r1[2] * rh / rw)} (${rw}:${rh})`);
          if (clipped(el)) fd.push('clipped');
          const nov = [...overlaps(el)].filter((x) => !ov0.has(x));
          if (nov.length) fd.push('overlaps ' + nov.slice(0, 3).join(','));
          el.removeAttribute('data-cms-fit'); el.style.removeProperty('--cms-ar'); el.style.removeProperty('--cms-ar-mo');
          if (fd.length) { o.fit = fd.join('; '); break; }
        }
        // ── 3) 크기 단계: PC 에서 한 줄을 혼자 차지하고(옆에 다른 그림·글이 없고), scale 이 먹는 자리 ──
        if (wide) {
          const r = el.getBoundingClientRect();
          const side = others(el, false).filter((x) => { const q = x.getBoundingClientRect(); return Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top) > 10 && (q.right <= r.left + 2 || q.left >= r.right - 2); });
          if (side.length) o.scale = 'side by side with ' + side.slice(0, 3).map((x) => x.getAttribute('data-cms')).join(',');
          else {
            el.style.scale = '80%';
            const w8 = el.getBoundingClientRect().width;
            el.style.scale = '';
            if (Math.abs(w8 - r.width * 0.8) > 2) o.scale = 'scale has no effect (' + Math.round(w8) + ')';
          }
        }
      }
      return out;
    }, { cands, IMG_ONLY, VIDEO_ONLY, PROPS, wide: w > 600 });
    for (const [id, o] of Object.entries(res)) {
      for (const k of ['swap', 'fit', 'scale']) if (o[k]) bad[k][id] = (bad[k][id] ? bad[k][id] + ' | ' : '') + w + ': ' + o[k];
    }
    await pg.close();
  }
  process.stdout.write('.');
}
await b.close();
const all = Object.keys(index.ids).filter((id) => index.ids[id].swap);
const out = { note: 'tools/cms-swap-check.mjs 가 만든다. noswap: 이미지↔영상으로 바꾸면 모양이 달라지는 자리, nofit: 높이를 파일 비율에 맞출 수 없는 자리, noscale: 크기 단계를 줄 수 없는 자리' };
for (const k of ['swap', 'fit', 'scale']) out['no' + k] = Object.keys(bad[k]).sort();
out.why = bad;
fs.writeFileSync('tools/cms-slots.json', JSON.stringify(out, null, 1) + '\n');
console.log(`\n후보 ${all.length}개 — 바꾸기 불가 ${out.noswap.length} · 높이 맞춤 불가 ${out.nofit.length} · 크기 단계 불가 ${out.noscale.length} → tools/cms-slots.json`);
