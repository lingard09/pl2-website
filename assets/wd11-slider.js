/* 상세 11 모바일 선수 6인 슬라이더 (수정사항_11.06, 피그마 1_MO 3857:31720)
   모바일에서는 CSS 가 .wd11-players-track 을 가로 스크롤 스냅으로 바꾼다 (손으로 넘긴다).
   여기서는 스크롤 위치에 맞춰 아래 점만 켠다. PC 에서는 트랙이 display: contents 라 아무 일도 없다. */
(function () {
  var root = document.querySelector(".wd11-players");
  if (!root) return;
  var track = root.querySelector(".wd11-players-track");
  var dots = root.querySelectorAll(".wd11-dot");
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
