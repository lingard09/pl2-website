/* 보정 전/후 비교 슬라이더 (상세 05, PC 피드백_0930)
   .wd5-compare 의 --pos(0~100%) 를 바꿔 왼쪽 '보정 전' 레이어를 그만큼만 보여준다.
   - 이미지 위 어디서든 누른 채 좌우로 끌면 경계가 따라온다 (마우스·터치·펜)
   - 경계선에 포커스를 두고 ←/→ 로 5%, Home/End 로 끝까지
   - 경계선 양옆 ←/→ 버튼으로 10% 씩 (부드럽게 이동, PC 피드백_1015)
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

    Array.prototype.forEach.call(box.querySelectorAll(".wd5-compare-btn"), function (btn) {
      var delta = btn.classList.contains("wd5-compare-btn--prev") ? -10 : 10;
      // 버튼을 누를 때는 드래그로 넘어가지 않게 막는다
      btn.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
      });
      btn.addEventListener("click", function () {
        stepBy(delta);
      });
    });

    box.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      box.classList.remove("is-stepping");
      dragging = true;
      box.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    box.addEventListener("pointermove", function (e) {
      if (dragging) fromEvent(e);
    });
    function stop() {
      dragging = false;
    }
    box.addEventListener("pointerup", stop);
    box.addEventListener("pointercancel", stop);

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
