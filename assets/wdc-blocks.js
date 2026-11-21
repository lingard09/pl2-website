/* CMS 새 페이지 인터랙션 블록 (11.20 CMS 피드백). 스타일과 블록 목록은 assets/wdc-blocks.css.
   원본 스크립트(wd1-strip · wd1-stack · compare · wd7-code · wd9-carousel · wd-magnet-story)의 타이밍을 그대로 옮기고,
   한 페이지에 같은 블록이 여러 개 있어도 각자 돌도록 블록마다 따로 만든다. */
(function () {
  var mq = function (q) {
    return window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener: function () {} };
  };
  var reduce = mq("(prefers-reduced-motion: reduce)").matches;
  var pc = mq("(min-width: 600px)");
  var each = function (sel, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(sel), fn);
  };
  function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  // 고정 구간에서 얼마나 내려왔는지 0~1 (box = 바깥 긴 칸, pin = 화면에 붙는 칸)
  function progress(box, pin) {
    var r = box.getBoundingClientRect();
    var top = parseFloat(getComputedStyle(pin).top) || 0;
    var dist = box.offsetHeight - pin.offsetHeight;
    return dist > 0 ? clamp((top - r.top) / dist) : 0;
  }
  // 스크롤·크기 바뀜을 한 프레임에 한 번만
  function onScroll(fn) {
    var queued = false;
    var run = function () {
      queued = false;
      fn();
    };
    var q = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
    };
    window.addEventListener("scroll", q, { passive: true });
    window.addEventListener("resize", q);
    window.addEventListener("load", q);
    return q;
  }
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

  // ── 필름스트립 (상세 01) ─────────────────────────────
  // 칸 k: 0 = 가운데 큰 칸, 음수 = 왼쪽, 양수 = 오른쪽. 스크롤 구간을 장 수로 나눠 칸이 바뀔 때마다 한 장이 탁 넘어간다.
  function geom(k) {
    if (k === 0) return [1060, 0, 518, 740];
    var left = k < 0 ? 1060 - 212 * -k : 1590 + 212 * (k - 1);
    return [left, 440, 200, 300];
  }
  each("[data-wdc-strip]", function (box) {
    var pin = box.querySelector(".wdc-strip-pin");
    var imgs = Array.prototype.slice.call(box.querySelectorAll(".wdc-strip-track img"));
    var N = imgs.length;
    var HALF = N / 2;
    var STEPS = Math.max(0, parseInt(box.getAttribute("data-steps"), 10) || 0);
    box.style.setProperty("--steps", String(STEPS));
    // 목록의 첫 장이 가운데, 다음 장들이 왼쪽으로 차례로 (왼쪽 → 오른쪽으로 굴러 차례로 가운데에 온다)
    var base = imgs.map(function (img, i) {
      return -i;
    });
    var u = 1;
    var cur = 0;
    var target = 0;
    var from = 0;
    var t0 = 0;
    var raf = 0;
    var MOVE_MS = 520;
    function render(shift) {
      if (!pc.matches) return;
      imgs.forEach(function (img, i) {
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
    function tick(now) {
      var k = clamp((now - t0) / MOVE_MS);
      cur = from + (target - from) * (1 - Math.pow(1 - k, 3));
      render(cur);
      raf = k < 1 ? requestAnimationFrame(tick) : 0;
    }
    function goTo(next) {
      if (next === target) return;
      from = cur;
      target = next;
      t0 = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    }
    var first = true;
    onScroll(function () {
      if (!pc.matches) {
        imgs.forEach(function (img) {
          img.style.left = img.style.top = img.style.width = img.style.height = "";
        });
        first = true;
        return;
      }
      u = Math.min(window.innerWidth / 1920, 1);
      box.style.setProperty("--strip-pin", pin.offsetHeight + "px");
      var next = reduce ? 0 : Math.min(STEPS, Math.floor(progress(box, pin) * (STEPS + 1)));
      if (first) {
        // 처음(새로고침 위치·크기 바꿈)은 넘기는 모션 없이 제자리에
        first = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        cur = target = next;
        render(cur);
        return;
      }
      goTo(next);
    })();
    window.addEventListener("resize", function () {
      first = true;
    });
  });

  // ── 레이어 얹힘 (상세 01) ────────────────────────────
  // 세트마다 4.5초: 나타남 → 이미지가 1초 간격으로 100 아래에서 올라와 얹힘 → 사라짐 → 다음 세트.
  // 스크롤 양을 이 타임라인에 맞추고, 보이는 시점이 매 프레임 12% 씩 따라가 부드럽게 얹힌다.
  var SET = 4.5;
  var RISE_START = 0.6035;
  var RISE_GAP = 1;
  var RISE_TIME = 0.8965;
  var FADE_IN = 0.8;
  var HOLD_END = 3.5;
  var easeRise = bezier(0.22, 1, 0.36, 1);
  var easeIn = bezier(0.42, 0, 0.58, 1);
  function easeOut(p) {
    return 1 - Math.exp(-p * 11.1803) * (Math.cos(p * 0.1581) + 70.7054 * Math.sin(p * 0.1581));
  }
  each("[data-wdc-stack]", function (box) {
    var sets = Array.prototype.map.call(box.querySelectorAll(".wdc-stack-set"), function (el) {
      return { el: el, imgs: Array.prototype.slice.call(el.querySelectorAll("img")) };
    });
    if (!sets.length) return;
    box.style.setProperty("--sets", String(sets.length));
    if (reduce || !pc.matches) return; // CSS 가 마지막 세트를 얹힌 모양으로 보여 준다
    box.classList.add("is-on");
    var pin = box.querySelector(".wdc-stack-pin");
    var END = (sets.length - 1) * SET + HOLD_END; // 마지막 세트가 다 얹힌 지점
    var unit = 1;
    function render(t) {
      sets.forEach(function (s, n) {
        var local = t - n * SET;
        var last = n === sets.length - 1;
        if (local < 0 || (local >= SET && !last)) {
          s.el.style.opacity = "0";
          return;
        }
        var a = local < FADE_IN ? easeIn(local / FADE_IN) : local < HOLD_END || last ? 1 : 1 - easeOut(clamp((local - HOLD_END) / (SET - HOLD_END)));
        s.el.style.opacity = a.toFixed(3);
        s.imgs.forEach(function (img, i) {
          var e = easeRise(clamp((local - RISE_START - i * RISE_GAP) / RISE_TIME));
          img.style.opacity = e.toFixed(3);
          img.style.translate = "0 " + (100 * unit * (1 - e)).toFixed(2) + "px";
        });
      });
    }
    var FOLLOW = 0.12;
    var cur = -1;
    var target = 0;
    var raf = 0;
    function tick() {
      raf = 0;
      var d = target - cur;
      if (Math.abs(d) < 0.002) cur = target;
      else cur += d * FOLLOW;
      render(cur);
      if (cur !== target) raf = requestAnimationFrame(tick);
    }
    onScroll(function () {
      unit = Math.min(window.innerWidth / 1920, 1);
      target = END * progress(box, pin);
      if (cur < 0) {
        cur = target;
        render(cur);
        return;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    })();
  });

  // ── 보정 전/후 비교 (상세 05) ────────────────────────
  // 어디서든 누른 채 좌우로 끌면 경계가 따라온다. ←/→ 버튼은 10%, 경계선에 포커스를 두고 ←/→ 5%.
  each(".wdc-compare", function (box) {
    var handle = box.querySelector(".wdc-compare-handle");
    var dragging = false;
    var fromBtn = null;
    var startX = 0;
    var grabOffset = 0;
    var moved = false;
    var stepTimer = null;
    function now() {
      return parseFloat(box.style.getPropertyValue("--pos")) || 50;
    }
    function set(pct) {
      pct = Math.max(0, Math.min(100, pct));
      box.style.setProperty("--pos", pct + "%");
      if (handle) handle.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
    function stepBy(delta) {
      box.classList.add("is-stepping");
      set(now() + delta);
      clearTimeout(stepTimer);
      stepTimer = setTimeout(function () {
        box.classList.remove("is-stepping");
      }, 500);
    }
    Array.prototype.forEach.call(box.querySelectorAll(".wdc-compare-btn"), function (btn) {
      var delta = btn.classList.contains("wdc-compare-btn--prev") ? -10 : 10;
      btn.dataset.delta = String(delta);
      btn.addEventListener("click", function (e) {
        if (e.detail === 0) stepBy(delta); // 보조기기의 click (마우스·터치는 pointerup)
      });
    });
    box.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      box.classList.remove("is-stepping");
      dragging = true;
      moved = false;
      startX = e.clientX;
      box.setPointerCapture(e.pointerId);
      fromBtn = e.target.closest ? e.target.closest(".wdc-compare-btn") : null;
      var r = box.getBoundingClientRect();
      if (fromBtn) grabOffset = e.clientX - (r.left + (r.width * now()) / 100);
      else set(((e.clientX - r.left) / r.width) * 100);
    });
    box.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var r = box.getBoundingClientRect();
      if (!fromBtn) {
        set(((e.clientX - r.left) / r.width) * 100);
        return;
      }
      if (!moved && Math.abs(e.clientX - startX) < 4) return;
      moved = true;
      set(((e.clientX - grabOffset - r.left) / r.width) * 100);
    });
    box.addEventListener("pointerup", function () {
      if (dragging && fromBtn && !moved) stepBy(Number(fromBtn.dataset.delta));
      dragging = false;
      fromBtn = null;
    });
    box.addEventListener("pointercancel", function () {
      dragging = false;
      fromBtn = null;
    });
    if (handle) {
      handle.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = now() - 5;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") next = now() + 5;
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = 100;
        if (next === null) return;
        e.preventDefault();
        set(next);
      });
    }
  });

  // ── 두 장 스크롤 전환 (상세 07) ──────────────────────
  // 고정 구간의 가운데 절반 동안 둘째 장이 위에서 아래로 덮어 내린다 (앞뒤 1/4 은 머문다)
  each("[data-wdc-wipe]", function (box) {
    var pin = box.querySelector(".wdc-wipe-pin");
    var b = pin && pin.querySelectorAll("img")[1];
    if (!b || reduce) return;
    onScroll(function () {
      if (!pc.matches) {
        b.style.opacity = b.style.clipPath = "";
        return;
      }
      box.style.setProperty("--band-h", pin.offsetHeight + "px");
      var p = progress(box, pin);
      var t = clamp((p - 0.25) / 0.5);
      var e = t * t * (3 - 2 * t);
      b.style.opacity = e > 0 ? "1" : "0";
      b.style.clipPath = "inset(0 0 " + ((1 - e) * 100).toFixed(2) + "% 0)";
    })();
  });

  // ── 스크롤 캐러셀 (상세 09) ──────────────────────────
  // PC: 화면에 고정한 채 스크롤 구간을 장 수로 나눠 구간마다 한 장. 모바일: 3초마다 자동, 마지막 → 첫 장은 복제본으로 이어 돈다.
  each("[data-wdc-slide]", function (outer) {
    var root = outer.querySelector(".wdc-slide");
    var track = root.querySelector(".wdc-slide-track");
    var dots = Array.prototype.slice.call(root.querySelectorAll(".wdc-slide-dots span"));
    var COUNT = dots.length;
    if (COUNT < 2) return;
    outer.style.setProperty("--steps", String(COUNT - 1));
    var index = 0;
    function paint() {
      track.style.transform = "translateX(" + -index * 100 + "%)";
      dots.forEach(function (d, i) {
        d.classList.toggle("is-active", i === index % COUNT);
      });
    }
    track.addEventListener("transitionend", function () {
      if (index < COUNT) return;
      track.classList.add("is-wrapping");
      index = 0;
      paint();
      void track.offsetWidth;
      track.classList.remove("is-wrapping");
    });
    if (reduce) return;
    var timer = null;
    var visible = false;
    function sync() {
      var run = visible && !document.hidden && !pc.matches;
      if (run && !timer)
        timer = setInterval(function () {
          index += 1;
          paint();
        }, 3000);
      if (!run && timer) {
        clearInterval(timer);
        timer = null;
      }
    }
    onScroll(function () {
      sync();
      if (!pc.matches) return;
      outer.style.setProperty("--band-h", root.offsetHeight + "px");
      var next = Math.max(0, Math.min(COUNT - 1, Math.floor(progress(outer, root) * COUNT)));
      if (next !== index) {
        index = next;
        paint();
      }
    })();
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        sync();
      }).observe(root);
    } else visible = true;
    document.addEventListener("visibilitychange", sync);
  });

  // ── 모바일 가로 넘김 점 (챕터 사진) ──────────────────
  each("[data-wdc-swipe]", function (root) {
    var track = root.querySelector(".wdc-ch-mo-track");
    var n = track ? track.children.length : 0;
    if (n < 2) return;
    var dotsEl = document.createElement("div");
    dotsEl.className = "wdc-dots";
    dotsEl.setAttribute("aria-hidden", "true");
    for (var i = 0; i < n; i++) dotsEl.appendChild(document.createElement("span"));
    root.appendChild(dotsEl);
    var dots = dotsEl.children;
    var current = -1;
    function paint() {
      var w = track.clientWidth;
      var k = w ? Math.max(0, Math.min(n - 1, Math.round(track.scrollLeft / w))) : 0;
      if (k === current) return;
      if (current >= 0) dots[current].classList.remove("is-active");
      dots[k].classList.add("is-active");
      current = k;
    }
    track.addEventListener("scroll", function () { requestAnimationFrame(paint); }, { passive: true });
    paint();
  });

  // ── 스크롤 챕터 (상세 02 · 13) ───────────────────────
  // 왼쪽 사진은 카드마다 다른 속도로 올라오다 챕터가 화면 가운데 오면 정한 자리에 맞고,
  // 오른쪽 목록은 화면에 고정된 채 지금 챕터가 커지고 설명이 펼쳐진다. 모바일은 위에서 아래로 쌓는다.
  var SPEEDS = [0.2, 0.1, 0.3, 0.15, 0.25, 0.05];
  each("[data-wdc-ch]", function (story) {
    var started = false;
    function init() {
      if (started || !pc.matches) return;
      started = true;
      var secs = Array.prototype.slice.call(story.querySelectorAll(".wdc-ch-sec"));
      if (!secs.length) return;
      var rail = document.createElement("div");
      rail.className = "wdc-ch-rail";
      var anchor = document.createElement("div");
      anchor.className = "wdc-ch-anchor";
      var list = document.createElement("div");
      list.className = "wdc-ch-list";
      var items = secs.map(function (s) {
        var text = s.querySelector(".wdc-ch-text");
        var item = document.createElement("div");
        var head = text.querySelector(".wdc-ch-head");
        if (head) item.appendChild(head.cloneNode(true));
        var desc = text.querySelector(".wdc-ch-desc");
        if (desc) {
          var fold = document.createElement("div");
          fold.className = "wdc-ch-fold";
          fold.appendChild(desc.cloneNode(true));
          item.appendChild(fold);
        }
        list.appendChild(item);
        return item;
      });
      anchor.appendChild(list);
      rail.appendChild(anchor);
      story.appendChild(rail);
      story.classList.add("is-on");

      var chapters = secs.map(function (s) {
        return {
          el: s,
          cards: Array.prototype.map.call(s.querySelectorAll(".wdc-ch-card"), function (el, i) {
            return { el: el, k: SPEEDS[i % SPEEDS.length], y: null };
          }),
        };
      });
      var current = -1;
      var raf = null;
      var last = 0;
      function frame(t) {
        var dt = last ? Math.min(t - last, 64) : 16.7;
        last = t;
        var ratio = 1 - Math.pow(1 - 0.14, dt / 16.7);
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
            card.y = card.y === null ? goal : card.y + (goal - card.y) * ratio;
            if (Math.abs(goal - card.y) > 0.1) moving = true;
            else card.y = goal;
            card.el.style.transform = "translate3d(0," + card.y.toFixed(2) + "px,0)";
          });
        });
        if (best !== current) {
          current = best;
          items.forEach(function (it, n) {
            it.classList.toggle("is-active", n === best);
          });
        }
        if (moving) raf = requestAnimationFrame(frame);
        else {
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
    init();
    // 모바일로 연 뒤 PC 폭으로 넓히면 그때 켠다
    if (!started && pc.addEventListener) pc.addEventListener("change", init);
  });
})();
