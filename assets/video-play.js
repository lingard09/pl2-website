/* 재생 버튼이 달린 영상 슬롯 (상세 05·06·08·10 공유)
   피그마 정지 시안의 재생 삼각형을 실제 동작으로 옮긴 것.
   버튼을 누르면 재생되고, 재생 중에 다시 누르면 멈춘다.
   상태는 컨테이너의 [data-playing] 이 들고 삼각형·딤은 CSS 가 바꾼다 (GNB 와 같은 방식).

   상세 08 은 poster 가 없어서 CSS 가 딤(검정 60%)을 얹지만,
   05·06·10 은 poster jpg 에 딤이 이미 구워져 있어 CSS 딤이 없다.
   두 경우 다 이 스크립트는 [data-playing] 만 갱신하면 된다. */
(function () {
  var slots = document.querySelectorAll("[data-playing]");

  Array.prototype.forEach.call(slots, function (slot) {
    var video = slot.querySelector("video");
    var button = slot.querySelector("button");
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
