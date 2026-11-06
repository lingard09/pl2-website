/* 상세 페이지 모바일 캐러셀 점 표시 (수정사항_11.06, 피그마 MO Pagination 5px 점 · 간격 4 · 아래 12)
   넘기기는 CSS scroll-snap 가로 스크롤이 맡고, 이 스크립트는 점만 만든다.
   [data-mo-carousel] 안의 [data-mo-track] 이 스크롤 칸이다. 장은 모두 칸 폭(100%)이라
   장 수 = scrollWidth / clientWidth, 현재 장 = scrollLeft / clientWidth 로 센다.
   PC 에서는 트랙이 스크롤되지 않으므로(장 수 1) 점을 만들지 않는다. */
(function () {
  var roots = document.querySelectorAll("[data-mo-carousel]");
  if (!roots.length) return;

  Array.prototype.forEach.call(roots, function (root) {
    var track = root.querySelector("[data-mo-track]");
    if (!track) return;
    var dotsEl = document.createElement("div");
    dotsEl.className = "wd-mo-dots";
    dotsEl.setAttribute("aria-hidden", "true");
    root.appendChild(dotsEl);
    var dots = [];

    function build() {
      var w = track.clientWidth;
      var n = w ? Math.round(track.scrollWidth / w) : 0;
      if (n < 2) n = 0;
      if (n === dots.length) return;
      dotsEl.textContent = "";
      dots = [];
      for (var i = 0; i < n; i++) {
        var d = document.createElement("span");
        dotsEl.appendChild(d);
        dots.push(d);
      }
      paint();
    }

    function paint() {
      if (!dots.length) return;
      var idx = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach(function (d, i) {
        d.classList.toggle("is-active", i === idx);
      });
    }

    var ticking = false;
    track.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          paint();
        });
      },
      { passive: true }
    );
    window.addEventListener("resize", build);
    window.addEventListener("load", build);
    build();
  });
})();
