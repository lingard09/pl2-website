/* About PL 로고 4장면 (수정사항_11.02, 피그마 Frame 2116929594)
   스크롤에 따라 1 그리드 → 2 노란 가이드 라인 → 3 PL 로고 등장 → 4 노란 라인 사라짐(고정)을
   하나씩 얹는다. 거꾸로 올리면 거꾸로 걷힌다.
   - 데스크톱 공간 모션(html.sp-on): 섹션이 화면 가운데 고정(data-pin)된 동안의 스크롤 거리를 4등분한다.
   - 그 밖(터치·좁은 화면): 장면이 화면 아래 75% 에서 25% 까지 올라오는 동안을 4등분한다.
     첫 화면에 보이는 경우는 스크롤한 거리(화면 높이의 60%)로도 나눠 맨 위에서는 1 장면이다. */
(function () {
  var sec = document.querySelector(".ab-graphic");
  if (!sec) return;
  var stage = sec.querySelector(".ab-pl");
  var layers = sec.querySelectorAll(".ab-pl-layer");
  if (!stage || layers.length < 2) return;

  var root = document.documentElement;
  var current = -1;

  function progress() {
    var vh = window.innerHeight;
    var r = sec.getBoundingClientRect();
    var h = stage.offsetHeight;
    if (root.classList.contains("sp-on")) {
      var range = sec.offsetHeight - h; // 고정돼 있는 스크롤 거리
      if (range <= 0) return 1;
      return (vh / 2 - h / 2 - r.top) / range;
    }
    var top = stage.getBoundingClientRect().top;
    // 첫 화면에 이미 들어와 있는 경우(모바일)에도 맨 위에서는 1 장면부터 시작하도록
    // 실제로 스크롤한 거리로도 제한한다
    return Math.min((vh * 0.85 - top) / (vh * 0.75), window.scrollY / (vh * 1));
  }

  function update() {
    var p = Math.max(0, Math.min(0.9999, progress()));
    var step = Math.floor(p * layers.length); // 0..3 → 장면 1..4
    if (step === current) return;
    current = step;
    Array.prototype.forEach.call(layers, function (el, i) {
      el.classList.toggle("is-on", i === step);
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      update();
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();
