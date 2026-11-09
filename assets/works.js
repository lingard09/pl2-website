/* Works 스크롤 모션 — 수정사항_11.09, 피그마 코드 레이어 "PL2 Works Magnetic Scroll" (4051:11856) 을 옮겼다.
   1) 좌우 열 시차: 스크롤에 따라 열마다 다른 속도로 스프링을 따라간다 (역방향 스크롤도 그대로 되돌아간다).
   2) 카드 마그네틱: 각 열 첫 카드를 뺀 카드는 아래(화면 34%, 최대 320)에 내려가 있다가
      스크롤이 해당 지점에 오면 좌 → 우 → 좌 → 우 순서로 110ms 간격 출발해 스프링으로 붙는다.
      한번 출발하면 스크롤을 멈춰도 끝까지 정착한다 (미세한 바운스는 스프링에서 나온다).
   열 시차는 열의 transform, 카드는 카드의 transform 이라 서로 분리돼 있다.
   Home → Works 전환(.is-push)은 translate 를 쓰므로 겹치지 않고, 그 카드들은 전환이 올려 준다.

   코드 레이어와 다른 점: 실제 Works 는 두 열 높이가 달라서, 맨 아래에서 두 열의 끝이 나란히 맞도록
   왼쪽 열에 높이 차만큼 진행도를 더하고, 열이 올라간 만큼 페이지 끝을 줄여 빈 띠가 생기지 않게 한다.
   두 열이 나란할 때만 돈다 (모바일 1열은 motion.js 등장 모션). 동작 줄이기면 아무 것도 안 한다. */
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var grid = document.querySelector(".wk-grid");
  var cols = document.querySelectorAll(".wk-grid > .wk-col");
  if (!grid || cols.length !== 2) return;

  var root = document.documentElement;
  var LEFT_RATE = 0.008;
  var RIGHT_RATE = 0.016;
  var RELEASE_GAP = 110;

  var columns = [
    { el: cols[0], right: false, y: 0, v: 0 },
    { el: cols[1], right: true, y: 0, v: 0 },
  ];

  var states = [];
  Array.prototype.forEach.call(cols, function (col, c) {
    Array.prototype.forEach.call(col.children, function (el, i) {
      states.push({
        el: el,
        seq: i * 2 + c,
        initial: i === 0,
        released: i === 0,
        y: 0,
        v: 0,
        onset: 0,
        top: 0,
      });
    });
  });
  states.sort(function (a, b) {
    return a.seq - b.seq;
  });

  var on = false;
  var inited = false;
  var extra = 0; // 두 열 높이 차 (오른쪽이 더 길다)
  var maxY = 1;
  var frame = 0;
  var lastTime = 0;
  var lastRelease = -Infinity;

  function pull() {
    return Math.min(window.innerHeight * 0.34, 320);
  }

  function docTop(el) {
    var y = 0;
    while (el) {
      y += el.offsetTop;
      el = el.offsetParent;
    }
    return y;
  }

  function measure() {
    var left = cols[0];
    var right = cols[1];
    on = right.offsetTop === left.offsetTop && right.offsetLeft > left.offsetLeft;
    if (!on) {
      grid.style.height = "";
      columns.forEach(function (c) {
        c.el.style.transform = "";
      });
      states.forEach(function (s) {
        s.el.style.transform = "";
      });
      return;
    }

    if (!inited) {
      inited = true;
      var p = pull();
      states.forEach(function (s) {
        // 전환으로 들어오는 첫 화면 카드는 전환이 올려 주므로 처음부터 제자리
        if (s.el.classList.contains("is-push")) {
          s.initial = true;
          s.released = true;
        }
        s.y = s.initial ? 0 : p;
        s.el.style.transform = "translate3d(0," + s.y + "px,0)";
      });
    }

    extra = Math.max(0, right.offsetHeight - left.offsetHeight);
    // 열이 올라간 만큼 그리드 높이를 줄인다 (.wk-main 이 세로 넘침을 자른다)
    grid.style.height = "";
    var y0 = Math.max(1, root.scrollHeight - window.innerHeight);
    var cut = (RIGHT_RATE * y0) / (1 + RIGHT_RATE);
    grid.style.height = (grid.offsetHeight - cut).toFixed(2) + "px";
    maxY = Math.max(1, root.scrollHeight - window.innerHeight);

    var vh = window.innerHeight;
    var prev = -Infinity;
    states.forEach(function (s) {
      s.top = docTop(s.el);
      if (s.initial) return;
      s.onset = Math.max(s.top - vh * 1.26, prev + vh * 0.06);
      prev = s.onset;
    });
    request();
  }

  function columnTarget(c, y) {
    if (c.right) return -y * RIGHT_RATE;
    return -y * LEFT_RATE + (y / maxY) * (extra - LEFT_RATE * maxY);
  }

  // 전환 패널이 덮여 있거나 Home → Works 전환 중이면 카드 출발을 기다린다
  function held() {
    return (
      root.classList.contains("pt-push-enter") ||
      (root.classList.contains("pt-enter") && !root.classList.contains("pt-entering"))
    );
  }

  function animate(time) {
    frame = 0;
    if (!on) return;
    var dt = Math.min((time - lastTime) / 1000, 0.034);
    lastTime = time;
    var y = window.scrollY;
    var moving = false;

    columns.forEach(function (c) {
      var target = columnTarget(c, y);
      c.v += ((target - c.y) * 90 - c.v * 19) * dt;
      c.y += c.v * dt;
      if (Math.abs(target - c.y) < 0.05 && Math.abs(c.v) < 0.05) {
        c.y = target;
        c.v = 0;
      } else {
        moving = true;
      }
      c.el.style.transform = "translate3d(0," + c.y.toFixed(3) + "px,0)";
    });

    var wait = null;
    for (var i = 0; i < states.length; i++) {
      if (!states[i].released && y >= states[i].onset) {
        wait = states[i];
        break;
      }
    }
    if (wait) {
      moving = true;
      if (!held() && time - lastRelease >= RELEASE_GAP) {
        wait.released = true;
        lastRelease = time;
      }
    }

    var p = pull();
    states.forEach(function (s) {
      var target = s.released ? 0 : p;
      s.v += ((target - s.y) * 78 - s.v * 14.5) * dt;
      s.y += s.v * dt;
      if (Math.abs(target - s.y) < 0.08 && Math.abs(s.v) < 0.08) {
        s.y = target;
        s.v = 0;
      } else {
        moving = true;
      }
      s.el.style.transform = "translate3d(0," + s.y.toFixed(3) + "px,0)";
    });

    if (moving) frame = requestAnimationFrame(animate);
  }

  function request() {
    if (!frame && on) {
      lastTime = performance.now();
      frame = requestAnimationFrame(animate);
    }
  }

  window.addEventListener("scroll", request, { passive: true });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 150);
  });
  window.addEventListener("load", measure);
  // motion.js 가 .is-push 를 DOMContentLoaded 에서 붙인 다음 잰다
  requestAnimationFrame(measure);
})();
