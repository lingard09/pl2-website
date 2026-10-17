/* 해외 방문자 자동 번역 (PC 피드백_1015)
   해외 방문자에게는 Google 웹사이트 번역기로 페이지를 브라우저 언어로 바꿔 보여준다.
   - 번역 대상 언어는 googtrans 쿠키(/ko/<언어>)로 정하고, 위젯 UI 는 숨긴다 (base.css)
   - 한국 사용자는 번역하지 않는다: 선호 언어 목록에 한국어가 하나라도 있거나
     (영어 OS 를 쓰는 한국 사용자) 시간대가 한국(Asia/Seoul)이면 원문 그대로 둔다.
     이때 예전에 남은 googtrans 쿠키도 지운다 — 남아 있으면 Google 이 계속 번역한다
   - 번역하면 안 되는 곳(브랜드명·로고 글자)은 HTML 에 translate="no" 를 붙여 둔다 */
(function () {
  var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "ko"];
  var lang = String(langs[0] || "ko").toLowerCase();
  var host = location.hostname;
  var domains = [""];
  if (host && host.indexOf(".") > 0) domains.push("; domain=." + host.replace(/^www\./, ""), "; domain=" + host);

  var korean = Array.prototype.some.call(langs, function (l) {
    return String(l).toLowerCase().indexOf("ko") === 0;
  });
  var tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (e) {}
  if (korean || tz === "Asia/Seoul") {
    domains.forEach(function (d) {
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + d;
    });
    return;
  }

  // Google 번역 언어 코드로 맞춘다 (중국어만 지역 구분, 나머지는 앞부분)
  var target = lang.split("-")[0];
  if (target === "zh") target = /tw|hk|mo|hant/.test(lang) ? "zh-TW" : "zh-CN";
  if (target === "iw") target = "he";

  var value = "/ko/" + target;
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
    // 한국어 문장 길이에 맞춰 넣은 줄바꿈(<br>)은 번역문 중간을 끊는다 (단어 중간도 있다).
    // 한글이 든 블록의 <br> 은 공백으로 바꿔 번역문이 칸 폭에 맞춰 자연스럽게 흐르게 한다.
    // 번역하지 않는 곳(translate="no")은 그대로 둔다.
    Array.prototype.forEach.call(document.querySelectorAll("body br"), function (br) {
      var block = br.parentNode;
      if (!block || block.closest('[translate="no"]')) return;
      if (!/[\uac00-\ud7a3]/.test(block.textContent)) return;
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
