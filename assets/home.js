/* 홈 분야 슬롯 (PC 피드백_1015, 피그마 Home 3394:72204 프리뷰 키프레임)
   - 행 14개의 칸 번호(--s)를 2.2초마다 하나씩 줄인다 → CSS transition 이 1.8초 동안 위로 민다.
     (처음 0.4초 머문 뒤 시작, 이동 1.8초 + 정지 0.4초)
   - 칸 3(화면 가운데)에 온 행만 .is-focus (블러 0). 나머지는 살짝 흐리게.
   - 움직일 때마다 모든 행의 블러가 0.22초 만에 12 까지 번졌다가 0.5초 동안 원래대로
     (흐린 행은 5, 초점 행은 0) 돌아온다 — 피그마 filter 키프레임(24 / 10)의 CSS 환산값.
   - 칸 -3 까지 올라간 행은 움직임 없이 칸 11(화면 아래 밖)로 옮겨 끝없이 반복한다.
   - 화면이 숨겨져 있으면 멈추고, 동작 줄이기 설정이면 움직이지 않는다. */
(function () {
  var rows = Array.prototype.slice.call(document.querySelectorAll(".hm-row"));
  if (!rows.length) return;

  var FOCUS = 3;
  var TOP = -3; // 여기까지 올라가면
  var BOTTOM = 11; // 여기로 돌아간다
  var PERIOD = 2200;
  var FIRST = 400;
  var slots = rows.map(function (el, i) {
    return i;
  });

  function u() {
    return Math.min(window.innerHeight / 1080, window.innerWidth / 700);
  }

  function paint() {
    rows.forEach(function (el, i) {
      el.style.setProperty("--s", slots[i]);
      el.classList.toggle("is-focus", slots[i] === FOCUS);
    });
  }

  // 첫 배치는 움직임 없이 (CSS 기본값 --s: 0 에서 미끄러져 오지 않게)
  rows.forEach(function (el) {
    el.classList.add("is-wrapping");
  });
  paint();
  void document.body.offsetWidth;
  rows.forEach(function (el) {
    el.classList.remove("is-wrapping");
  });
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function blurSpike(el, focusNow) {
    if (!el.animate) return;
    var k = u();
    // 피그마 블러 값(10, 전환 중 24)의 절반 — 피그마 반경은 CSS blur 의 2배다
    var from = el._wasFocus ? 0 : 5 * k;
    var to = focusNow ? 0 : 5 * k;
    el._wasFocus = focusNow;
    el.animate(
      [
        { filter: "blur(" + from + "px)", easing: "ease-out" },
        { filter: "blur(" + 12 * k + "px)", offset: 0.3, easing: "ease-out" },
        { filter: focusNow ? "none" : "blur(" + to + "px)" },
      ],
      { duration: 720 }
    );
  }

  rows.forEach(function (el, i) {
    el._wasFocus = slots[i] === FOCUS;
  });

  function step() {
    rows.forEach(function (el, i) {
      slots[i] -= 1;
    });
    paint();
    rows.forEach(function (el, i) {
      blurSpike(el, slots[i] === FOCUS);
    });
    // 이동이 끝나면 맨 위로 빠진 행을 맨 아래로
    setTimeout(function () {
      rows.forEach(function (el, i) {
        if (slots[i] > TOP) return;
        slots[i] = BOTTOM;
        el.classList.add("is-wrapping");
        el.style.setProperty("--s", BOTTOM);
        void el.offsetWidth;
        el.classList.remove("is-wrapping");
      });
    }, 1800);
  }

  var timer = null;
  var first = null;

  function sync() {
    if (document.hidden) {
      clearTimeout(first);
      clearInterval(timer);
      first = timer = null;
      return;
    }
    if (timer || first) return;
    first = setTimeout(function () {
      first = null;
      step();
      timer = setInterval(step, PERIOD);
    }, FIRST);
  }

  document.addEventListener("visibilitychange", sync);
  sync();
})();
