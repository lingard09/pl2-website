/* 상세 09 모바일 스와이프 묶음 (11_MO 3898:29782 · 29889 · 29927 · 30013): 무드·모델 컷 가로 스와이프.
   넘기기는 CSS scroll-snap 이 맡고, 여기서는 아래 점만 지금 장에 맞춰 칠한다.
   PC 에서는 트랙이 스크롤되지 않고 점도 숨겨져 있다. */
(function () {
  var roots = document.querySelectorAll("[data-wd9-swipe]");
  Array.prototype.forEach.call(roots, function (root) {
    var track = root.querySelector(".wd9-swipe-track");
    var dots = root.querySelectorAll(".wd9-swipe-dots span");
    if (!track || !dots.length) return;
    var current = 0;
    var raf = 0;

    function paint() {
      raf = 0;
      var w = track.clientWidth;
      if (!w) return;
      var i = Math.max(0, Math.min(dots.length - 1, Math.round(track.scrollLeft / w)));
      if (i === current) return;
      dots[current].classList.remove("is-active");
      dots[i].classList.add("is-active");
      current = i;
    }

    track.addEventListener(
      "scroll",
      function () {
        if (!raf) raf = requestAnimationFrame(paint);
      },
      { passive: true }
    );
  });
})();
