/* 상세 07 모바일 화면 모음 (6_MO 3875:26765 외 2): 폰 화면 4장 가로 스와이프.
   넘기기는 CSS scroll-snap 이 맡고, 여기서는 아래 점 4개만 지금 장에 맞춰 칠한다.
   PC 에서는 묶음 자체가 숨겨져 있어 스크롤이 일어나지 않는다. */
(function () {
  var roots = document.querySelectorAll("[data-wd7-screens]");
  Array.prototype.forEach.call(roots, function (root) {
    var track = root.querySelector(".wd7-screens-track");
    var dots = root.querySelectorAll(".wd7-screens-dots span");
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
