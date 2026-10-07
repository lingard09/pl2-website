/* 맨 위로 버튼 (Works · 상세 페이지 공유)
   - 누르면 맨 위로 부드럽게 올라간다
   - 스크롤하는 동안 계속 보이다가, 하단 푸터(.ft) 영역에 들어가면 페이드아웃되고
     벗어나면 다시 나타난다 (PC 피드백_0930). 푸터가 없는 페이지(Works)는 항상 보인다. */
(function () {
  var btn = document.querySelector(".top-btn");
  if (!btn) return;

  btn.addEventListener("click", function () {
    var reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });

  var zone = document.querySelector(".ft");
  if (!zone || !("IntersectionObserver" in window)) return;

  // 버튼이 화면 아래 40px 쯤에 떠 있으므로, 푸터 윗변이 버튼 높이 근처까지
  // 올라왔을 때 사라지게 한다 (버튼이 노란 푸터 위에 겹치기 직전).
  new IntersectionObserver(
    function (entries) {
      btn.classList.toggle("is-away", entries[0].isIntersecting);
    },
    { rootMargin: "0px 0px -60px 0px", threshold: 0 }
  ).observe(zone);
})();
