/* 공간 모션 (시범: About) — 스크롤·모션 개선 문의 (2026-10-27)
   참고: healthapp.google, myhealthprac.com
   <html data-motion="space"> 이고 motion.js 가 html.sp-on 을 붙였을 때만 돈다
   (데스크톱 마우스·트랙패드, 폭 1024 이상, 동작 줄이기 꺼짐). 그 밖에는 기존 등장 모션.

   1) 관성 스크롤 — Lenis. 휠을 굴리면 미끄러지듯 따라오다 감속하며 멈춘다.
   2) 스크롤 연동 등장 — 요소가 화면 아래에서 출발해 스크롤에 맞춰 올라오고, 정해진 지점에서
      감속하며 제자리에 안착한다. 요소마다 이동 거리(travel)와 따라붙는 속도(lag)를 달리 줘서
      같은 줄의 이미지·텍스트가 약간씩 시간차를 두고 움직인다. 투명도 변화는 최소로 둔다.
   3) 깊이감 — 이미지·영상은 틀 안에서 살짝 확대된 채 스크롤보다 느리게 움직이고(패럴랙스),
      히어로는 스크롤보다 느리게 내려가 아래 콘텐츠가 그 위를 덮고 지나간다.
   4) 부드러운 스냅 — data-snap 구간 근처에서 스크롤이 멈추면 그 구간이 화면 가운데 오도록
      감속하며 이동한다. 멀리 있으면 건드리지 않는다.
   5) 영상 구간 고정 — data-pin 구간에 들어오면 화면 가운데 고정된 채 영상이 처음부터 재생되고,
      정해진 스크롤 거리(화면 높이의 배수)를 지나면 풀린다. 스크롤을 막지는 않는다. */
