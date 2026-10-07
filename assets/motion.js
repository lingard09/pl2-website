/* 공통 모션 (모든 페이지 공유) — 피그마 "PC 모션피드백_0928" (2836:11814)
   1) 스크롤 등장: 콘텐츠가 아래에서 위로 "쓱쓱쓱" 붙는다 (참고: WeTransfer Ideas Report 2021,
      그보다 조금 더 텐션 있게 → 이동 거리를 키우고 expo-out 이징)
   2) About 통계 숫자 카운팅
   3) 페이지 전환: 노란 패널이 아래에서 덮고 위로 빠진다 (참고: koto.com/work)
      탭에서 사이트를 처음 열 때도 같은 패널이 덮인 채로 시작해 위로 걷히는 인트로를 보여준다.

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
  var VISITED_KEY = "pl2-visited"; // 탭(세션)당 한 번만 인트로를 보여준다
  var INTRO_HOLD_MS = 450; // 인트로는 덮인 채로 잠깐 머문 뒤 걷힌다
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

  // 이번 탭에서 처음 여는 페이지면 true. 저장소가 막혀 있으면 매번 인트로가
  // 뜨지 않도록 "이미 봤다" 쪽으로 친다.
  function firstVisit() {
    try {
      if (sessionStorage.getItem(VISITED_KEY)) return false;
      sessionStorage.setItem(VISITED_KEY, "1");
      return true;
    } catch (e) {
      return false;
    }
  }

  // ── 첫 페인트 전 ─────────────────────────────────────
  root.classList.add("mo-on");
  var entering = readFlag();
  var intro = firstVisit() && !entering;
  var hold = intro ? INTRO_HOLD_MS : 0;
  if (entering || intro) root.classList.add("pt-enter");

  document.addEventListener("DOMContentLoaded", function () {
    initPageTransition();
    // 전환 패널이 걷히는 중이면 등장 모션을 그만큼 늦춘다
    initReveal(entering || intro ? hold + 350 : 0);
  });

  // ── 3) 페이지 전환 ───────────────────────────────────
  function initPageTransition() {
    if (entering || intro) {
      // 덮인 상태로 한 프레임 그린 뒤 (인트로면 잠깐 머물렀다가) 걷어낸다
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          setTimeout(function () {
            root.classList.add("pt-entering");
            setTimeout(function () {
              root.classList.remove("pt-enter", "pt-entering");
            }, 900);
          }, hold);
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
  // 스크롤로 왔다갔다 할 때마다 다시 돈다: 화면 밖으로 완전히 나가면 조용히
  // 숨김 상태로 되돌리고, 다시 들어오면 또 등장한다. 아래로 내려갈 땐 아래에서
  // 올라오고, 위로 올라갈 땐 위에서 내려온다 (스크롤 방향을 거스르지 않게).
  var TARGETS = [
    "main section > *",
    ".wk-col > *",
    ".ct-row > *",
    // 푸터는 글자만이 아니라 노란 블록 전체가 한 덩어리로 올라온다 (PC 피드백_0930).
    // 움직이는 건 .ft 의 자식들이고 .ft 가 overflow: clip 이라, 내려가 있는 동안에도
    // 문서 높이가 늘지 않는다 (base.css 의 .ft 등장 규칙).
    ".ft",
  ].join(",");
  var STAGGER = 90;
  var DURATION = 1100; // base.css .mo-anim transition 과 맞춘다

  function initReveal(startDelay) {
    if (!("IntersectionObserver" in window)) return;

    // HTML 에서 data-reveal 을 붙인 요소는 묶음이 아니라 하나씩 따로 등장한다
    // (예: 상세 07 Main/Support/Forum 이미지 3장). 그걸 품은 상위 덩어리는
    // 대상에서 빼야 이동이 겹치지 않는다.
    var singles = document.querySelectorAll("[data-reveal]");
    var els = Array.prototype.filter.call(
      document.querySelectorAll(TARGETS + ",[data-reveal]"),
      function (el) {
        // 스크린리더 전용 · 장식 오버레이 · 숨은 요소는 건드리지 않는다
        if (el.classList.contains("sr-only")) return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        if (!el.hasAttribute("data-reveal")) {
          for (var i = 0; i < singles.length; i++) {
            if (el.contains(singles[i])) return false;
          }
        }
        return el.offsetParent !== null || getComputedStyle(el).position === "fixed";
      }
    );

    // 화면 위쪽에 있으면 위에서, 아래쪽에 있으면 아래에서 들어오게 방향을 정한다
    function hide(el) {
      clearTimeout(el._moTimer);
      el.classList.remove("mo-anim");
      el.style.transitionDelay = "";
      var above = el.getBoundingClientRect().bottom <= 0;
      el.style.setProperty("--mo-dir", above ? "-1" : "1");
      el.classList.add("mo-out");
    }

    els.forEach(function (el) {
      el.classList.add("mo-reveal");
      hide(el);
    });

    var queue = [];
    var flushing = false;

    function flush() {
      flushing = false;
      // 들어오는 쪽 가장자리에 가까운 것부터 차례를 매긴다
      // (아래에서 들어오면 위→아래, 위에서 들어오면 아래→위)
      queue.sort(function (a, b) {
        var ra = a.getBoundingClientRect();
        var rb = b.getBoundingClientRect();
        var dir = a.style.getPropertyValue("--mo-dir") === "-1" ? -1 : 1;
        return dir * (ra.top - rb.top) || ra.left - rb.left;
      });
      queue.forEach(function (el, i) {
        var delay = i * STAGGER;
        el.style.transitionDelay = delay + "ms";
        el.classList.add("mo-anim");
        el.classList.remove("mo-out");
        startCounters(el, delay);
        // 끝나면 transition 을 걷어 원래 CSS(호버 전환 등)로 돌려준다
        el._moTimer = setTimeout(function () {
          el.classList.remove("mo-anim");
          el.style.transitionDelay = "";
        }, delay + DURATION + 50);
      });
      queue = [];
    }

    // 등장: 아래쪽 8% 는 빼서 화면 안으로 조금 들어온 뒤에 움직이게 한다
    var enterIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var el = entry.target;
          if (!entry.isIntersecting || !el.classList.contains("mo-out")) return;
          if (queue.indexOf(el) === -1) queue.push(el);
        });
        if (queue.length && !flushing) {
          flushing = true;
          requestAnimationFrame(flush);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 }
    );

    // 퇴장: 화면 밖으로 완전히 나갔을 때만 되돌린다 (보이는 채로 사라지지 않게)
    var exitIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) return;
          var el = entry.target;
          if (el.classList.contains("mo-out")) {
            // 아직 안 나타난 채 반대편으로 넘어갔으면 방향만 고친다
            hide(el);
            return;
          }
          hide(el);
          stopCounters(el);
        });
      },
      { rootMargin: "0px", threshold: 0 }
    );

    setTimeout(function () {
      els.forEach(function (el) {
        enterIO.observe(el);
        exitIO.observe(el);
      });
    }, startDelay);
  }

  // "1986" / "10+" 같은 텍스트를 숫자 + 접미사로 나눠 0 부터 센다.
  // 원래 값은 data-count 에 한 번만 보관해서 다시 셀 때도 같은 목표로 간다.
  var COUNT_MS = 1800;

  function counterEls(scope) {
    return scope.matches(".ab-stat-num")
      ? [scope]
      : Array.prototype.slice.call(scope.querySelectorAll(".ab-stat-num"));
  }

  function stopCounters(scope) {
    counterEls(scope).forEach(function (el) {
      clearTimeout(el._moCountTimer);
      if (el._moCountRaf) cancelAnimationFrame(el._moCountRaf);
      if (el.dataset.count) el.textContent = el.dataset.count;
    });
  }

  function startCounters(scope, delay) {
    counterEls(scope).forEach(function (el) {
      if (!el.dataset.count) el.dataset.count = el.textContent.trim();
      var m = /^(\D*)(\d+)(.*)$/.exec(el.dataset.count);
      if (!m) return;
      var prefix = m[1];
      var target = parseInt(m[2], 10);
      var suffix = m[3];
      stopCounters(el);
      el.textContent = prefix + "0" + suffix;

      el._moCountTimer = setTimeout(function () {
        var t0 = null;
        function tick(now) {
          if (t0 === null) t0 = now;
          var p = Math.min((now - t0) / COUNT_MS, 1);
          var eased = 1 - Math.pow(1 - p, 4); // quart-out: 빠르게 올라가다 끝에서 붙는다
          el.textContent = prefix + Math.round(target * eased) + suffix;
          if (p < 1) el._moCountRaf = requestAnimationFrame(tick);
        }
        el._moCountRaf = requestAnimationFrame(tick);
      }, delay + 150);
    });
  }
})();
