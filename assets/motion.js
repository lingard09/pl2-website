/* 공통 모션 (모든 페이지 공유) — 피그마 "PC 모션피드백_0928" (2836:11814)
   1) 스크롤 등장: 콘텐츠가 화면 아래에서 순서대로 끌려 올라와 앞선 요소에 붙는 마그네틱 모션
      (수정사항_11.09, 피그마 코드 레이어 PL2 Works Magnetic Scroll 을 Home 제외 전 페이지 기준으로).
      투명도·기울기 없이 출발하고, 도착 직전 미세하게 튕기며 정착한다.
      Works 2열 카드는 works.js 가 코드 레이어 그대로 스프링으로 움직인다.
   2) About 통계 숫자 카운팅
   3) 페이지 전환: 노란 패널이 아래에서 덮고 위로 빠진다 (참고: koto.com/work)
      Home → Works 만 다르다 (PC 피드백_0930, 피그마 슬라이드 8·9): Home 화면이 위로 밀려
      올라가고, Works 는 첫 화면 카드가 아래에서 하나씩 쏙쏙 붙은 뒤(8), 카드가 모두
      자리 잡으면 메뉴바가 위에서 툭 떨어진다(9).
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
  var LEAVE_MS = 500; // base.css html.pt-leave::after 의 transition 과 맞춘다
  var PUSH_LEAVE_MS = 650; // base.css html.pt-push-leave 와 맞춘다
  var PUSH_CARD_MS = 1000; // base.css .is-push transition 과 맞춘다
  var PUSH_CARD_STEP = 120; // 카드 사이 시차
  var PUSH_GNB_MS = 700; // base.css 메뉴바 떨어지는 시간
  var pushTotal = 0; // 첫 화면 카드가 모두 붙는 데 걸리는 시간 (initPageTransition 이 계산)

  // "1" = 노란 패널 전환, "push" = Home → Works 밀어 올리기 전환
  function readFlag() {
    try {
      var v = sessionStorage.getItem(PT_KEY);
      sessionStorage.removeItem(PT_KEY);
      return v;
    } catch (e) {
      return null;
    }
  }

  function writeFlag(v) {
    try {
      sessionStorage.setItem(PT_KEY, v || "1");
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
  var flag = readFlag();
  var pushing = flag === "push";
  var entering = flag === "1";
  var intro = firstVisit() && !flag;
  var hold = intro ? INTRO_HOLD_MS : 0;
  if (entering || intro) root.classList.add("pt-enter");
  if (pushing) root.classList.add("pt-push-enter");
  // Home → Works: 카드가 다 붙기 전에 스크롤하면 아래에서 올라오던 카드들과 스크롤이
  // 겹쳐 화면이 위아래로 흔들려 보였다. 페이지가 열리자마자(본문 파싱 전) 스크롤 입력을
  // 막고, 카드가 모두 붙으면 initPageTransition 이 푼다.
  // (overflow: hidden 은 스크롤바가 사라졌다 생기며 카드가 옆으로 튀어서 쓰지 않는다)
  var unlockScroll = pushing ? lockScroll() : null;

  // 공간 모션 시범 (스크롤·모션 개선 문의, 2026-10-27): <html data-motion="space"> 인 페이지는
  // 데스크톱(마우스·트랙패드, 폭 1024 이상)에서 등장 모션을 space-motion.js 에 맡긴다.
  // 터치 기기·좁은 화면은 지금의 등장 모션을 그대로 쓴다.
  var space =
    root.getAttribute("data-motion") === "space" &&
    window.matchMedia("(pointer: fine) and (min-width: 1024px)").matches;
  if (space) root.classList.add("sp-on");

  document.addEventListener("DOMContentLoaded", function () {
    initPageTransition();
    // 전환 패널이 걷히는 중이면 등장 모션을 그만큼 늦춘다.
    // 밀어 올리기로 들어올 때는 첫 화면 콘텐츠가 페이지와 함께 올라오므로
    // 첫 화면 안의 요소는 따로 등장시키지 않는다.
    // 밀어 올리기 중에는 첫 화면 카드가 화면 밖에서 출발해서, 관찰을 바로 시작하면
    // "화면 밖"으로 판정돼 숨겨진다. 카드가 모두 붙은 뒤부터 관찰한다.
    if (space) return;
    initReveal(pushing ? pushTotal + 100 : entering || intro ? hold + 350 : 0, pushing);
  });

  // ── 3) 페이지 전환 ───────────────────────────────────
  function initPageTransition() {
    if (pushing) {
      // 슬라이드 8: 첫 화면에 걸리는 카드만 위→아래, 왼→오 순서로 하나씩 붙인다.
      // (CSS 가 모든 카드를 화면 한 높이 아래에 두고 시작하므로 그만큼 빼서 판정)
      var vh = window.innerHeight;
      var cards = Array.prototype.filter.call(
        document.querySelectorAll(".wk-card"),
        function (el) {
          return el.getBoundingClientRect().top - vh < vh;
        }
      );
      cards.sort(function (a, b) {
        var ra = a.getBoundingClientRect();
        var rb = b.getBoundingClientRect();
        return ra.top - rb.top || ra.left - rb.left;
      });
      cards.forEach(function (el, i) {
        el.classList.add("is-push");
        el.style.transitionDelay = i * PUSH_CARD_STEP + "ms";
      });
      pushTotal = Math.max(0, cards.length - 1) * PUSH_CARD_STEP + PUSH_CARD_MS;
      // 슬라이드 9: 카드가 모두 자리 잡은 뒤 메뉴바가 떨어진다
      root.style.setProperty("--pt-gnb-delay", pushTotal - 150 + "ms");

      // 스크롤 잠금(<head> 에서 걸었다)은 카드가 모두 붙으면 푼다
      setTimeout(unlockScroll, pushTotal);

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.classList.add("pt-push-in");
          setTimeout(function () {
            root.classList.remove("pt-push-enter", "pt-push-in");
            root.style.removeProperty("--pt-gnb-delay");
            cards.forEach(function (el) {
              el.classList.remove("is-push");
              el.style.transitionDelay = "";
            });
          }, pushTotal + PUSH_GNB_MS);
        });
      });
    }

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
      // Home → Works 는 밀어 올리기 전환
      var push =
        document.body.classList.contains("hm-body") &&
        /(^|\/)works(\.html|\/)?$/.test(a.pathname); // 배포본은 works/ (tools/pretty-urls.py)
      writeFlag(push ? "push" : "1");
      root.classList.add(push ? "pt-push-leave" : "pt-leave");
      setTimeout(function () {
        location.href = href;
      }, push ? PUSH_LEAVE_MS : LEAVE_MS);
    });

    // 뒤로가기(bfcache)로 돌아오면 덮인 채로 멈춰 있지 않게 푼다
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) {
        root.classList.remove(
          "pt-leave",
          "pt-enter",
          "pt-entering",
          "pt-push-leave",
          "pt-push-enter",
          "pt-push-in"
        );
      }
    });
  }

  // 휠·터치·키보드 스크롤을 막고, 푸는 함수를 돌려준다 (Home → Works 카드가 붙는 동안)
  function lockScroll() {
    var KEYS = { " ": 1, PageDown: 1, PageUp: 1, ArrowDown: 1, ArrowUp: 1, Home: 1, End: 1 };
    var opts = { passive: false };
    function block(e) {
      if (e.type === "keydown" && !KEYS[e.key]) return;
      e.preventDefault();
    }
    window.addEventListener("wheel", block, opts);
    window.addEventListener("touchmove", block, opts);
    window.addEventListener("keydown", block, opts);
    return function () {
      window.removeEventListener("wheel", block, opts);
      window.removeEventListener("touchmove", block, opts);
      window.removeEventListener("keydown", block, opts);
    };
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
  // 수정사항_11.12: 올라오는 타이밍을 빠르게 (1.6초 → 1초, 시차 130 → 90)
  var STAGGER = 90; // 하나씩 차례로 출발하는 간격
  var STAGGER_MAX = 540; // 한꺼번에 많이 들어올 때 뒤쪽이 너무 늦지 않게
  var DURATION = 1000; // base.css .mo-anim transition 과 맞춘다

  function initReveal(startDelay, skipFirstScreen) {
    if (!("IntersectionObserver" in window)) return;

    // HTML 에서 data-reveal 을 붙인 요소는 그 요소 단위로 등장한다.
    // - 묶음 안의 개별 요소에 붙이면 하나씩 따로 (상세 07 이미지 3장, 상세 01 스티커 5행)
    // - 여러 덩어리를 감싼 요소에 붙이면 한 번에 같이 (상세 01 스트립 + 캡션)
    // 그걸 품은 상위 덩어리와 그 안쪽 요소는 대상에서 빼야 이동이 겹치지 않는다.
    // data-reveal="pc" 는 PC 에서만 개별 등장한다 (모바일에서 가로 슬라이더가 되는 묶음, 상세 10 폰 4장)
    var twoCol = window.matchMedia("(min-width: 600px)").matches;
    // 모바일 가로 캐러셀(손가락으로 넘기는 줄) 안쪽 칸은 개별 등장에서 뺀다 (11.13 05 MO 코멘트).
    // 옆에 숨어 있는 칸은 화면에 안 들어와 내려간 채로 남았다가, 넘기는 순간 아래에서 올라와
    // "이미지가 손 움직임에 따라 이동"했다. 캐러셀은 통째로 한 번에 올라온다.
    if (!twoCol) {
      // data-reveal-mo: 모바일에서만 그 묶음 전체가 한 번에 올라온다 (11.13 Contact MO: 지도 + 정보 같이)
      Array.prototype.forEach.call(document.querySelectorAll("[data-reveal-mo]"), function (el) {
        el.setAttribute("data-reveal", "");
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-reveal]"), function (el) {
        for (var a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          var ox = getComputedStyle(a).overflowX;
          if (ox === "auto" || ox === "scroll") {
            el.setAttribute("data-reveal", "pc");
            if (!a.hasAttribute("data-reveal")) a.setAttribute("data-reveal", "");
            return;
          }
        }
      });
    }
    var SINGLE = twoCol ? "[data-reveal]" : "[data-reveal]:not([data-reveal=pc])";
    var singles = document.querySelectorAll(SINGLE);
    // 모바일 Works 는 화면에 들어오기 전에 미리 출발해서 빈 화면이 보이지 않게 한다 (수정사항_11.10)
    var early = !twoCol && document.body.classList.contains("wk-body");
    var els = Array.prototype.filter.call(
      document.querySelectorAll(TARGETS + "," + SINGLE),
      function (el) {
        // 스크린리더 전용 · 장식 오버레이 · 숨은 요소는 건드리지 않는다
        if (el.classList.contains("sr-only")) return false;
        // Works 2열 카드는 works.js 가 움직인다 (모바일 1열은 여기서 그대로 등장)
        if (twoCol && el.classList.contains("wk-card")) return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        if (!el.matches(SINGLE)) {
          for (var i = 0; i < singles.length; i++) {
            if (el.contains(singles[i])) return false;
          }
        }
        // 반대로 data-reveal 덩어리 안쪽 요소는 그 덩어리와 같이 움직인다
        // (예: 상세 01 스트립 + 캡션을 한 번에)
        var host = el.parentElement && el.parentElement.closest(SINGLE);
        if (host) return false;
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

    // 밀어 올리기 진입 중에는 본문이 화면 한 높이만큼 내려가 있다
    var shift = skipFirstScreen ? window.innerHeight : 0;
    els.forEach(function (el) {
      el.classList.add("mo-reveal");
      if (skipFirstScreen && el.getBoundingClientRect().top - shift < window.innerHeight) return;
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
      // 위→아래, 왼→오 순서로 하나씩 끌려 올라와 앞선 요소에 붙는다 (수정사항_11.09 마그네틱 모션).
      // 2열이면 자연히 좌 → 우 → 좌 → 우로 번갈아 나온다. 한번 출발하면 CSS 전환이라 끝까지 정착한다.
      queue.forEach(function (el, i) {
        var delay = Math.min(i * STAGGER, STAGGER_MAX);
        // data-reveal-delay="ms" 는 함께 들어와도 정해 둔 간격으로 하나씩 (상세 01 일러스트 4장, 수정사항_11.12)
        var fixed = el.getAttribute("data-reveal-delay");
        if (fixed !== null) delay = parseInt(fixed, 10) || 0;
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

    // 등장 판정은 요소의 "제자리" 기준 (수정사항_11.12, 신세계 시퀀스).
    // 숨은 요소는 출발 거리(base.css .mo-out, PC 최대 320 / 모바일 120)만큼 밀려 있어서, 밀린 위치로
    // 판정하면 제자리가 이미 화면에 보이는데도 한참 비어 있다가 늦게 올라왔다 (글은 올라왔는데 영상은 빈 칸).
    // 판정 영역을 출발 거리만큼 넓혀 제자리가 화면 아래 4% 선을 넘는 순간 출발하게 한다.
    // 같은 화면에 함께 보이는 글과 이미지는 그래서 한 묶음으로 같이 올라온다.
    // 출발 거리는 요소마다 다를 수 있어서(상세 02 파이프라인은 짧게) 실제 거리별로 관찰자를 따로 둔다.
    var vh = window.innerHeight;
    function onEnter(entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        if (!entry.isIntersecting || !el.classList.contains("mo-out")) return;
        if (queue.indexOf(el) === -1) queue.push(el);
      });
      if (queue.length && !flushing) {
        flushing = true;
        requestAnimationFrame(flush);
      }
    }
    var enterIOs = {};
    function enterIOFor(el) {
      var travel = 0;
      if (!early) {
        // .mo-out 이 붙은 상태의 세로 이동 거리 ("0px 320px" → 320)
        var parts = (getComputedStyle(el).translate || "").split(" ");
        travel = Math.abs(parseFloat(parts[1]) || 0);
      }
      var key = early ? "early" : String(Math.round(travel));
      if (!enterIOs[key]) {
        enterIOs[key] = new IntersectionObserver(onEnter, {
          rootMargin: early
            ? "25% 0px 25% 0px"
            : Math.round(travel) + "px 0px " + Math.round(travel - vh * 0.04) + "px 0px",
          threshold: 0,
        });
      }
      return enterIOs[key];
    }

    // 퇴장: 화면 밖으로 완전히 나갔을 때만 되돌린다 (보이는 채로 사라지지 않게)
    var exitIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) return;
          var el = entry.target;
          // 모바일 (수정사항_11.11 #320): 위로 빠져나간 요소는 숨기지 않는다. 손가락으로 되돌려
          // 올릴 때 이미 본 콘텐츠가 위에서 다시 떨어지며 덜컥거렸다. 빠르게 넘겨 등장하지 못한 채
          // 위로 지나간 요소도 제자리에 바로 놓아, 거꾸로 스크롤하면 그대로 보이게 한다.
          // 아래로 빠져나간 요소는 그대로 숨겨 두어 다시 내려가면 아래에서 올라온다.
          if (!twoCol && entry.boundingClientRect.bottom <= 0) {
            clearTimeout(el._moTimer);
            el.classList.remove("mo-anim", "mo-out");
            el.style.transitionDelay = "";
            return;
          }
          if (el.classList.contains("mo-out")) {
            // 아직 안 나타난 채 반대편으로 넘어갔으면 방향만 고친다
            hide(el);
            return;
          }
          hide(el);
          stopCounters(el);
        });
      },
      { rootMargin: early ? "25% 0px 25% 0px" : "0px", threshold: 0 }
    );

    setTimeout(function () {
      els.forEach(function (el) {
        enterIOFor(el).observe(el);
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

  // space-motion.js 가 About 숫자 카운팅을 그대로 쓸 수 있게 내보낸다
  window.PL2Motion = {
    startCounters: function (scope, delay) {
      startCounters(scope, delay || 0);
    },
    stopCounters: function (scope) {
      stopCounters(scope);
    },
  };

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

/* 화면 밖 영상 일시정지 (2026-10-31)
   자동 재생·반복 영상(autoplay + loop)은 화면 밖으로 나가면 멈추고 다시 들어오면 이어서 재생한다.
   Works 처럼 영상 카드가 여러 장인 페이지에서 보이지 않는 영상까지 계속 디코딩하느라
   스크롤이 끊기던 문제. 한 번만 재생하는 영상(Contact 지도)과 재생 버튼 영상은 건드리지 않는다. */
