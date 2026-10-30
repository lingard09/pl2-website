// 공유 미리보기(OG) 이미지 만들기 (2026-10-30)
//   node tools/og-image.mjs <출력.jpg> <배경 이미지> "<브랜드>" "<제목 1줄>|<제목 2줄>"
// 예) node tools/og-image.mjs assets/og/og-works-08.jpg bg.png "Samsung" "SmartThings|2D Motion Project"
//
// 1200x630, 기존 assets/og/*.jpg 와 같은 구성:
//   왼쪽 위 노란 "PL2 Creative Studio" 배지 / 왼쪽 아래 브랜드 + 두 줄 제목 (Tannakone, 흰색)
//   배경은 cover 로 채우고 상세 히어로와 같은 왼쪽 딤(검정 → 가운데에서 투명)을 얹는다.
// Playwright 가 필요하다 (PLAYWRIGHT_PATH 로 모듈 위치를 바꿀 수 있다).
import { readFileSync } from "node:fs";
import { resolve, extname } from "node:path";

const [out, bg, brand, title] = process.argv.slice(2);
if (!out || !bg || !brand || !title) {
  console.error('사용법: node tools/og-image.mjs <출력.jpg> <배경> "<브랜드>" "<1줄>|<2줄>"');
  process.exit(1);
}
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || "playwright");

const root = resolve(new URL("..", import.meta.url).pathname);
const font = (f) => "data:font/woff2;base64," + readFileSync(`${root}/fonts/${f}`).toString("base64");
const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const bgData = `data:${mime[extname(bg).toLowerCase()] || "image/png"};base64,` + readFileSync(bg).toString("base64");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const html = `<!doctype html><html><head><style>
@font-face { font-family: T; src: url(${font("Tannakone-MediumCondensed.woff2")}); font-weight: 500; }
@font-face { font-family: T; src: url(${font("Tannakone-RegularCondensed.woff2")}); font-weight: 400; }
html, body { margin: 0; }
.og { position: relative; width: 1200px; height: 630px; overflow: hidden; font-family: T; color: #fff;
  background: #000 url(${bgData}) center / cover no-repeat; }
.og::before { content: ""; position: absolute; inset: 0;
  background: linear-gradient(to right, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 60%),
              linear-gradient(to top, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 55%); }
.badge { position: absolute; left: 56px; top: 48px; padding: 0 16px; height: 52px; line-height: 54px;
  border-radius: 8px; background: #ffe100; color: #000; font-size: 27px; font-weight: 500; }
.text { position: absolute; left: 56px; bottom: 44px; }
.brand { font-size: 28px; font-weight: 400; margin-bottom: 16px; }
.title { font-size: 80px; line-height: 84px; font-weight: 500; }
</style></head><body><div class="og">
<div class="badge">PL2 Creative Studio</div>
<div class="text"><div class="brand">${esc(brand)}</div><div class="title">${title.split("|").map(esc).join("<br>")}</div></div>
</div></body></html>`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html);
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: out, type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await b.close();
console.log("OG:", out);
