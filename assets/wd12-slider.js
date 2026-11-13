/* 상세 12 모바일 Made to Move 4장 슬라이더 (수정사항_11.06, 피그마 2_MO 3865:11058)
   모바일에서는 CSS 가 .wd12-track 을 가로 스크롤 스냅으로 바꾼다 (손으로 넘긴다).
   여기서는 스크롤 위치에 맞춰 아래 점만 켠다. PC 에서는 트랙이 display: contents 라 아무 일도 없다.
   11.13 MO 코멘트: 자동 슬라이드 추가 — 3초마다 한 장씩 넘기고 끝에서 처음으로.
   화면 밖·탭 숨김·손으로 만지는 중에는 쉬고, 손을 뗀 뒤 3초 지나면 다시 돈다. 동작 줄이기 설정이면 돌지 않는다. */
(function () {
  var root = document.querySelector(".wd12-slider");
  if (!root) return;
  var track = root.querySelector(".wd12-track");
  var dots = root.querySelectorAll(".wd12-dot");
  if (!track || !dots.length) return;
  var raf = 0;
  function paint() {
    raf = 0;
    var w = track.clientWidth;
    if (!w) return;
    var index = Math.round(track.scrollLeft / w);
    Array.prototype.forEach.call(dots, function (dot, i) {
      dot.classList.toggle("is-active", i === index);
    });
  }
  track.addEventListener(
    "scroll",
    function () {
      if (!raf) raf = requestAnimationFrame(paint);
    },
    { passive: true }
  );

  // ── 자동 슬라이드 (모바일에서 트랙이 실제로 가로로 넘칠 때만) ──
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var INTERVAL = 3000;
  var timer = 0;
  var visible = false;
  var touching = false;
  function step() {
    var w = track.clientWidth;
    if (!w || track.scrollWidth <= w + 2) return; // PC (display: contents) 거나 한 장뿐
    var next = Math.round(track.scrollLeft / w) + 1;
    if (next >= dots.length) next = 0;
    track.scrollTo({ left: next * w, behavior: "smooth" });
  }
  function update() {
    var run = visible && !touching && !document.hidden;
    if (run && !timer) timer = setInterval(step, INTERVAL);
    if (!run && timer) {
      clearInterval(timer);
      timer = 0;
    }
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      update();
    }, { threshold: 0.5 }).observe(track);
  }
  var resume = 0;
  track.addEventListener("touchstart", function () {
    touching = true;
    clearTimeout(resume);
    update();
  }, { passive: true });
  track.addEventListener("touchend", function () {
    clearTimeout(resume);
    resume = setTimeout(function () {
      touching = false;
      update();
    }, INTERVAL);
  }, { passive: true });
  document.addEventListener("visibilitychange", update);
})();
