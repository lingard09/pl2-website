/* pl2-website 회귀 검증 스크립트
 *
 * 쓰는 법:
 *   python3 -m http.server 8765 &          # 프로젝트 루트에서
 *   node tools/verify.mjs                  # 전체
 *   node tools/verify.mjs works-detail-04  # 한 페이지만
 *
 * 확인 항목
 *   1) 페이지 높이가 피그마 값과 같은가 (가장 중요한 회귀 지표)
 *   2) 404 (없어야 정상 — 아직 안 받은 mp4 5개는 예외로 처리)
 *   3) JS 에러
 *   4) 폰트가 실제로 로드됐는가 (Tannakone / DM Mono)
 *   5) <video> 가 재생되는가 (화면에 띄운 채 currentTime 이 흐르는지)
 *   6) 히어로 제목이 2줄인가 (883px 박스를 넘지 않는가)
 *
 * playwright 경로는 npx 캐시를 쓴다. 없으면 PLAYWRIGHT 환경변수로 넘겨라.
 *   PLAYWRIGHT=/path/to/playwright/index.mjs node tools/verify.mjs
 */
const PW =
  process.env.PLAYWRIGHT ||
  '/Users/jin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const BASE = process.env.BASE || 'http://localhost:8765';

// 피그마 프레임 높이 (NOTES.md "페이지 목록" 과 같은 값)
const PAGES = {
  'index.html': 1080,
  'works.html': 5242,
  'about.html': 8112,
  'contact.html': null, // 100dvh 라 뷰포트에 따라 달라진다
  'works-detail-01.html': 14181,
  'works-detail-02.html': 11885,
  'works-detail-03.html': 12805,
  'works-detail-04.html': 10363,
  'works-detail-05.html': 14553,
  'works-detail-06.html': 17438,
  'works-detail-07.html': 17477,
  'works-detail-08.html': 12134,
  'works-detail-09.html': 18500,
  'works-detail-10.html': 14222,
};

// 아직 원본을 못 받은 영상 — 404 가 나도 정상이다 (NOTES "남은 것" 참고)
const MISSING_OK = new Set([
  'wd5-hero.mp4',
  'wd7-hero.mp4',
  'wd7-band.mp4',
  'wd8-intro.mp4',
  'wd8-video.mp4',
  'wd9-hero.mp4',
]);

const only = process.argv[2];
const targets = Object.entries(PAGES).filter(
  ([name]) => !only || name.startsWith(only),
);

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
let fail = 0;

for (const [name, wantHeight] of targets) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const notFound = [];
  const jsErrors = [];
  page.on('response', (r) => {
    if (r.status() >= 400) notFound.push(r.url().split('/').pop());
  });
  page.on('pageerror', (e) => jsErrors.push(e.message));

  await page.goto(`${BASE}/${name}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const info = await page.evaluate(() => {
    const fonts = [...document.fonts]
      .filter((f) => f.status === 'error')
      .map((f) => `${f.family} ${f.weight}`);
    const h1 = document.querySelector('.wd-hero-h1');
    const box = h1 && h1.getBoundingClientRect();
    return {
      height: Math.round(document.body.scrollHeight),
      fontErrors: fonts,
      heroLines: h1 ? Math.round(box.height / 100) : null,
      heroWidth: h1 ? Math.round(box.width) : null,
      videoCount: document.querySelectorAll('video').length,
    };
  });

  // 영상은 화면에 띄운 채로 재생 여부를 본다 (크롬은 화면 밖 영상을 멈춘다)
  const videos = [];
  for (let i = 0; i < info.videoCount; i++) {
    videos.push(
      await page.evaluate(async (i) => {
        const v = document.querySelectorAll('video')[i];
        v.scrollIntoView({ block: 'center' });
        await new Promise((r) => setTimeout(r, 500));
        const t0 = v.currentTime;
        await new Promise((r) => setTimeout(r, 900));
        return {
          src: (v.currentSrc || '').split('/').pop() || 'MISSING',
          playing: !v.paused || v.currentTime !== t0,
        };
      }, i),
    );
  }

  const problems = [];
  if (wantHeight !== null && info.height !== wantHeight)
    problems.push(`높이 ${info.height} (기대 ${wantHeight})`);
  const realNotFound = notFound.filter((f) => !MISSING_OK.has(f));
  if (realNotFound.length) problems.push(`404 ${realNotFound.join(',')}`);
  if (jsErrors.length) problems.push(`JS ${jsErrors[0]}`);
  if (info.fontErrors.length) problems.push(`폰트로드실패 ${info.fontErrors.join(',')}`);
  if (info.heroLines !== null && info.heroLines !== 2)
    problems.push(`히어로 제목 ${info.heroLines}줄`);
  if (info.heroWidth !== null && info.heroWidth > 883)
    problems.push(`히어로 제목 폭 ${info.heroWidth} > 883`);
  const stopped = videos.filter(
    (v) => !v.playing && !MISSING_OK.has(v.src) && v.src !== 'MISSING',
  );
  if (stopped.length) problems.push(`영상 멈춤 ${stopped.map((v) => v.src).join(',')}`);

  if (problems.length) fail++;
  const mark = problems.length ? '✗' : '✓';
  const skipped = notFound.filter((f) => MISSING_OK.has(f));
  console.log(
    `${mark} ${name.padEnd(22)} 높이 ${String(info.height).padStart(6)}` +
      `  영상 ${info.videoCount}개` +
      (skipped.length ? `  (미보유 ${skipped.length}개 제외)` : '') +
      (problems.length ? `\n    → ${problems.join(' / ')}` : ''),
  );
  await page.close();
}

await browser.close();
console.log(fail ? `\n${fail}개 페이지에 문제가 있다.` : '\n전부 통과 ✓');
process.exit(fail ? 1 : 0);
