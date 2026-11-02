/* 홈 분야 실린더 (수정사항_11.02, 참고 tympanus.net/Tutorials/3DTextScroll · shotreel card-totem)
   - 예전의 자동으로 계속 넘어가는 슬롯 모션은 없앴다.
   - 썸네일·단어 행을 가로축(X) 둘레의 원통 위에 둘러 세운다. 스크롤(휠·터치·키보드) 한 번에
     원통이 한 칸 돌고, 가운데 온 행이 커진 채 잠시 머문 뒤 다음 스크롤에 다음 행으로 넘어간다.
   - 원통이라 끝이 없다 (무한 스크롤). 행 14개를 한 벌 더 복제해 28칸으로 둘러 촘촘하게 보이게 했다.
   - 화면 전체가 Works 링크인 것은 그대로다. 동작 줄이기 설정이면 회전 애니메이션 없이 바로 넘어간다. */
(function () {
  var stage = document.querySelector(".hm-stage");
  if (!stage) return;
  var originals = Array.prototype.slice.call(stage.querySelectorAll(".hm-row"));
  if (!originals.length) return;

  // 한 벌 더 복제해 원통 둘레를 채운다
  originals.forEach(function (row) {
    stage.appendChild(row.cloneNode(true));
  });
  var rows = Array.prototype.slice.call(stage.querySelectorAll(".hm-row"));
  var N = rows.length;
  var STEP = 360 / N; // 칸 사이 각도
  var GAP = 139; // 가운데 근처 행 간격 (피그마 px). 가운데 행이 1.25 배로 커져도 이웃과 겹치지 않는 값
  var R = GAP / ((STEP * Math.PI) / 180); // 원통 반지름 (피그마 px)
  var MOVE_MS = 900; // 한 칸 도는 시간
  var HOLD_MS = 700; // 가운데서 머무는 시간 (계속 스크롤하고 있어도 이만큼은 멈춘다)
  var WHEEL_MIN = 30; // 이만큼은 굴려야 넘어간다 (트랙패드 잔떨림 무시)
  var GESTURE_GAP = 200; // 휠 입력이 이만큼 끊기면 새 스크롤로 본다
  var SWIPE_MIN = 40;

  var reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  stage.classList.add("is-3d");
  stage.style.setProperty("--r", R.toFixed(1));

  var pos = 0; // 지금 가운데에 있는 칸 (소수 = 도는 중)
  var target = 0;
  var anim = null;
  var settledAt = 0; // 마지막으로 멈춘 시각

  function norm(a) {
    a = a % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  }

  function paint() {
    rows.forEach(function (row, i) {
      // 아래쪽이 다음 칸: i 가 커질수록 원통 아래로 돈다
      var a = norm((i - pos) * STEP);
      var hidden = Math.abs(a) > 84;
      row.style.visibility = hidden ? "hidden" : "";
      if (hidden) return;
      row.style.setProperty("--a", a.toFixed(3));
      // 가장자리로 갈수록 살짝 흐려진다
      var c = Math.cos((a * Math.PI) / 180);
      row.style.opacity = c > 0.35 ? "" : Math.max(0, c / 0.35).toFixed(3);
    });
  }

  function centerIndex() {
    return ((Math.round(target) % N) + N) % N;
  }

  function settle() {
    settledAt = performance.now();
    var c = centerIndex();
    rows.forEach(function (row, i) {
      row.classList.toggle("is-center", i === c);
    });
  }

  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function go(dir) {
    if (anim) return;
    rows.forEach(function (row) {
      row.classList.remove("is-center");
    });
    var from = pos;
    target = Math.round(pos) + dir;
    if (reduce) {
      pos = target;
      paint();
      settle();
      return;
    }
    var t0 = performance.now();
    anim = true;
    (function frame(now) {
      var t = Math.min((now - t0) / MOVE_MS, 1);
      pos = from + (target - from) * ease(t);
      paint();
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        pos = target;
        anim = null;
        settle();
      }
    })(t0);
  }

  // 가운데에 머문 지 HOLD_MS 가 지나야 다음으로 넘어간다
  function ready() {
    return !anim && performance.now() - settledAt >= HOLD_MS;
  }

  // ── 휠·트랙패드: 한 번 굴릴 때 한 칸 ──────────────────
  var acc = 0;
  var lastWheel = 0;
  var used = false; // 이번 스크롤에서 이미 한 칸 넘겼는지
  window.addEventListener(
    "wheel",
    function (e) {
      var now = performance.now();
      if (now - lastWheel > GESTURE_GAP) {
        acc = 0;
        used = false;
      }
      lastWheel = now;
      acc += e.deltaY;
      if (Math.abs(acc) < WHEEL_MIN || !ready()) return;
      // 같은 스크롤이 계속 이어지면(관성 포함) 머무는 시간이 지난 뒤에만 다음 칸
      if (used && now - settledAt < HOLD_MS) return;
      go(acc > 0 ? 1 : -1);
      used = true;
      acc = 0;
    },
    { passive: true }
  );

  // ── 터치: 한 번 밀 때 한 칸 ────────────────────────────
  var y0 = null;
  window.addEventListener(
    "touchstart",
    function (e) {
      y0 = e.touches[0].clientY;
    },
    { passive: true }
  );
  window.addEventListener(
    "touchmove",
    function (e) {
      if (y0 === null) return;
      var dy = y0 - e.touches[0].clientY;
      if (Math.abs(dy) < SWIPE_MIN || !ready()) return;
      go(dy > 0 ? 1 : -1);
      y0 = null;
    },
    { passive: true }
  );

  // ── 키보드 ───────────────────────────────────────────
  window.addEventListener("keydown", function (e) {
    var k = e.key;
    var dir =
      k === "ArrowDown" || k === "PageDown" || k === " "
        ? 1
        : k === "ArrowUp" || k === "PageUp"
        ? -1
        : 0;
    if (!dir || !ready()) return;
    e.preventDefault();
    go(dir);
  });

  paint();
  settle();
})();
