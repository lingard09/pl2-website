/* 보정 전/후 비교 슬라이더 (상세 05, PC 피드백_0930)
   .wd5-compare 의 --pos(0~100%) 를 바꿔 왼쪽 '보정 전' 레이어를 그만큼만 보여준다.
   - 이미지 위 어디서든 누른 채 좌우로 끌면 경계가 따라온다 (마우스·터치·펜)
   - 경계선에 포커스를 두고 ←/→ 로 5%, Home/End 로 끝까지
   - 경계선 양옆 ←/→ 버튼: 누르면 10% 씩 (PC 피드백_1015), 끌면 선처럼 따라온다 (수정사항_11.09)
   기본값은 가운데(50%). */
(function () {
  var boxes = document.querySelectorAll(".wd5-compare");

  Array.prototype.forEach.call(boxes, function (box) {
    var handle = box.querySelector(".wd5-compare-handle");
    var dragging = false;

    function set(pct) {
      pct = Math.max(0, Math.min(100, pct));
      box.style.setProperty("--pos", pct + "%");
      if (handle) handle.setAttribute("aria-valuenow", String(Math.round(pct)));
    }

    function fromEvent(e) {
      var r = box.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    }

    var stepTimer = null;
    function stepBy(delta) {
      var now = parseFloat(box.style.getPropertyValue("--pos")) || 50;
      box.classList.add("is-stepping");
      set(now + delta);
      clearTimeout(stepTimer);
      stepTimer = setTimeout(function () {
        box.classList.remove("is-stepping");
      }, 500);
    }

    /* 좌우 버튼도 선처럼 끌 수 있다 (수정사항_11.09). 움직이지 않고 떼면 지금처럼 10% 이동.
       버튼에서 시작한 드래그는 누른 지점과 경계선의 간격을 유지해서, 누르는 순간 튀지 않는다. */
    var fromBtn = null;
    var startX = 0;
    var grabOffset = 0;
    var moved = false;
    var DRAG_THRESHOLD = 4;

    Array.prototype.forEach.call(box.querySelectorAll(".wd5-compare-btn"), function (btn) {
      var delta = btn.classList.contains("wd5-compare-btn--prev") ? -10 : 10;
      btn.addEventListener("click", function (e) {
        // 마우스·터치는 pointerup 에서 처리했다. detail 0 은 보조기기의 click 이다.
        if (e.detail === 0) stepBy(delta);
      });
      btn.dataset.delta = String(delta);
    });

    box.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      box.classList.remove("is-stepping");
      dragging = true;
      moved = false;
      startX = e.clientX;
      box.setPointerCapture(e.pointerId);
      fromBtn = e.target.closest ? e.target.closest(".wd5-compare-btn") : null;
      if (fromBtn) {
        var r = box.getBoundingClientRect();
        var now = parseFloat(box.style.getPropertyValue("--pos")) || 50;
        grabOffset = e.clientX - (r.left + (r.width * now) / 100);
      } else {
        fromEvent(e);
      }
    });
    box.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      if (!fromBtn) {
        fromEvent(e);
        return;
      }
      if (!moved && Math.abs(e.clientX - startX) < DRAG_THRESHOLD) return;
      moved = true;
      var r = box.getBoundingClientRect();
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
        var now = parseFloat(box.style.getPropertyValue("--pos")) || 50;
        var next = null;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = now - 5;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") next = now + 5;
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = 100;
        if (next === null) return;
        e.preventDefault();
        set(next);
      });
    }
  });
})();
