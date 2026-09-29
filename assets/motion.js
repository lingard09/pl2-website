/* 공통 모션 (모든 페이지 공유) — 피그마 "PC 모션피드백_0928" (2836:11814)
   1) 스크롤 등장: 콘텐츠가 아래에서 위로 "쓱쓱쓱" 붙는다 (참고: WeTransfer Ideas Report 2021,
      그보다 조금 더 텐션 있게 → 이동 거리를 키우고 expo-out 이징)
   2) About 통계 숫자 카운팅
   3) 페이지 전환: 노란 패널이 아래에서 덮고 위로 빠진다 (참고: koto.com/work)

   <head> 에서 동기로 불러온다. 첫 페인트 전에 html 클래스를 붙여야
   도착 페이지가 한 번 번쩍 보였다가 덮이는 일이 없다. 나머지는 DOMContentLoaded 뒤에 돈다.
   prefers-reduced-motion 이면 아무 것도 하지 않는다. */
(function () {
  var root = document.documentElement;
  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  var PT_KEY = "pl2-pt";
  var LEAVE_MS = 600; // base.css html.pt-leave::after 의 transition 과 맞춘다

  function readFlag() {
    try {
      var v = sessionStorage.getItem(PT_KEY);
      sessionStorage.removeItem(PT_KEY);
      return v === "1";
    } catch (e) {
      return false;
    }
  }

  function writeFlag() {
    try {
      sessionStorage.setItem(PT_KEY, "1");
    } catch (e) {}
  }

  // ── 첫 페인트 전 ─────────────────────────────────────
  root.classList.add("mo-on");
  var entering = readFlag();
  if (entering) root.classList.add("pt-enter");

  document.addEventListener("DOMContentLoaded", function () {
    initPageTransition();
    // 전환 패널이 걷히는 중이면 등장 모션을 그만큼 늦춘다
    initReveal(entering ? 350 : 0);
  });

  // ── 3) 페이지 전환 ───────────────────────────────────
  function initPageTransition() {
    if (entering) {
      // 덮인 상태로 한 프레임 그린 뒤 걷어낸다
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.classList.add("pt-entering");
          setTimeout(function () {
            root.classList.remove("pt-enter", "pt-entering");
          }, 900);
        });
      });
    }

    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      if (a.origin !== location.origin) return;
      // 같은 페이지 안의 해시 이동은 그대로 둔다
      if (a.pathname === location.pathname && a.search === location.search) return;

      e.preventDefault();
      var href = a.href;
      writeFlag();
      root.classList.add("pt-leave");
      setTimeout(function () {
        location.href = href;
      }, LEAVE_MS);
    });

    // 뒤로가기(bfcache)로 돌아오면 덮인 채로 멈춰 있지 않게 푼다
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) {
        root.classList.remove("pt-leave", "pt-enter", "pt-entering");
      }
    });
  }

  // ── 1) 스크롤 등장 + 2) 숫자 카운팅 ──────────────────
  // 섹션의 직계 자식을 한 덩어리로 본다. 같은 타이밍에 들어온 덩어리끼리는
  // 시차(STAGGER)를 두고 차례로 올라온다.
  var TARGETS = [
    "main section > *",
    ".wk-col > *",
    ".ct-row > *",
    // 푸터 워드마크는 .ft-hero 가 overflow: hidden 이라 마스크 안에서 올라온다.
    // .ft-bar 는 페이지 맨 끝이라 내려가 있는 동안 문서 높이를 늘리므로 뺀다.
    ".ft-hero-content",
  ].join(",");
  var STAGGER = 90;
  var DURATION = 1100; // base.css .mo-reveal transition 과 맞춘다

  function initReveal(startDelay) {
    if (!("IntersectionObserver" in window)) return;

    var els = Array.prototype.filter.call(
      document.querySelectorAll(TARGETS),
      function (el) {
        // 스크린리더 전용 · 장식 오버레이 · 숨은 요소는 건드리지 않는다
        if (el.classList.contains("sr-only")) return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        return el.offsetParent !== null || getComputedStyle(el).position === "fixed";
      }
    );

    els.forEach(function (el) {
      el.classList.add("mo-reveal");
    });

    var queue = [];
    var flushing = false;

    function flush() {
      flushing = false;
      // 화면 위→아래, 왼→오 순서로 차례를 매긴다
      queue.sort(function (a, b) {
        var ra = a.getBoundingClientRect();
        var rb = b.getBoundingClientRect();
        return ra.top - rb.top || ra.left - rb.left;
      });
      queue.forEach(function (el, i) {
        var delay = i * STAGGER;
        el.style.transitionDelay = delay + "ms";
        el.classList.add("is-in");
        startCounters(el, delay);
        // 끝나면 클래스를 걷어 원래 CSS(transition·opacity 등)로 돌려준다
        setTimeout(function () {
          el.classList.remove("mo-reveal", "is-in");
          el.style.transitionDelay = "";
        }, delay + DURATION + 50);
      });
      queue = [];
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          queue.push(entry.target);
        });
        if (queue.length && !flushing) {
          flushing = true;
          requestAnimationFrame(flush);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 }
    );

    setTimeout(function () {
      els.forEach(function (el) {
        io.observe(el);
      });
    }, startDelay);
  }

  // "1986" / "10+" 같은 텍스트를 숫자 + 접미사로 나눠 0 부터 센다
  var COUNT_MS = 1800;

  function startCounters(scope, delay) {
    var nums = scope.matches(".ab-stat-num")
      ? [scope]
      : scope.querySelectorAll(".ab-stat-num");
    Array.prototype.forEach.call(nums, function (el) {
      var m = /^(\D*)(\d+)(.*)$/.exec(el.textContent.trim());
      if (!m) return;
      var prefix = m[1];
      var target = parseInt(m[2], 10);
      var suffix = m[3];
      el.textContent = prefix + "0" + suffix;

      setTimeout(function () {
        var t0 = null;
        function tick(now) {
          if (t0 === null) t0 = now;
          var p = Math.min((now - t0) / COUNT_MS, 1);
          var eased = 1 - Math.pow(1 - p, 4); // quart-out: 빠르게 올라가다 끝에서 붙는다
          el.textContent = prefix + Math.round(target * eased) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }, delay + 150);
    });
  }
})();
