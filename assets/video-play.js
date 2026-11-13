/* 재생 버튼이 달린 영상 슬롯 (상세 02·03·05·06·08·10·13·14 공유)
   [data-vimeo="ID"] 슬롯은 누를 때 비메오 플레이어로 바뀐다 (11.13).
   피그마 정지 시안의 재생 삼각형을 실제 동작으로 옮긴 것.
   버튼을 누르면 재생되고, 재생 중에 다시 누르면 멈춘다.
   상태는 컨테이너의 [data-playing] 이 들고 삼각형·딤은 CSS 가 바꾼다 (GNB 와 같은 방식).

   상세 08 은 poster 가 없어서 CSS 가 딤(검정 60%)을 얹지만,
   05·06·10 은 poster jpg 에 딤이 이미 구워져 있어 CSS 딤이 없다.
   두 경우 다 이 스크립트는 [data-playing] 만 갱신하면 된다. */
(function () {
  var slots = document.querySelectorAll("[data-playing]");

  // 하단 풀필름을 화면 위아래에 딱 맞게 가운데로 (수정사항_11.12, PC)
  function centerFilm(slot) {
    if (!slot.classList.contains("wd-film-frame") || window.innerWidth < 600) return;
    var r = slot.getBoundingClientRect();
    var y = window.scrollY + r.top - (window.innerHeight - r.height) / 2;
    // 관성 스크롤(Lenis, 상세 02·13)이 켜진 페이지는 Lenis 로 움직여야 서로 당기지 않는다
    var lenis = window.PL2Space && window.PL2Space.lenis;
    if (lenis) lenis.scrollTo(Math.round(y));
    else window.scrollTo({ top: Math.round(y), behavior: "smooth" });
  }

  // 비메오 풀필름 (11.13 최종: 상세 05·08·13·14).
  // 재생 전에는 포스터 + 딤 + 삼각형만 두고(플레이어를 미리 불러오지 않는다),
  // 누르면 그 자리에 비메오 플레이어를 넣어 바로 재생한다. 이후 조작은 비메오 컨트롤로.
  function initVimeo(slot, button) {
    var id = slot.getAttribute("data-vimeo");
    button.addEventListener("click", function () {
      if (slot.querySelector("iframe")) return;
      centerFilm(slot);
      var f = document.createElement("iframe");
      f.src =
        "https://player.vimeo.com/video/" + id +
        "?autoplay=1&title=0&byline=0&portrait=0&dnt=1";
      f.title = "Full film";
      f.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
      f.allowFullscreen = true;
      slot.appendChild(f);
      slot.setAttribute("data-playing", "true");
      button.hidden = true; // 이후 클릭은 비메오 플레이어가 받는다
    });
  }

  Array.prototype.forEach.call(slots, function (slot) {
    var video = slot.querySelector("video");
    var button = slot.querySelector("button");
    if (button && slot.hasAttribute("data-vimeo")) return initVimeo(slot, button);
    if (!video || !button) return;

    // 상태는 video 의 play/pause 이벤트로만 갱신한다.
    // play() 가 거부돼도(코덱·자동재생 정책) 삼각형이 먼저 사라지는 일이 없다.
    function sync() {
      var playing = !video.paused && !video.ended;
      slot.setAttribute("data-playing", playing ? "true" : "false");
      button.setAttribute("aria-label", playing ? "영상 정지" : "영상 재생");
    }

    button.addEventListener("click", function () {
      if (video.paused) {
        centerFilm(slot);
        var played = video.play();
        if (played && played.catch) played.catch(function () {});
      } else {
        video.pause();
      }
    });

    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    video.addEventListener("ended", sync);
    sync();
  });
})();
