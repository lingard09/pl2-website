/* 상세 01 필름스트립 무한 회전 (PC 피드백_0930, 피그마 Frame 2116929324)
   일정 간격으로 모든 이미지를 왼쪽으로 한 칸씩 옮긴다. 위치·크기는 CSS 의
   [data-slot] 규칙이 정하고 transition 이 움직임을 만든다.
   - 가운데(0) 칸에 들어오는 이미지는 커지고, 나가는 이미지는 작아진다
   - -5 칸에서 밀려난 이미지는 화면 밖이므로 움직임 없이 +5 칸(오른쪽 끝, 역시 화면 밖)으로 옮긴다
   - 화면에 안 보이거나 탭이 숨겨져 있으면 멈춘다. 동작 줄이기 설정이면 돌지 않는다 */
(function () {
  var track = document.querySelector(".wd-strip-track");
  if (!track) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var MIN = -5;
  var MAX = 5;
  var INTERVAL = 2600; // 한 칸 이동(1s) + 머무는 시간
  var imgs = Array.prototype.slice.call(track.querySelectorAll("img[data-slot]"));
  if (!imgs.length) return;

  function step() {
    imgs.forEach(function (img) {
      var slot = parseInt(img.getAttribute("data-slot"), 10) - 1;
      if (slot < MIN) {
        img.classList.add("is-wrapping");
        img.setAttribute("data-slot", String(MAX));
        void img.offsetWidth; // 위치를 먼저 확정해야 transition 을 다시 켜도 안 움직인다
        img.classList.remove("is-wrapping");
      } else {
        img.setAttribute("data-slot", String(slot));
      }
    });
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
    }).observe(track.parentElement);
  } else {
    visible = true;
  }
  document.addEventListener("visibilitychange", sync);
  sync();
})();
