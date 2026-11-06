/* 상세 12 모바일 Made to Move 4장 슬라이더 (수정사항_11.06, 피그마 2_MO 3865:11058)
   모바일에서는 CSS 가 .wd12-track 을 가로 스크롤 스냅으로 바꾼다 (손으로 넘긴다).
   여기서는 스크롤 위치에 맞춰 아래 점만 켠다. PC 에서는 트랙이 display: contents 라 아무 일도 없다. */
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
})();
