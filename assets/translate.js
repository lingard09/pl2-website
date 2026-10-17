/* 해외 방문자 자동 번역 (PC 피드백_1015)
   브라우저 언어가 한국어가 아니면 Google 웹사이트 번역기로 페이지를 그 언어로 바꿔 보여준다.
   - 번역 대상 언어는 googtrans 쿠키(/ko/<언어>)로 정하고, 위젯 UI 는 숨긴다 (base.css)
   - 한국어 사용자는 아무것도 불러오지 않는다
   - 번역하면 안 되는 곳(브랜드명·로고 글자)은 HTML 에 translate="no" 를 붙여 둔다 */
(function () {
  var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "ko"];
  var lang = String(langs[0] || "ko").toLowerCase();
  if (lang.indexOf("ko") === 0) return;

  // Google 번역 언어 코드로 맞춘다 (중국어만 지역 구분, 나머지는 앞부분)
  var target = lang.split("-")[0];
  if (target === "zh") target = /tw|hk|mo|hant/.test(lang) ? "zh-TW" : "zh-CN";
  if (target === "iw") target = "he";

  var value = "/ko/" + target;
  var host = location.hostname;
  document.cookie = "googtrans=" + value + "; path=/";
  if (host && host.indexOf(".") > 0) {
    document.cookie = "googtrans=" + value + "; path=/; domain=." + host.replace(/^www\./, "");
  }

  window.pl2TranslateInit = function () {
    /* global google */
    new google.translate.TranslateElement(
      { pageLanguage: "ko", autoDisplay: false },
      "pl2-translate"
    );
  };

  function load() {
    // 한국어 문장 길이에 맞춰 넣은 줄바꿈은 번역문 중간을 끊는다 → 공백으로 바꿔 자연스럽게 흐르게 한다
    Array.prototype.forEach.call(document.querySelectorAll("[data-ko-br] br"), function (br) {
      br.parentNode.replaceChild(document.createTextNode(" "), br);
    });
    var box = document.createElement("div");
    box.id = "pl2-translate";
    box.setAttribute("aria-hidden", "true");
    document.body.appendChild(box);
    var s = document.createElement("script");
    s.src = "https://translate.google.com/translate_a/element.js?cb=pl2TranslateInit";
    s.async = true;
    document.body.appendChild(s);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
