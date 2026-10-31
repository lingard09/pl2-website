/* GNB 햄버거 드롭다운 토글 (모든 페이지 공유)
   피그마 GNB/Bar 의 Dropdown=Off|On 을 .gnb[data-dropdown] 로 옮긴 것.
   열림/닫힘에 따라 토글 아이콘(hamburger ↔ X)은 CSS 가 바꾼다. */
(function () {
  var gnb = document.querySelector(".gnb");
  if (!gnb) return;

  var toggle = gnb.querySelector(".gnb-toggle");
  if (!toggle) return;

  // Difference 잉크 층 (추가 전달_10.29, base.css 참고): GNB 를 복제해 바로 위에 겹친다.
  // 원본은 블러·클릭, 복제는 흰 글자·아이콘·구분선을 페이지와 Difference 로 섞는다.
  var ink = gnb.cloneNode(true);
  ink.classList.add("gnb-ink");
  ink.setAttribute("aria-hidden", "true");
  ink.setAttribute("inert", "");
  Array.prototype.forEach.call(ink.querySelectorAll("[id]"), function (el) {
    el.removeAttribute("id");
  });
  gnb.classList.add("gnb-glass");
  gnb.parentNode.insertBefore(ink, gnb.nextSibling);

  // 호버·포커스한 행은 원본이 노란 글자로 그리므로 복제의 같은 행 글자를 숨긴다
  var items = gnb.querySelectorAll(".gnb-item");
  var inkItems = ink.querySelectorAll(".gnb-item");
  Array.prototype.forEach.call(items, function (item, i) {
    function on() {
      inkItems[i].classList.add("is-hover");
    }
    function off() {
      if (!item.matches(":hover") && document.activeElement !== item) {
        inkItems[i].classList.remove("is-hover");
      }
    }
    item.addEventListener("mouseenter", on);
    item.addEventListener("mouseleave", off);
    item.addEventListener("focus", function () {
      if (item.matches(":focus-visible")) on();
    });
    item.addEventListener("blur", off);
  });

  // 숨김(is-away) 같은 클래스 변화를 복제에도 그대로 옮긴다
  new MutationObserver(function () {
    ink.classList.toggle("is-away", gnb.classList.contains("is-away"));
  }).observe(gnb, { attributes: true, attributeFilter: ["class"] });

  function setOpen(open) {
    gnb.setAttribute("data-dropdown", open ? "on" : "off");
    ink.setAttribute("data-dropdown", open ? "on" : "off");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
  }

  toggle.addEventListener("click", function (e) {
    e.stopPropagation();
    setOpen(gnb.getAttribute("data-dropdown") !== "on");
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });

  document.addEventListener("click", function (e) {
    if (!gnb.contains(e.target)) setOpen(false);
  });

  // 화면에 고정된 GNB 만: 아래로 스크롤하면 위로 빠지고, 위로 올리면 쓰윽 내려온다
  // (모션피드백_0928, 참고 koto.com). Home 처럼 히어로 안에 박힌 GNB 는 그대로 둔다.
  if (getComputedStyle(gnb).position !== "fixed") return;
  // data-pinned 가 붙은 페이지(Works)는 스크롤해도 숨기지 않고 늘 고정 (PC 피드백_0930)
  if (gnb.hasAttribute("data-pinned")) return;

  var TOP_ZONE = 120; // 이 위에서는 항상 보인다
  var DELTA = 6; // 트랙패드 잔떨림 무시
  var lastY = window.scrollY;
  var ticking = false;

  function onScroll() {
    ticking = false;
    var y = window.scrollY;
    if (Math.abs(y - lastY) < DELTA) return;
    var away =
      y > TOP_ZONE && y > lastY && gnb.getAttribute("data-dropdown") !== "on";
    gnb.classList.toggle("is-away", away);
    lastY = y;
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true }
  );

  // 키보드로 GNB 에 들어오면 숨어 있지 않게
  gnb.addEventListener("focusin", function () {
    gnb.classList.remove("is-away");
  });
})();
