/* 상세 13 (4-H) 01 Grow → 05 Feast 고정 프레임 — 수정사항_11.11 #327·#328 (피그마 4170:25246)
   다섯 챕터를 한 프레임(1920x960)에 겹쳐 두고 화면에 고정한 채, 스크롤하면 챕터가 01 → 05 로 넘어간다.
   왼쪽 사진 묶음은 교차 페이드, 오른쪽 목록은 지금 챕터가 커지며 설명이 펼쳐지고 나머지는 회색으로 남는다.
   모바일·움직임 줄이기 설정에서는 켜지 않고 기존처럼 위에서 아래로 쌓는다.
   모바일로 연 뒤 PC 폭으로 넓히면 그때 켠다. */
(function () {
  var story = document.querySelector(".wd2-story");
  if (!story) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var mobile = window.matchMedia("(max-width: 599.98px)");
  if (mobile.matches) {
    var onChange = function () {
      if (mobile.matches) return;
      mobile.removeEventListener("change", onChange);
      init();
    };
    mobile.addEventListener("change", onChange);
    return;
  }
  init();

  function init() {
    var stage = story.querySelector(".wd2-story-stage");
    var sections = Array.prototype.slice.call(story.querySelectorAll(".wd2-step-section"));
    if (!stage || sections.length < 2) return;

    // 챕터마다 있는 활성 항목(제목 + 설명)을 모아 목록 하나를 만든다
    var list = document.createElement("div");
    list.className = "wdm-list wd2-story-list wd2-step-list";
    var items = sections.map(function (s) {
      var item = s.querySelector('.wd2-step[data-active="true"]').cloneNode(true);
      item.setAttribute("data-active", "false");
      var desc = item.querySelector(".wd2-step-desc");
      if (desc) {
        var wrap = document.createElement("div");
        wrap.className = "wd2-story-desc";
        desc.parentNode.insertBefore(wrap, desc);
        wrap.appendChild(desc);
      }
      list.appendChild(item);
      return item;
    });
    stage.appendChild(list);
    story.style.setProperty("--steps", sections.length);
    story.classList.add("is-ready");

    // 휠로 내릴 때 끊기지 않게 기존(wd-magnet-story.js)과 같은 관성 스크롤을 쓴다
    if (window.Lenis && window.matchMedia("(pointer: fine)").matches) {
      var lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
      window.PL2Space = { lenis: lenis }; // top-btn.js 가 같은 관성으로 올라가게
      lenis.on("scroll", update);
      var drive = function (t) {
        lenis.raf(t);
        requestAnimationFrame(drive);
      };
      requestAnimationFrame(drive);
    }

    var current = -1;
    function setActive(i) {
      if (i === current) return;
      current = i;
      sections.forEach(function (s, n) {
        s.classList.toggle("is-current", n === i);
      });
      items.forEach(function (it, n) {
        it.setAttribute("data-active", n === i ? "true" : "false");
      });
    }

    var queued = false;
    function update() {
      queued = false;
      var r = story.getBoundingClientRect();
      var top = parseFloat(getComputedStyle(stage).top) || 0;
      var dist = story.offsetHeight - stage.offsetHeight;
      var p = dist > 0 ? (top - r.top) / dist : 0;
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      setActive(Math.min(sections.length - 1, Math.floor(p * sections.length)));
    }
    function request() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    }

    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    update();
  }
})();
