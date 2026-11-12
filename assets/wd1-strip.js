/* 상세 01 필름스트립 (PC 피드백_0930, 피그마 Frame 2116929324)
   칸 위치·크기: 작은 칸 200x300 (212 간격, 아래 정렬), 가운데 큰 칸 518x740 (양옆 12 간격).
   가운데(0) 칸에 들어오는 이미지는 커지고, 나가는 이미지는 작아진다.

   PC (수정사항_11.11 #325): 띠를 화면에 고정해 두고 스크롤 양에 맞춰 이미지를 왼쪽 → 오른쪽으로
   한 칸씩 굴린다. 수정사항_11.12: 스크롤 양을 따라 끌려가지 않고 구간이 바뀔 때마다 한 장씩 탁 넘어간다. 아홉 칸을 다 굴리면
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

  function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  var on = false;
  var u = 1;

  function render(shift) {
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
    var p = dist > 0 ? clamp((top - r.top) / dist) : 0;
    // 스크롤 구간을 (STEPS + 1) 칸으로 나눠 칸마다 한 장. 스크롤 양을 따라 끌려가지 않고
    // 칸이 바뀌는 순간 한 장이 탁 넘어간다 (수정사항_11.12 "스크롤시 탁.탁. 하나씩")
    goTo(Math.min(STEPS, Math.floor(p * (STEPS + 1))));
  }

  var MOVE_MS = 520;
  var cur = 0; // 지금 그려진 위치 (칸 단위, 넘어가는 중이면 소수)
  var target = 0;
  var from = 0;
  var t0 = 0;
  var raf = 0;

  function goTo(next) {
    if (next === target) return;
    from = cur;
    target = next;
    t0 = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    var k = clamp((now - t0) / MOVE_MS);
    // 빠르게 출발해 칸에 붙는다
    cur = from + (target - from) * (1 - Math.pow(1 - k, 3));
    render(cur);
    raf = k < 1 ? requestAnimationFrame(tick) : 0;
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
    // 처음 열 때(또는 크기 바꿀 때)는 넘기는 모션 없이 제자리에 둔다
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    cur = target;
    render(cur);
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
