/* 상세 02 단계 스크롤 (PC 피드백_0930, 피그마 Frame 2116928556 / 2116929520)
   .wd2-story 안의 네 단계(.wd2-step-section)를 sticky 스테이지에 겹쳐 두고,
   .wd2-story 를 지나가는 스크롤 진행도에 따라 현재 단계 하나만 보여준다.
   진행도 0~1 을 단계 수로 나눠 1 → 2 → 3 → 4 순서로 넘어간다 (거꾸로 올리면 되돌아간다). */
(function () {
  var story = document.querySelector(".wd2-story");
  if (!story) return;
  var steps = story.querySelectorAll(".wd2-step-section");
  if (steps.length < 2) return;

  // 오른쪽 목록은 단계마다 따로 겹쳐 두면 바뀌는 순간 글자가 이중으로 비친다.
  // 각 단계의 활성 항목(제목 + 설명)을 모아 공용 목록 하나를 만들고,
  // 활성 항목의 설명만 아코디언처럼 펼친다. (단계별 목록은 CSS 가 숨긴다)
  var stageEl = story.querySelector(".wd2-story-stage");
  var list = document.createElement("div");
  list.className = "wd2-story-list wd2-step-list";
  var items = [];
  Array.prototype.forEach.call(steps, function (s) {
    var src = s.querySelector('.wd2-step[data-active="true"]');
    if (!src) return;
    var item = src.cloneNode(true);
    item.setAttribute("data-active", "false");
    var desc = item.querySelector(".wd2-step-desc");
    if (desc) {
      var wrap = document.createElement("div");
      wrap.className = "wd2-story-desc";
      desc.parentNode.insertBefore(wrap, desc);
      wrap.appendChild(desc);
    }
    list.appendChild(item);
    items.push(item);
  });
  stageEl.appendChild(list);

  story.classList.add("is-ready");
  var current = -1;

  function update() {
    var stage = story.querySelector(".wd2-story-stage");
    var r = story.getBoundingClientRect();
    var range = r.height - stage.offsetHeight; // sticky 로 고정돼 있는 스크롤 거리
    var top = parseFloat(getComputedStyle(stage).top) || 0;
    var p = range > 0 ? (top - r.top) / range : 0;
    p = Math.max(0, Math.min(0.9999, p));
    var idx = Math.floor(p * steps.length);
    if (idx === current) return;
    current = idx;
    Array.prototype.forEach.call(steps, function (s, i) {
      s.classList.toggle("is-current", i === idx);
      s.setAttribute("aria-hidden", i === idx ? "false" : "true");
    });
    items.forEach(function (it, i) {
      it.setAttribute("data-active", i === idx ? "true" : "false");
    });
    story.setAttribute("data-step", String(idx + 1));
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
