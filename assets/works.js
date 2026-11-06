/* Works 좌우 열 시차 (후순위 모션 변경 사항, 피그마 3933:23802)
   참고: Codrops On-Scroll Column & Row Animations — 스크롤하면 열마다 올라오는 속도가 다르다.
   오른쪽 열이 왼쪽 열보다 빨리 올라온다.
   - 오른쪽 열: 맨 위에서 lead 만큼 아래에서 출발해 맨 아래에서 제자리로 온다.
   - 왼쪽 열: 맨 위에서 제자리, 맨 아래에서 두 열 높이 차(extra)만큼 내려가 있다 (스크롤보다 느리게).
   그래서 맨 아래에서 두 열의 아래 끝이 나란히 맞고, 페이지 끝에 빈 띠가 생기지 않는다.
   참고 데모처럼 한 열을 열 높이의 10% 만큼 그냥 올리면 페이지 끝에서 그 열 아래가 비어 보인다
   — Works 는 푸터 없이 그리드로 끝나기 때문.
   카드 등장(motion.js)은 카드의 translate 를, 이 시차는 열의 transform 을 쓰므로 겹치지 않는다.
   두 열이 나란히 있을 때만 돈다 (모바일 1열에서는 끈다). 동작 줄이기면 아무 것도 안 한다. */
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var cols = document.querySelectorAll(".wk-grid > .wk-col");
  if (cols.length !== 2) return;
  var left = cols[0];
  var right = cols[1];

  var lead = 0; // 맨 위에서 오른쪽 열이 내려가 있는 거리
  var extra = 0; // 맨 아래에서 왼쪽 열이 내려가 있는 거리 (= 두 열 높이 차, 오른쪽이 더 길다)
  var range = 1; // 시차가 일어나는 스크롤 구간 (페이지 맨 위 → 맨 아래)
  var on = false;
  var ticking = false;

  function measure() {
    var vw = window.innerWidth;
    // 1열(모바일)로 쌓이면 두 열의 위치가 같은 가로 줄이 아니다
    on = right.offsetTop === left.offsetTop && right.offsetLeft > left.offsetLeft;
    if (!on) {
      right.style.transform = "";
      left.style.transform = "";
      return;
    }
    lead = Math.min(vw * 0.125, 240); // 240 (1920 기준)
    extra = Math.max(0, right.offsetHeight - left.offsetHeight);
    range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    update();
  }

  function update() {
    ticking = false;
    if (!on) return;
    var p = Math.min(Math.max(window.scrollY / range, 0), 1);
    right.style.transform = "translate3d(0," + (lead * (1 - p)).toFixed(2) + "px,0)";
    left.style.transform = "translate3d(0," + (extra * p).toFixed(2) + "px,0)";
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 150);
  });
  // 이미지·영상이 늦게 들어오면 열 높이가 바뀐다
  window.addEventListener("load", measure);
  measure();
})();
