/* 상세 09 제품 라인: 이미지 3장 자동 슬라이드 (PC 피드백_0930, 피그마 Frame 2116929521)
   이미지 영역(1558x860) 전체가 왼쪽으로 한 장씩 밀려난다.
   마지막 → 첫 장은 트랙 끝에 붙인 첫 장 복제본까지 민 뒤 움직임 없이 처음 위치로 되돌려
   끊김 없이 한 방향으로 돈다. 아래 점 3개가 현재 장을 표시한다.
   화면에 안 보이거나 탭이 숨겨져 있으면 멈추고, 동작 줄이기 설정이면 돌지 않는다.
   PC (수정사항_11.11 #336): 자동으로 돌지 않고, 캐러셀을 화면에 고정해 둔 채 스크롤 양에 맞춰
   한 장씩 넘긴다. 마지막 장까지 넘기면 고정이 풀리고 다음 섹션으로 내려간다 (.wd9-carousel-scroll). */
(function () {
  var root = document.querySelector("[data-wd9-carousel]");
  if (!root) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var track = root.querySelector(".wd9-carousel-track");
  var dots = Array.prototype.slice.call(root.querySelectorAll(".wd9-carousel-dot"));
  var COUNT = dots.length; // 실제 장 수 (트랙엔 복제본 1장이 더 있다)
  var INTERVAL = 3000; // 이동(0.8s) + 머무는 시간
  var index = 0;
  var scroller = root.closest(".wd9-carousel-scroll");

  function paint() {
    // 장면끼리 바로 이어 붙여 민다 (틈이 있으면 전환 중에 검은 이음매가 보인다)
    track.style.transform = "translateX(" + -index * 100 + "%)";
    dots.forEach(function (dot, i) {
      dot.classList.toggle("is-active", i === index % COUNT);
    });
  }

  function step() {
    index += 1;
    paint();
  }

  // 복제본(= 첫 장)에 도착하면 transition 없이 진짜 첫 장으로 되돌린다
  track.addEventListener("transitionend", function () {
    if (index < COUNT) return;
    track.classList.add("is-wrapping");
    index = 0;
    paint();
    void track.offsetWidth;
    track.classList.remove("is-wrapping");
  });

  if (scroller && window.matchMedia("(min-width: 600px)").matches) {
    initScroll();
    return;
  }

  // 스크롤 구간을 3등분해 구간마다 한 장을 보여준다. 장 사이 이동은 CSS transition(0.8s)이 맡아
  // 스크롤을 조금씩 해도 한 장씩 또렷하게 넘어간다. 위로 되돌리면 거꾸로 넘어간다.
  function initScroll() {
    var queued = false;
    function onScroll() {
      queued = false;
      var r = scroller.getBoundingClientRect();
      var top = parseFloat(getComputedStyle(root).top) || 0;
      var dist = scroller.offsetHeight - root.offsetHeight;
      var p = dist > 0 ? (top - r.top) / dist : 0;
      var next = Math.max(0, Math.min(COUNT - 1, Math.floor(p * COUNT)));
      if (next === index) return;
      index = next;
      paint();
    }
    function queue() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(onScroll);
    }
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    onScroll();
  }

  var timer = null;
  var visible = false;

  function sync() {
    var run = visible && !document.hidden;
    if (run && !timer) timer = setInterval(step, INTERVAL);
    if (!run && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      sync();
    }).observe(root);
  } else {
    visible = true;
  }
  document.addEventListener("visibilitychange", sync);
  sync();
})();
