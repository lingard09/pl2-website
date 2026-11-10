/* 상세 13 (4-H) · 상세 02 (AI 필름) 스크롤 모션 — 수정사항_11.09, 피그마 Scroll 4031:24599 · 4031:24960 + 참고 영상
   - 왼쪽 사진: 카드마다 다른 속도로 올라온다 (참고 영상 1번 20 / 2번 10 / 3번 30).
     챕터가 화면 가운데 오면 이동량이 0 이라 피그마에 놓인 위치와 정확히 같다.
   - 오른쪽 목록: 화면에 고정. 지금 챕터가 왼쪽으로 이동하며 커지고 설명이 펼쳐진다 (전환은 CSS 마그네틱 이징).
   모바일은 기존처럼 위에서 아래로 쌓는다 — 모바일로 연 뒤 PC 폭으로 넓히면 그때 켠다. */
(function () {
  var story = document.querySelector(".wd2-story");
  if (!story) return;

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
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var sections = Array.prototype.slice.call(story.querySelectorAll(".wd2-step-section"));
    if (sections.length < 2) return;

    var SPEEDS = [0.2, 0.1, 0.3, 0.15];
    // 목록의 왼쪽 위치 (1920 기준 %). 쉼표로 챕터마다 다르게 줄 수 있다. 60.4167 = 1160
    var LIST_X = (story.getAttribute("data-list-x") || "60.4167").split(",").map(function (v) {
      return v + "%";
    });
    var FOLLOW = 0.14; // 프레임마다 목표로 다가가는 비율 (60fps 기준)

    // 챕터마다 있는 활성 항목(제목 + 설명)을 모아 고정 목록 하나를 만든다
    var rail = document.createElement("div");
    rail.className = "wdm-rail";
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
    var anchor = document.createElement("div");
    anchor.className = "wdm-anchor";
    anchor.appendChild(list);
    rail.appendChild(anchor);
    story.appendChild(rail);
    story.classList.add("is-magnet");

    var chapters = sections.map(function (s) {
      return {
        el: s,
        cards: Array.prototype.map.call(s.querySelectorAll(".wdm-card, .wd2-pipeline-wrap"), function (el, i) {
          return { el: el, k: SPEEDS[i] || 0, y: null };
        }),
      };
    });

    // 휠로 내릴 때 이미지가 끊겨 올라오지 않게 About 과 같은 관성 스크롤을 쓴다 (수정사항_11.10).
    // 스크롤과 이미지 이동을 같은 프레임에 처리해야 어긋나지 않는다.
    var lenis = null;
    if (!reduce && window.Lenis && window.matchMedia("(pointer: fine)").matches) {
      lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
      window.PL2Space = { lenis: lenis }; // top-btn.js 가 같은 관성으로 올라가게
      lenis.on("scroll", function () {
        frame(performance.now());
      });
      var drive = function (t) {
        lenis.raf(t);
        requestAnimationFrame(drive);
      };
      requestAnimationFrame(drive);
    }

    var current = -1;
    var raf = null;
    var last = 0;

    function setActive(i) {
      if (i === current) return;
      current = i;
      items.forEach(function (it, n) {
        it.setAttribute("data-active", n === i ? "true" : "false");
      });
      list.style.setProperty("--lx", LIST_X[i] || LIST_X[0]);
    }

    function frame(now) {
      var dt = last ? Math.min(now - last, 64) : 16.7;
      last = now;
      var ratio = 1 - Math.pow(1 - FOLLOW, dt / 16.7);
      var mid = window.innerHeight / 2;
      var best = 0;
      var bestD = Infinity;
      var moving = false;

      chapters.forEach(function (c, n) {
        var r = c.el.getBoundingClientRect();
        var d = r.top + r.height / 2 - mid;
        if (Math.abs(d) < bestD) {
          bestD = Math.abs(d);
          best = n;
        }
        if (reduce) return;
        c.cards.forEach(function (card) {
          var goal = d * card.k;
          card.y = card.y === null || lenis ? goal : card.y + (goal - card.y) * ratio;
          if (Math.abs(goal - card.y) > 0.1) moving = true;
          else card.y = goal;
          card.el.style.transform = "translate3d(0," + card.y.toFixed(2) + "px,0)";
        });
      });
      setActive(best);

      if (moving) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = null;
        last = 0;
      }
    }

    function request() {
      if (raf === null) raf = requestAnimationFrame(frame);
    }

    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    window.addEventListener("load", request);
    request();
  }
})();