(function () {
  var root = document.documentElement;
  if (!root.classList.contains("sp-on") || !window.Lenis) return;

  // ── 1) 관성 스크롤 ───────────────────────────────────
  var lenis = new window.Lenis({
    lerp: 0.085, // 작을수록 더 미끄러진다 (기본 0.1)
    wheelMultiplier: 0.9,
    smoothWheel: true,
  });
  window.PL2Space = { lenis: lenis };

  function raf(t) {
    lenis.raf(t);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var unit = Math.min(vw / 1920, 1); // 피그마 1px (1920 기준)

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function easeOutCubic(p) {
    return 1 - Math.pow(1 - p, 3);
  }
  // 문서 기준 top (적용 중인 이동량과 상관없는 원래 자리)
  function docTop(el) {
    var y = 0;
    while (el) {
      y += el.offsetTop;
      el = el.offsetParent;
    }
    return y;
  }

  // ── 5) 영상 구간 고정 (먼저 높이를 바꿔야 아래 요소 위치 계산이 맞는다) ──
  var pins = Array.prototype.map.call(document.querySelectorAll("[data-pin]"), function (sec) {
    var media = sec.querySelector("video, img");
    var extra = parseFloat(sec.getAttribute("data-pin")) || 1; // 화면 높이의 배수
    sec.classList.add("sp-pin");
    sec.style.setProperty("--sp-pin-extra", extra * 100 + "vh");
    return { sec: sec, media: media, active: false };
  });

  // ── 2) 3) 움직일 요소 등록 ──────────────────────────
  // travel: 출발 거리(px, 1920 기준) / lag: 따라붙는 비율(작을수록 늦게 감속하며 붙는다)
  // depth: 안착 뒤에도 남는 패럴랙스 세기 (화면 가운데에서 멀어질수록 이만큼 비켜 간다)
  var items = [];
  function add(el, travel, lag, depth, onEnter) {
    if (!el) return;
    el.classList.add("sp-item");
    items.push({
      el: el,
      travel: travel * unit,
      lag: lag,
      depth: depth || 0,
      y: travel * unit,
      top: 0,
      h: 0,
      entered: false,
      onEnter: onEnter,
    });
  }
  function all(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  }

  // 이미지·영상은 틀(overflow: hidden)로 감싸 안쪽에서만 확대·패럴랙스가 일어나게 한다
  var frames = [];
  all(".ab-service-media").forEach(function (media) {
    var frame = document.createElement("div");
    frame.className = "sp-frame " + media.className.replace("ab-service-media", "").trim();
    media.parentNode.insertBefore(frame, media);
    frame.appendChild(media);
    media.classList.add("sp-frame-media");
    frames.push({ frame: frame, media: media });
  });

  add(document.querySelector(".ab-intro p"), 140, 0.09, 0);
  all(".ab-stat").forEach(function (el, i) {
    // 왼쪽부터 조금씩 더 멀리서, 더 늦게 붙는다
    add(el, 160 + i * 50, 0.1 - i * 0.012, 0, function () {
      if (window.PL2Motion) window.PL2Motion.startCounters(el, i * 120);
    });
  });
  add(document.querySelector(".ab-lead-title"), 120, 0.1, 0);
  all(".ab-lead-cols p").forEach(function (el, i) {
    add(el, 180 + i * 60, 0.09 - i * 0.012, 0);
  });
  frames.forEach(function (f) {
    add(f.frame, 200, 0.075, 0);
  });
  all(".ab-service-body").forEach(function (el) {
    // 텍스트는 이미지보다 더 멀리서 출발해 한 박자 늦게 붙는다
    add(el, 260, 0.06, -0.04);
  });
  all(".ab-brands-row").forEach(function (el, i) {
    add(el, 120 + i * 60, 0.09 - i * 0.015, 0);
  });
  all(".ft-hero, .ft-bar").forEach(function (el, i) {
    add(el, 140 + i * 40, 0.09, 0);
  });

  var hero = document.querySelector(".ab-hero-media");

  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    unit = Math.min(vw / 1920, 1);
    // 고정 구간 높이를 먼저 정해야 그 아래 요소들의 위치가 맞는다
    pins.forEach(function (p) {
      if (p.media) p.sec.style.setProperty("--sp-pin-h", p.media.offsetHeight + "px");
      p.top = docTop(p.sec);
      p.h = p.sec.offsetHeight;
    });
    items.forEach(function (it) {
      it.top = docTop(it.el);
      it.h = it.el.offsetHeight;
    });
    frames.forEach(function (f) {
      f.top = docTop(f.frame);
      f.h = f.frame.offsetHeight;
    });
  }

  // 출발 지점: 요소 윗변이 화면 아래끝 / 안착 지점: 윗변이 화면 아래에서 SETTLE 만큼 올라왔을 때
  var SETTLE = 0.55;

  function update() {
    var sy = lenis.scroll;
    items.forEach(function (it) {
      var top = it.top - sy; // 이동 전 원래 화면 위치
      if (top > vh * 1.4 || top + it.h < -vh * 0.4) return; // 멀리 있으면 계산 생략
      var p = clamp((vh - top) / (vh * SETTLE), 0, 1);
      var target = it.travel * (1 - easeOutCubic(p));
      if (it.depth) target += (top + it.h / 2 - vh / 2) * it.depth;
      it.y += (target - it.y) * it.lag * 2; // 프레임마다 목표로 다가간다 (감속 안착)
      if (Math.abs(target - it.y) < 0.05) it.y = target;
      // 투명도는 출발 직후 잠깐만 (화면 아래 끝에서 툭 생기지 않게)
      var o = clamp(p * 4, 0, 1);
      it.el.style.transform = "translate3d(0," + it.y.toFixed(2) + "px,0)";
      it.el.style.opacity = o < 1 ? o.toFixed(3) : "";
      if (!it.entered && p > 0.25) {
        it.entered = true;
        if (it.onEnter) it.onEnter();
      } else if (it.entered && top > vh) {
        it.entered = false; // 화면 아래로 다시 나가면 다음에 또 센다
      }
    });

    // 틀 안 이미지: 1.12 배로 시작해 안착하며 1.04 로 줄고, 스크롤보다 느리게 움직인다
    frames.forEach(function (f) {
      var top = f.top - sy;
      if (top > vh * 1.2 || top + f.h < -vh * 0.2) return;
      var center = top + f.h / 2 - vh / 2; // 화면 가운데와의 거리
      var p = clamp((vh - top) / (vh * 0.9), 0, 1);
      var scale = 1.12 - 0.08 * easeOutCubic(p);
      var shift = clamp(-center * 0.08, -f.h * 0.035, f.h * 0.035);
      f.media.style.transform =
        "translate3d(0," + shift.toFixed(2) + "px,0) scale(" + scale.toFixed(4) + ")";
    });

    // 히어로: 스크롤의 40% 속도로만 내려가 인트로가 그 위를 덮고 올라온다
    if (hero && sy < vh * 1.2) {
      hero.style.transform = "translate3d(0," + (sy * 0.4).toFixed(2) + "px,0) scale(" + (1 + sy * 0.00008).toFixed(4) + ")";
    }

    // 고정 구간: 들어오는 순간 영상을 처음부터 재생
    pins.forEach(function (p) {
      var top = p.top - sy;
      var inside = top < vh * 0.5 && top + p.h > vh * 0.5;
      if (inside && !p.active && p.media && p.media.play) {
        p.media.currentTime = 0;
        var pr = p.media.play();
        if (pr && pr.catch) pr.catch(function () {});
      }
      p.active = inside;
    });
  }

  // ── 4) 부드러운 스냅 ─────────────────────────────────
  var snaps = all("[data-snap]");
  var snapTimer = null;
  var snapping = false;
  var SNAP_RANGE = 0.28; // 가운데에서 화면 높이의 28% 안쪽일 때만 끌어당긴다

  function trySnap() {
    if (snapping) return;
    var sy = lenis.scroll;
    var best = null;
    snaps.forEach(function (el) {
      var top = docTop(el);
      var h = el.offsetHeight;
      // 화면보다 크면 윗변을 맞추고, 아니면 가운데를 맞춘다
      var dest = h >= vh ? top : top - (vh - h) / 2;
      var d = dest - sy;
      if (Math.abs(d) < vh * SNAP_RANGE && (!best || Math.abs(d) < Math.abs(best.d))) {
        best = { dest: dest, d: d };
      }
    });
    if (!best || Math.abs(best.d) < 4) return;
    snapping = true;
    lenis.scrollTo(best.dest, {
      duration: 0.9,
      easing: function (t) {
        return 1 - Math.pow(1 - t, 4);
      },
      onComplete: function () {
        snapping = false;
      },
    });
    // 사용자가 다시 스크롤하면 Lenis 가 이어받는다. 잠금은 시간으로도 푼다
    setTimeout(function () {
      snapping = false;
    }, 1100);
  }

  lenis.on("scroll", function (e) {
    clearTimeout(snapTimer);
    // 거의 멈췄을 때만 스냅을 검사한다 (관성이 남아 있으면 기다린다)
    if (!snapping && Math.abs(e.velocity) < 0.6) snapTimer = setTimeout(trySnap, 140);
  });

  measure();
  update();
  // 스크롤이 없어도 lag 보간이 끝까지 가도록 계속 돌린다 (가벼운 계산만 한다)
  (function loop() {
    update();
    requestAnimationFrame(loop);
  })();

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      measure();
      lenis.resize();
    }, 150);
  });
  // 폰트·이미지가 늦게 들어오면 높이가 바뀌므로 다시 잰다
  window.addEventListener("load", function () {
    measure();
    lenis.resize();
  });
})();