(function () {
  if (!("IntersectionObserver" in window)) return;

  function init() {
    var videos = document.querySelectorAll("video[autoplay][loop]");
    if (!videos.length) return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          var v = e.target;
          if (e.isIntersecting) {
            var p = v.play();
            if (p && p.catch) p.catch(function () {});
          } else if (!v.paused) {
            v.pause();
          }
        });
      },
      { rootMargin: "200px 0px" }
    );
    Array.prototype.forEach.call(videos, function (v) {
      io.observe(v);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* 모바일 가로 슬라이드 자동 넘김 (수정사항_11.10)
   손으로 넘기는 scroll-snap 칸은 그대로 두고, 화면에 보이는 동안 3초마다 다음 장으로 넘긴다.
   손을 대면 멈추고 뗀 뒤 5초가 지나면 이어 간다. 마지막 장 다음은 처음으로 돌아간다. */
(function () {
  if (!("IntersectionObserver" in window)) return;
  if (!window.matchMedia("(max-width: 599.98px)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var INTERVAL = 3000;
  var RESUME = 5000;

  function setup(track) {
    var visible = false;
    var pausedUntil = 0;

    new IntersectionObserver(
      function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
      },
      { threshold: 0.6 }
    ).observe(track);

    function slideWidth() {
      var kids = track.querySelectorAll("*");
      for (var i = 0; i < kids.length; i++) {
        if (getComputedStyle(kids[i]).scrollSnapAlign === "none") continue;
        var w = kids[i].getBoundingClientRect().width;
        if (w) return w + (parseFloat(getComputedStyle(track).columnGap) || 0);
      }
      return track.clientWidth;
    }

    function hold() {
      pausedUntil = Infinity;
    }
    function letGo() {
      pausedUntil = Date.now() + RESUME;
    }
    track.addEventListener("touchstart", hold, { passive: true });
    track.addEventListener("touchend", letGo, { passive: true });
    track.addEventListener("touchcancel", letGo, { passive: true });

    setInterval(function () {
      if (!visible || document.hidden || Date.now() < pausedUntil) return;
      var max = track.scrollWidth - track.clientWidth;
      if (max < 4) return;
      // 한 장씩 민다. order · display: contents 로 DOM 순서와 화면 순서가 달라서 자식 위치 대신 장 폭으로 센다
      var now = track.scrollLeft;
      var w = slideWidth();
      var next = now >= max - 2 ? 0 : Math.min(max, (Math.round(now / w) + 1) * w);
      track.scrollTo({ left: next, behavior: "smooth" });
    }, INTERVAL);
  }

  window.addEventListener("load", function () {
    Array.prototype.forEach.call(document.querySelectorAll("main *"), function (el) {
      var cs = getComputedStyle(el);
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && /x|inline/.test(cs.scrollSnapType)) {
        setup(el);
      }
    });
  });
})();
