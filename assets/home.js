/* 홈 분야 실린더 (수정사항_11.06)
   디자인: 피그마 Home_PC (3826:23005) / Home_MO (3830:28892) — 이 배치가 "멈춰 있을 때" 모습이다.
   움직임: 피그마 코드 레이어 "3D 실린더 스크롤" (3782:25781) 을 옮겼다.
   - 휠·트랙패드를 굴린 만큼 목표 위치가 움직이고, 원통이 그 목표를 부드럽게 따라간다(매 프레임 8%).
     손을 떼고 0.15초가 지나면 굴리던 방향의 가장 가까운 행에 맞춰 멈춘다. 끌기(마우스·터치)와 키보드도 된다.
   - 가운데 행이 가장 크고 바깥으로 갈수록 작아진다 (PC 단어 150 → 90, 썸네일 높이 120 → 80).
   - 행은 가로축 둘레 원통 위에 있어서 위아래로 갈수록 뒤로 눕는다 (rotateX + 깊이).
     원근 때문에 생기는 축소·쏠림은 거꾸로 보정해서, 멈췄을 때 위치·크기는 피그마 프레임과 같다.
   - 끝이 없다 (14개가 원통 둘레를 돈다). 화면 전체가 Works 링크인 것은 그대로다 — 끌었을 때만 이동을 막는다.
   - 동작 줄이기 설정이면 따라가는 애니메이션 없이 바로 그 자리로 간다.
   - 11.13 최종: 기존 모션은 그대로 두고, 가만히 있으면 3초마다 한 칸씩 아래에서 위로 천천히 올라와
     스크롤되는 화면임을 알게 한다. 휠·끌기·키보드를 쓰면 쉬었다가 4초 뒤 다시 돈다.
     가운데 항목에 커서를 올려 두었을 때·탭이 숨겨졌을 때·동작 줄이기 설정이면 돌지 않는다. */
