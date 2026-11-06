/* 언어 정하기 (수정사항_11.06 "데스크탑 영문 버전")
   <head> 에서 동기로 불러온다 — 첫 페인트 전에 정해야 한글이 번쩍 보였다가 영문으로 바뀌지 않는다.
   - 한국 사용자는 한글: 선호 언어 목록에 한국어가 하나라도 있거나 시간대가 한국(Asia/Seoul).
     그 밖의 방문자는 영문. (기준은 translate.js 의 자동 번역과 같다)
   - 주소에 ?lang=en / ?lang=ko 를 붙이면 그 언어로 고정한다 (검수용). 이 탭에서는 다른 페이지로 가도 유지된다.
   - 영문판이 있는 페이지(<html data-en>: 상세 14개 + About)만 영문 원고로 바꾼다 → html.is-en, lang="en".
     영문판이 없는 페이지(Home·Works·Contact)는 지금처럼 translate.js 가 자동 번역한다.
   - 원고는 같은 요소 안에 <span data-l="ko"> / <span data-l="en" lang="en"> 로 나란히 두고 CSS 가 하나만 보여 준다 (base.css). */
(function () {
  var root = document.documentElement;
  var KEY = "pl2-lang";
  var pick = null;
  var m = /[?&]lang=(en|ko)\b/.exec(location.search);
  try {
    if (m) sessionStorage.setItem(KEY, m[1]);
    pick = sessionStorage.getItem(KEY);
  } catch (e) {
    pick = m && m[1];
  }

  var en;
  if (pick) {
    en = pick === "en";
  } else {
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "ko"];
    var korean = Array.prototype.some.call(langs, function (l) {
      return String(l).toLowerCase().indexOf("ko") === 0;
    });
    var tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {}
    en = !(korean || tz === "Asia/Seoul");
  }

  window.PL2_LANG = en ? "en" : "ko";
  if (en && root.hasAttribute("data-en")) {
    root.classList.add("is-en");
    root.lang = "en";
  }
})();

/* 모바일에서 본문의 <br> 을 숨길 때(works-detail.css · about.css 모바일 블록) 앞뒤 단어가 붙지 않게
   <br> 앞에 공백을 하나 넣어 둔다. 줄 끝 공백은 그려지지 않아서 PC 화면은 그대로다. */
document.addEventListener("DOMContentLoaded", function () {
  Array.prototype.forEach.call(document.querySelectorAll("main br"), function (br) {
    var prev = br.previousSibling;
    if (prev && prev.nodeType === 3 && /\s$/.test(prev.textContent)) return;
    br.parentNode.insertBefore(document.createTextNode(" "), br);
  });
});
