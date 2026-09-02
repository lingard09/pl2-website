/* GNB 햄버거 드롭다운 토글 (모든 페이지 공유)
   피그마 GNB/Bar 의 Dropdown=Off|On 을 .gnb[data-dropdown] 로 옮긴 것.
   열림/닫힘에 따라 토글 아이콘(hamburger ↔ X)은 CSS 가 바꾼다. */
(function () {
  var gnb = document.querySelector(".gnb");
  if (!gnb) return;

  var toggle = gnb.querySelector(".gnb-toggle");
  if (!toggle) return;

  function setOpen(open) {
    gnb.setAttribute("data-dropdown", open ? "on" : "off");
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
})();
