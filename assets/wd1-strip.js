/* 상세 01 필름스트립 (PC 피드백_0930, 피그마 Frame 2116929324)
   칸 위치·크기: 작은 칸 200x300 (212 간격, 아래 정렬), 가운데 큰 칸 518x740 (양옆 12 간격).
   가운데(0) 칸에 들어오는 이미지는 커지고, 나가는 이미지는 작아진다.

   PC (수정사항_11.11 #325): 띠를 화면에 고정해 두고 스크롤 양에 맞춰 이미지를 왼쪽 → 오른쪽으로
   한 칸씩 굴린다. 칸마다 잠깐 머물도록 칸 사이 이동에 가속·감속을 준다. 아홉 칸을 다 굴리면
   (모든 이미지가 한 번씩 가운데에 온다) 고정이 풀리고 아래로 이어진다.
   양끝(-5, +5 칸)은 화면 밖이라 그 사이에서 반대편 끝으로 넘어가도 보이지 않는다.
   모바일(수정사항_11.06)은 손으로 넘기는 가로 스크롤이라 여기서 아무것도 하지 않는다.
   동작 줄이기 설정이면 고정·회전 없이 처음 배치(CSS [data-slot])로 둔다. */
(function () {
  var section = document.querySelector("[data-strip-scroll]");
  var track = document.querySelector(".wd-strip-track");
  if (!section || !track || !window.matchMedia) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var pc = window.matchMedia("(min-width: 600px)");

  var strip = track.parentElement;
  var pin = section.querySelector(".wd-strip-pin");
  var imgs = Array.prototype.slice.call(track.querySelectorAll("img[data-slot]"));
  var N = imgs.length;
  var STEPS = N - 1; // 처음 가운데 이미지 다음부터 나머지가 모두 한 번씩 가운데에 온다
  var HALF = N / 2; // 칸 번호를 [-HALF, HALF) 로 감는다
  var base = imgs.map(function (img) {
    return parseInt(img.getAttribute("data-slot"), 10);
  });

  // 칸 k 의 트랙 기준 위치·크기 (피그마 px)
  function geom(k) {
    if (k === 0) return [1060, 0, 518, 740];
    var left = k < 0 ? 1060 - 212 * -k : 1590 + 212 * (k - 1);
    return [left, 440, 200, 300];
  }

  function ease(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  var on = false;
  var u = 1;

  function render(progress) {
    var t = STEPS * progress;
    var whole = Math.floor(t);
    var shift = whole + ease(t - whole); // 칸 사이만 움직이고 칸에서는 머문다
    imgs.forEach(function (img, i) {
      // 왼쪽 → 오른쪽: 칸 번호가 커지는 쪽으로 민다
      var s = base[i] + shift;
      s = ((((s + HALF) % N) + N) % N) - HALF;
      var k = Math.floor(s);
      var f = s - k;
      var a = geom(k);
      var b = geom(k + 1);
      img.style.left = (a[0] + (b[0] - a[0]) * f) * u + "px";
      img.style.top = (a[1] + (b[1] - a[1]) * f) * u + "px";
      img.style.width = (a[2] + (b[2] - a[2]) * f) * u + "px";
      img.style.height = (a[3] + (b[3] - a[3]) * f) * u + "px";
    });
  }

  function measure() {
    u = Math.min(window.innerWidth / 1920, 1);
    section.style.setProperty("--strip-pin", pin.offsetHeight + "px");
  }

  function onScroll() {
    queued = false;
    if (!on) return;
    var top = parseFloat(getComputedStyle(pin).top) || 0;
    var dist = section.offsetHeight - pin.offsetHeight;
    var r = section.getBoundingClientRect();
    render(dist > 0 ? clamp((top - r.top) / dist) : 0);
  }

  function setMode() {
    on = pc.matches;
    strip.classList.toggle("wd-strip--scroll", on);
    if (!on) {
      section.style.removeProperty("--strip-pin");
      imgs.forEach(function (img) {
        img.style.left = img.style.top = img.style.width = img.style.height = "";
      });
      return;
    }
    measure();
    onScroll();
  }

  var queued = false;
  window.addEventListener(
    "scroll",
    function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(onScroll);
    },
    { passive: true }
  );
  window.addEventListener("resize", setMode);
  setMode();
})();