(function () {
  var hero = document.querySelector(".hm-hero");
  var stage = hero && hero.querySelector(".hm-stage");
  if (!stage) return;
  var rows = Array.prototype.slice.call(stage.querySelectorAll(".hm-row"));
  var N = rows.length;
  if (!N) return;

  var reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobileMQ = window.matchMedia("(max-width: 599.98px)");

  // 행 간격 (피그마 px): 가운데에서 d 칸 떨어진 행의 중심 = PITCH*d + EXTRA*(1 - 0.25^d)
  //   PC  : 0 / 180 / 320 / 440 / 560 … (피그마 Home_PC 와 같다)
  //   모바일: 0 / 110 / 197 / 280 / 360 …  (피그마 Home_MO 0 / 110 / 200 / 280 / 360)
  // 크기: 1 + GROW * max(0, 1 - (d/2)^2) — 가운데 GROW+1 배, 한 칸 옆 0.75*GROW+1 배, 두 칸부터 1 배
  //   PC  : 1.667(단어 150/90) / 1.5(썸네일 120/80) / 1
  //   모바일: 1.5(단어 72/48) / 1.375(썸네일 ≈70/50) / 1
  var MODES = {
    pc: { pitch: 120, extra: 80, grow: 2 / 3 },
    mo: { pitch: 80, extra: 40, grow: 0.5 },
  };
  var STEP = 10; // 원통 한 칸 각도 (도)
  var FOLLOW = 0.08; // 프레임마다 목표로 다가가는 비율 (60fps 기준)
  var AUTO_FOLLOW = 0.03; // 자동으로 넘어갈 때는 더 천천히 (약 1.5초에 걸쳐 올라온다)
  var follow = FOLLOW;
  var SNAP_DELAY = 150; // 휠이 멈추고 이만큼 지나면 맞춰 멈춘다

  var mode, u, R, PER, limit;
  var items = rows.map(function (row) {
    var tile = row.querySelector(".hm-tile");
    return {
      row: row,
      tile: tile,
      cx: { pc: +row.dataset.cx || 0, mo: +row.dataset.mcx || 0 },
      w: tile ? { pc: +tile.dataset.w, mo: +tile.dataset.mw } : null,
    };
  });

  // --u (피그마 1px) 를 px 로 잰다: CSS 의 --u 식을 그대로 쓰는 1000u 짜리 자를 놓고 폭을 읽는다
  var ruler = document.createElement("div");
  ruler.style.cssText = "position:absolute;visibility:hidden;width:calc(var(--u) * 1000);height:0";
  hero.appendChild(ruler);

  function measure() {
    mode = mobileMQ.matches ? MODES.mo : MODES.pc;
    var key = mobileMQ.matches ? "mo" : "pc";
    u = ruler.offsetWidth / 1000 || 1;
    R = mode.pitch / ((STEP * Math.PI) / 180); // 원통 반지름 — 한 칸 호 길이가 행 간격과 같게
    PER = mode.pitch * 8.75; // 원근 거리 (PC 1050 — 모션 예시와 같다)
    stage.style.setProperty("--per", (PER * u).toFixed(1) + "px");
    // 화면 밖(가장자리 너머 한 칸)이면 그리지 않는다
    limit = window.innerHeight / 2 / u + mode.pitch * 1.5;
    items.forEach(function (it) {
      it.x = it.cx[key];
      if (it.tile) it.tile.style.setProperty("--w", it.w[key]);
    });
  }

  function mod(v, n) {
    return ((v % n) + n) % n;
  }

  // 지금 위치에서 행 i 가 몇 칸 떨어져 있는지 (원통이라 가까운 쪽으로)
  function offsetOf(i, p) {
    var o = i - mod(p, N);
    if (o > N / 2) o -= N;
    if (o < -N / 2) o += N;
    return o;
  }

  function paint(p) {
    items.forEach(function (it, i) {
      var o = offsetOf(i, p);
      var d = Math.abs(o);
      var yT = (o < 0 ? -1 : 1) * (mode.pitch * d + mode.extra * (1 - Math.pow(0.25, d)));
      if (Math.abs(yT) > limit) {
        it.row.style.visibility = "hidden";
        return;
      }
      it.row.style.visibility = "";
      var s = 1 + mode.grow * Math.max(0, 1 - (d / 2) * (d / 2));
      var a = o * STEP;
      var z = (Math.cos((a * Math.PI) / 180) - 1) * R; // 원통 둘레를 따라 뒤로 물러난다
      var k = (PER - z) / PER; // 원근 보정: 뒤로 간 만큼 작아지고 가운데로 쏠리는 것을 되돌린다
      it.scale = s * k;
      it.row.style.zIndex = String(100 - Math.round(d * 10));
      it.row.style.transform =
        "translate(-50%,-50%) translate3d(" +
        (it.x * u).toFixed(2) + "px," +
        (yT * k * u).toFixed(2) + "px," +
        (z * u).toFixed(2) + "px) rotateX(" +
        (-a).toFixed(3) + "deg) scale(" +
        (s * k).toFixed(4) + ")";
    });
  }

  // ── 따라가기 ─────────────────────────────────────────
  var START = 5; // 처음에 가운데 오는 행: PHOTOGRAPHY (피그마 프레임과 같다)
  var pos = START;
  var target = START;
  var raf = null;
  var last = 0;

  function tick(now) {
    var dt = last ? Math.min(now - last, 64) : 16.7;
    last = now;
    var diff = target - pos;
    pos += diff * (1 - Math.pow(1 - follow, dt / 16.7));
    if (Math.abs(target - pos) < 0.0005) {
      pos = target;
      paint(pos);
      raf = null;
      last = 0;
      return;
    }
    paint(pos);
    raf = requestAnimationFrame(tick);
  }

  function run() {
    if (reduce) {
      pos = target;
      paint(pos);
      return;
    }
    if (raf === null) raf = requestAnimationFrame(tick);
  }

  // 굴리던 방향의 다음 칸에 맞춰 멈춘다 (살짝만 굴려도 되돌아가지 않게)
  function snap(dir) {
    if (dir > 0) target = Math.ceil(target - 0.08);
    else if (dir < 0) target = Math.floor(target + 0.08);
    else target = Math.round(target);
    run();
  }

  // ── 휠·트랙패드 ──────────────────────────────────────
  var snapTimer = null;
  var wheelDir = 0;
  window.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      var dy = Math.max(-120, Math.min(120, e.deltaY));
      if (!dy) return;
      wheelDir = dy > 0 ? 1 : -1;
      target += dy / 220;
      run();
      clearTimeout(snapTimer);
      snapTimer = setTimeout(function () {
        snap(wheelDir);
      }, SNAP_DELAY);
    },
    { passive: false }
  );

  // ── 끌기 (마우스·터치) ────────────────────────────────
  // 화면 전체가 Works 링크라, 실제로 끌었을 때만 클릭(이동)을 막는다
  var drag = null;
  var dragged = false;
  hero.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    drag = { y: e.clientY, target: target, id: e.pointerId, dir: 0 };
    dragged = false;
  });
  hero.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dy = drag.y - e.clientY;
    if (!dragged && Math.abs(dy) > 6) {
      dragged = true;
      try {
        hero.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
    if (!dragged) return;
    drag.dir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    // 행 간격 1.25 배를 끌면 한 칸
    target = drag.target + dy / (mode.pitch * 1.25 * u);
    run();
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var dir = drag.dir;
    drag = null;
    if (dragged) snap(dir);
  }
  hero.addEventListener("pointerup", endDrag);
  hero.addEventListener("pointercancel", endDrag);
  hero.addEventListener(
    "click",
    function (e) {
      if (dragged) {
        e.preventDefault();
        dragged = false;
      }
    },
    true
  );
  // 링크 위에서 끌면 브라우저가 링크 자체를 끌어가려 한다
  hero.addEventListener("dragstart", function (e) {
    e.preventDefault();
  });

  // ── 키보드 ───────────────────────────────────────────
  window.addEventListener("keydown", function (e) {
    var k = e.key;
    var dir =
      k === "ArrowDown" || k === "PageDown" ? 1 : k === "ArrowUp" || k === "PageUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    target = Math.round(target) + dir;
    run();
  });

  // ── 크기 바뀔 때 ─────────────────────────────────────
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      measure();
      paint(pos);
    }, 100);
  });
  // 폰트가 늦게 들어와도 위치는 transform 이라 다시 잴 필요는 없다

  // ── 자동으로 한 칸씩 (11.13) ─────────────────────────
  var AUTO_EVERY = 3000;
  var AUTO_FIRST = 2000;
  var AUTO_RESUME = 4000;
  var autoTimer = null;
  var autoHold = false; // 가운데 항목 호버 중
  function autoStep() {
    autoTimer = null;
    if (!reduce && !drag && !autoHold && !document.hidden) {
      follow = AUTO_FOLLOW;
      target = Math.round(target) + 1;
      run();
    }
    autoTimer = setTimeout(autoStep, AUTO_EVERY);
  }
  function autoRestart(delay) {
    if (reduce) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(autoStep, delay);
  }
  ["wheel", "pointerdown", "keydown", "touchstart"].forEach(function (type) {
    window.addEventListener(type, function () {
      follow = FOLLOW;
      autoRestart(AUTO_RESUME);
    }, { passive: true });
  });
  autoRestart(AUTO_FIRST);

  measure();
  paint(pos);

  // ── 가운데 행 호버 (수정사항_11.09, 하단 예시: React Bits Magnet · Gradient Text) ──
  // 커서 주변 100 안이면 커서 쪽으로 절반만큼 끌려가고, 벗어나면 제자리로 돌아온다.
  // 이미지는 Magnet 만, 단어는 Magnet + 그라데이션. 행의 scale 안쪽에서 움직이니 그만큼 나눈다.
  // 기준점은 끌려가지 않는 행의 위치로 잰다. 움직이는 글자를 재면 그 오차가 다음 이동에 섞여 떨린다 (수정사항_11.10).
  if (!reduce && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var PAD = 100;
    var STRENGTH = 2;
    var TAU_FOLLOW = 110; // ms, 커서를 따라갈 때
    var TAU_RELEASE = 170; // ms, 제자리로 돌아올 때
    var hot = null; // 지금 끌리고 있는 항목
    var moving = [];
    var magRaf = null;
    var magLast = 0;

    function magTick(now) {
      var dt = magLast ? Math.min(now - magLast, 64) : 16.7;
      magLast = now;
      moving = moving.filter(function (m) {
        var k = 1 - Math.exp(-dt / (m === hot ? TAU_FOLLOW : TAU_RELEASE));
        m.x += (m.tx - m.x) * k;
        m.y += (m.ty - m.y) * k;
        var done = Math.abs(m.tx - m.x) < 0.05 && Math.abs(m.ty - m.y) < 0.05;
        if (done) {
          m.x = m.tx;
          m.y = m.ty;
        }
        var s = m.it.scale || 1;
        m.el.style.translate = (m.x / s).toFixed(2) + "px " + (m.y / s).toFixed(2) + "px";
        return !done;
      });
      if (moving.length) {
        magRaf = requestAnimationFrame(magTick);
      } else {
        magRaf = null;
        magLast = 0;
      }
    }

    function magRun(m) {
      if (moving.indexOf(m) < 0) moving.push(m);
      if (magRaf === null) magRaf = requestAnimationFrame(magTick);
    }

    function release() {
      autoHold = false;
      if (!hot) return;
      var m = hot;
      hot = null;
      m.tx = 0;
      m.ty = 0;
      m.el.classList.remove("is-gradient");
      magRun(m);
    }

    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      if (drag) {
        release();
        return;
      }
      var it = items[mod(Math.round(target), N)];
      var el = it.tile || it.row.querySelector(".hm-word");
      if (!el || Math.abs(target - pos) > 0.08) {
        release();
        return;
      }
      if (hot && hot.el !== el) release();
      var r = it.row.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var inside =
        Math.abs(e.clientX - cx) < r.width / 2 + PAD &&
        Math.abs(e.clientY - cy) < r.height / 2 + PAD;
      if (!inside) {
        release();
        return;
      }
      if (!it.mag) it.mag = { el: el, it: it, x: 0, y: 0, tx: 0, ty: 0 };
      hot = it.mag;
      autoHold = true;
      hot.tx = (e.clientX - cx) / STRENGTH;
      hot.ty = (e.clientY - cy) / STRENGTH;
      if (!it.tile) el.classList.add("is-gradient");
      magRun(hot);
    });
    document.addEventListener("mouseleave", release);
    window.addEventListener("wheel", release, { passive: true });
  }
})();
