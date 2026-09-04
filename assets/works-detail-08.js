/* works-detail-08.html - 7번 영상 섹션 (재생 버튼)
   피그마 정지 시안의 딤(검정 60%) + 재생 삼각형을 실제 동작으로 옮긴 것.
   버튼을 누르면 딤이 걷히면서 재생되고, 재생 중에 다시 누르면 멈춘다.
   상태는 .wd8-video[data-playing] 이 들고 색·투명도는 CSS 가 바꾼다 (GNB 와 같은 방식). */
(function () {
  var section = document.querySelector(".wd8-video");
  if (!section) return;

  var video = section.querySelector("video");
  var button = section.querySelector(".wd8-video-play");
  if (!video || !button) return;

  // 상태는 video 의 play/pause 이벤트로만 갱신한다.
  // play() 가 거부돼도(코덱·자동재생 정책) 딤이 먼저 걷히는 일이 없다.
  function sync() {
    var playing = !video.paused && !video.ended;
    section.setAttribute("data-playing", playing ? "true" : "false");
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
})();
