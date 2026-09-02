/* works.html - 맨 위로 버튼 */
(function () {
  var top = document.querySelector(".wk-top");
  if (!top) return;

  top.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();
