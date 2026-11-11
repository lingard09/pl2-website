/* 상세 07 코드 에디터 Light → Dark (수정사항_11.11 #330, 피그마 4170:27153)
   PC(600 이상): 띠를 화면에 고정해 두고, 고정 구간의 가운데 절반 동안 Dark 이미지가 위에서 아래로 덮어 내린다.
   앞뒤 1/4 은 Light · Dark 를 그대로 보여 준 채 머문다. 다 바뀌면 고정이 풀리고 아래로 내려간다.
   모바일·동작 줄이기 설정은 CSS 가 고정을 하지 않으므로 여기서도 아무것도 하지 않는다. */
(function () {
  var root = document.querySelector("[data-wd7-code]");
  if (!root) return;
  if (!window.matchMedia("(min-width: 600px)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var pin = root.querySelector(".wd7-code-pin");
  var dark = root.querySelector(".wd7-code-img--dark");
  var queued = false;

  function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  function ease(p) {
    return p * p * (3 - 2 * p);
  }

  function update() {
    queued = false;
    var r = root.getBoundingClientRect();
    var top = parseFloat(getComputedStyle(pin).top) || 0;
    var dist = root.offsetHeight - pin.offsetHeight;
    var p = dist > 0 ? clamp((top - r.top) / dist) : 1;
    // 반투명으로 겹치면 중간에 화면이 탁한 회색이 되어, Dark 를 위에서 아래로 덮어 내린다
    var e = ease(clamp((p - 0.25) / 0.5));
    dark.style.opacity = e > 0 ? "1" : "0";
    dark.style.clipPath = "inset(0 0 " + ((1 - e) * 100).toFixed(2) + "% 0)";
  }

  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();
