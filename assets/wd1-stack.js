/* 상세 01 레이어 얹힘 모션 (수정사항_11.10, 피그마 4084:28907 타임라인 13.5초)
   세트마다 4.5초: 나타남 → 이미지 1·2·3 이 1초 간격으로 100 아래에서 올라와 얹힘 → 사라짐 → 다음 세트.
   띠를 화면에 고정해 두고 스크롤 양에 맞춰 이 타임라인을 진행한다 (마지막 세트가 다 얹힌 지점에서 끝). */
(function () {
  var root = document.querySelector("[data-stack]");
  if (!root || !window.matchMedia("(min-width: 600px)").matches) return;

  var SET = 4.5;
  var SCROLL_END = 12.5;
  var RISE_START = 0.6035; // 첫 이미지 출발 (피그마 4.47%)
  var RISE_GAP = 1;
  var RISE_TIME = 0.8965;
  var FADE_IN = 0.8;
  var HOLD_END = 3.5;
  var RISE = 100;

  function bezier(x1, y1, x2, y2) {
    function at(a, b, t) {
      return 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
    }
    return function (x) {
      var lo = 0;
      var hi = 1;
      for (var i = 0; i < 24; i++) {
        var m = (lo + hi) / 2;
        if (at(x1, x2, m) < x) lo = m;
        else hi = m;
      }
      return at(y1, y2, (lo + hi) / 2);
    };
  }
  var easeRise = bezier(0.22, 1, 0.36, 1);
  var easeIn = bezier(0.42, 0, 0.58, 1);
  function easeOut(p) {
    return 1 - Math.exp(-p * 11.1803) * (Math.cos(p * 0.1581) + 70.7054 * Math.sin(p * 0.1581));
  }
  function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  var sets = Array.prototype.map.call(root.querySelectorAll(".wd-stack-set"), function (el) {
    return { el: el, imgs: Array.prototype.slice.call(el.querySelectorAll("img")) };
  });
  var unit = Math.min(window.innerWidth / 1920, 1);

  function render(t) {
    sets.forEach(function (s, n) {
      var local = t - n * SET;
      if (local < 0 || local >= SET) {
        s.el.style.opacity = "0";
        return;
      }
      var a =
        local < FADE_IN
          ? easeIn(local / FADE_IN)
          : local < HOLD_END
          ? 1
          : 1 - easeOut(clamp((local - HOLD_END) / (SET - HOLD_END)));
      s.el.style.opacity = a.toFixed(3);
      s.imgs.forEach(function (img, i) {
        var e = easeRise(clamp((local - RISE_START - i * RISE_GAP) / RISE_TIME));
        img.style.opacity = e.toFixed(3);
        img.style.translate = "0 " + (RISE * unit * (1 - e)).toFixed(2) + "px";
      });
    });
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    render(3);
    return;
  }

  var pin = root.querySelector(".wd-stack-pin");
  var queued = false;

  function onScroll() {
    queued = false;
    var r = root.getBoundingClientRect();
    var top = parseFloat(getComputedStyle(pin).top) || 0;
    var dist = root.offsetHeight - pin.offsetHeight;
    render(SCROLL_END * clamp((top - r.top) / dist));
  }

  window.addEventListener("resize", function () {
    unit = Math.min(window.innerWidth / 1920, 1);
    onScroll();
  });
  window.addEventListener(
    "scroll",
    function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(onScroll);
    },
    { passive: true }
  );
  onScroll();
})();
