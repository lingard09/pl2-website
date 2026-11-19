/* PL2 CMS 관리자 화면 (2026-11-19)
 *
 * 왼쪽: 실제 페이지 미리보기(iframe, 같은 사이트). 글·이미지·영상 위에 마우스를 올리면 테두리가 생기고
 *       누르면 오른쪽 패널에서 고친다. 고친 내용은 미리보기에 바로 보이고, [저장]을 눌러야 사이트에 반영된다.
 * 오른쪽: 선택한 항목 편집 / 이 페이지 전체 목록(숨은 문구 — 영문·모바일 전용 — 도 여기서 고친다).
 *
 * 글은 "줄" 단위로 고친다. 줄 사이마다 줄바꿈 종류를 고른다: PC·모바일 둘 다 / PC에서만 / 모바일에서만.
 * 저장 형식: {lines: [...], breaks: [...]} — 서버(admin/lib.php)가 html 로 바꾼다.
 */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var csrf = app.getAttribute("data-csrf") || "";

  var BR_LABEL = {
    "br-mo br-pc": "PC·모바일 둘 다",
    "br-pc-only": "PC에서만",
    "br-mo": "모바일에서만",
  };
  var PAGE_NAMES = { "": "홈", "works/": "Works 목록", "about/": "About", "contact/": "Contact" };

  var S = {
    index: null, // {pages, ids}
    content: null, // {items}
    pending: {}, // id → item | null(원래대로)
    page: null, // index.pages[n]
    view: "pc", // pc | mo
    lang: "ko",
    editMode: true,
    selected: [], // 선택한 id 들
    tab: "item",
    uploading: 0,
    brvis: {}, // 파일 → id → 클래스 → [PC, 모바일] 보임 (measurePage)
    measuring: {},
  };

  // ── 작은 도구 ─────────────────────────────────────
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "text") el.textContent = v;
        else if (k === "html") el.innerHTML = v;
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
      else el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function norm(s) {
    return String(s).replace(/[\x20\x09\x0A\x0B\x0C\x0D]+/g, " ").replace(/^ +| +$/g, "");
  }
  function clone(o) {
    return o === null || o === undefined ? o : JSON.parse(JSON.stringify(o));
  }
  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function toast(msg, kind) {
    var t = h("div", { class: "toast " + (kind || ""), text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("out"); }, kind === "err" ? 6000 : 2600);
    setTimeout(function () { t.remove(); }, kind === "err" ? 6600 : 3200);
  }

  function api(action, body, method) {
    return fetch("api.php?a=" + action, {
      method: method || (body ? "POST" : "GET"),
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json", "X-CSRF": csrf } : { "X-CSRF": csrf },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "서버 응답을 읽지 못했습니다 (" + r.status + ")" }; })
        .then(function (j) {
          if (r.status === 401 && action !== "login") { showLogin("다시 로그인해 주세요"); throw new Error("login"); }
          if (!j.ok) throw new Error(j.error || "오류");
          return j;
        });
    });
  }

  function upload(file, kind, maxw, onProgress) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      fd.append("maxw", String(maxw || 0));
      var x = new XMLHttpRequest();
      x.open("POST", "api.php?a=upload");
      x.setRequestHeader("X-CSRF", csrf);
      x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = function () {
        var j = null;
        try { j = JSON.parse(x.responseText); } catch (e) {}
        if (j && j.ok) resolve(j);
        else reject(new Error((j && j.error) || "올리지 못했습니다 (" + x.status + ")"));
      };
      x.onerror = function () { reject(new Error("네트워크 오류로 올리지 못했습니다")); };
      x.send(fd);
    });
  }

  // ── 값 ───────────────────────────────────────────
  function meta(id) { return S.index.ids[id]; }
  function savedValue(id) {
    var c = S.content.items && S.content.items[id];
    return clone(c || meta(id).base);
  }
  function currentValue(id) {
    if (Object.prototype.hasOwnProperty.call(S.pending, id)) {
      return S.pending[id] === null ? clone(meta(id).base) : clone(S.pending[id]);
    }
    return savedValue(id);
  }
  function isEdited(id) {
    return !!(S.content.items && S.content.items[id]);
  }
  function setPending(id, item) {
    var saved = savedValue(id);
    if (item === null) {
      if (!isEdited(id)) delete S.pending[id];
      else S.pending[id] = null;
    } else if (same(item, saved)) {
      delete S.pending[id];
    } else {
      S.pending[id] = item;
    }
    previewValue(id, currentValue(id));
    renderBar();
  }
  function pendingCount() { return Object.keys(S.pending).length; }

  function textHtml(item) {
    var lines = item.lines && item.lines.length ? item.lines : [""];
    var out = "";
    lines.forEach(function (l, i) {
      out += esc(norm(l));
      if (i < lines.length - 1) {
        var cls = (item.breaks && item.breaks[i]) || "";
        out += cls ? ' <br class="' + cls + '" />' : " <br />";
      }
    });
    return out;
  }
  function textLength(item) {
    return item.lines.join("").replace(/\s/g, "").length;
  }

  // ── 줄바꿈 측정 (11.19: PC칸 / 모바일칸 따로 편집) ─────────────
  // 줄바꿈이 실제로 보이는지는 클래스만으로 정해지지 않는다. 문단마다 CSS 가 다르다
  // (About 소개·상세 4/10 제목은 모바일에서 줄바꿈을 전부 끄고, 상세 개요는 맨 <br> 만 끈다 등).
  // 그래서 페이지를 PC(1440)·모바일(390) 폭의 숨은 창에 열고, 글 항목마다 줄바꿈 종류별로
  // 시험용 <br> 을 넣어 보이는지 잰다. 결과: S.brvis[파일][id][클래스] = [PC에 보임, 모바일에 보임]
  var STD_BR = ["br-mo br-pc", "br-pc-only", "br-mo", ""];
  var allBrCache = null;
  function allBrClasses() {
    if (allBrCache) return allBrCache;
    var set = {};
    STD_BR.forEach(function (c) { set[c] = 1; });
    Object.keys(S.index.ids).forEach(function (id) {
      var b = S.index.ids[id].base;
      if (b && b.breaks) b.breaks.forEach(function (c) { set[c || ""] = 1; });
    });
    allBrCache = Object.keys(set);
    return allBrCache;
  }

  function probeDoc(d) {
    var classes = allBrClasses();
    var probes = [];
    Array.prototype.forEach.call(d.querySelectorAll("[data-cms]"), function (el) {
      var id = el.getAttribute("data-cms");
      var m = meta(id);
      if (!m || m.kind !== "text" || probes.some(function (p) { return p.id === id; })) return;
      var brs = classes.map(function (c) {
        var br = d.createElement("br");
        if (c) br.className = c;
        el.appendChild(br);
        return br;
      });
      probes.push({ id: id, brs: brs });
    });
    var win = d.defaultView;
    var out = {};
    probes.forEach(function (p) {
      var t = {};
      p.brs.forEach(function (br, i) { t[classes[i]] = win.getComputedStyle(br).display !== "none"; });
      out[p.id] = t;
    });
    probes.forEach(function (p) { p.brs.forEach(function (br) { br.remove(); }); });
    return out;
  }

  function measureAt(url, w, hgt) {
    return new Promise(function (resolve) {
      var f = h("iframe", { src: url, tabindex: "-1", "aria-hidden": "true" });
      f.style.cssText = "position:fixed;left:-30000px;top:0;border:0;visibility:hidden;width:" + w + "px;height:" + hgt + "px";
      var done = false;
      var started = Date.now();
      function finish(r) {
        if (done) return;
        done = true;
        f.remove();
        resolve(r);
      }
      function poll() {
        if (done) return;
        var d = null;
        try { d = f.contentDocument; } catch (e) { return finish(null); }
        var ready = d && d.readyState !== "loading" && d.body &&
          Array.prototype.every.call(d.querySelectorAll('link[rel="stylesheet"]'), function (l) { return !!l.sheet; });
        if (ready && d.location.href !== "about:blank") {
          var r = null;
          try { r = probeDoc(d); } catch (e) { r = null; }
          return finish(r);
        }
        if (Date.now() - started > 20000) return finish(null);
        setTimeout(poll, 150);
      }
      document.body.appendChild(f);
      setTimeout(poll, 150);
    });
  }

  function measurePage(retry) {
    var file = S.page.file;
    if (S.brvis[file] || S.measuring[file]) return;
    var url = "/" + S.page.route + "?lang=ko&cms=" + Date.now();
    S.measuring[file] = Promise.all([measureAt(url, 1440, 900), measureAt(url, 390, 800)]).then(function (rs) {
      var pc = rs[0], mo = rs[1], out = {};
      if (pc && mo) {
        Object.keys(pc).forEach(function (id) {
          if (!mo[id]) return;
          var t = {};
          Object.keys(pc[id]).forEach(function (c) { t[c] = [pc[id][c], mo[id][c]]; });
          out[id] = t;
        });
      }
      delete S.measuring[file];
      if (!(pc && mo) && !retry) {
        // 한 번 더 재 본다 (느린 망에서 시간 초과 등)
        if (S.page.file === file) measurePage(true);
        return;
      }
      S.brvis[file] = out; // 그래도 실패하면 빈 표 → 예전 편집기로
      if (S.page.file === file && S.tab === "item") renderPanel();
    });
  }

  function brTable(id) {
    var f = S.brvis[S.page.file];
    if (!f) return undefined; // 아직 재는 중
    return f[id] || null; // null: 잴 수 없음
  }

  // 두 칸 모델: 낱말 목록 + 낱말 사이마다 {pc, mo, cls}. cls 는 원래 있던 <br> 클래스(없으면 null)
  var SEP = /[\x20\x09\x0A\x0B\x0C\x0D]+/;
  function toModel(item, tab) {
    var words = [], gaps = [], pendingCls = null;
    (item.lines || []).forEach(function (line, li) {
      if (li > 0 && pendingCls === null) pendingCls = (item.breaks && item.breaks[li - 1]) || "";
      line.split(SEP).filter(Boolean).forEach(function (w) {
        if (words.length) {
          if (pendingCls !== null) {
            var v = tab[pendingCls] || [true, true];
            gaps.push({ pc: v[0], mo: v[1], cls: pendingCls });
          } else {
            gaps.push({ pc: false, mo: false, cls: null });
          }
        }
        pendingCls = null;
        words.push(w);
      });
    });
    return { words: words, gaps: gaps };
  }

  function modelText(model, side) {
    var s = "";
    model.words.forEach(function (w, k) {
      s += w;
      if (k < model.gaps.length) s += model.gaps[k][side] ? "\n" : " ";
    });
    return s;
  }

  function tokenize(s) {
    var parts = s.split(/([\x20\x09\x0A\x0B\x0C\x0D]+)/);
    var words = [], nl = [], sep = "";
    parts.forEach(function (p, i) {
      if (i % 2 === 1) { sep += p; return; }
      if (!p) return;
      if (words.length) nl.push(/[\n\r]/.test(sep));
      words.push(p);
      sep = "";
    });
    return { words: words, nl: nl };
  }

  // 새 낱말 j → 옛 낱말 번호 (없으면 -1). 최장 공통 부분열
  function alignWords(a, b) {
    var n = a.length, m = b.length, i, j;
    var L = [];
    for (i = 0; i <= n; i++) { L.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
    }
    var map = new Array(m).fill(-1);
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { map[j] = i; i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) i++;
      else j++;
    }
    return map;
  }

  // 한쪽 칸(side)에서 고친 글을 모델에 반영한다. 다른 칸의 줄바꿈은 같은 낱말 사이에 그대로 남긴다
  function applySide(model, side, text) {
    var t = tokenize(text);
    var map = alignWords(model.words, t.words);
    var used = {};
    var gaps = [];
    for (var j = 0; j < t.words.length - 1; j++) {
      var a = map[j], b = map[j + 1], k = -1;
      if (a >= 0 && b === a + 1) k = a;
      else if (a >= 0 && a < model.gaps.length && b < 0) k = a;
      else if (b > 0 && a < 0) k = b - 1;
      var g = k >= 0 && !used[k] ? model.gaps[k] : null;
      if (g) used[k] = 1;
      var ng = g ? { pc: g.pc, mo: g.mo, cls: g.cls } : { pc: false, mo: false, cls: null };
      ng[side] = t.nl[j];
      gaps.push(ng);
    }
    model.words = t.words;
    model.gaps = gaps;
  }

  function pickBr(g, tab) {
    if (g.cls !== null && tab[g.cls] && tab[g.cls][0] === g.pc && tab[g.cls][1] === g.mo) return g.cls;
    if (!g.pc && !g.mo) return null;
    var i, c;
    for (i = 0; i < STD_BR.length; i++) {
      c = STD_BR[i];
      if (tab[c] && tab[c][0] === g.pc && tab[c][1] === g.mo) return c;
    }
    // 이 문단에서 만들 수 없는 조합: 원하는 쪽에 보이는 것 중 첫 번째
    for (i = 0; i < STD_BR.length; i++) {
      c = STD_BR[i];
      if (tab[c] && ((g.pc && tab[c][0]) || (g.mo && tab[c][1]))) return c;
    }
    return "br-mo br-pc";
  }

  function fromModel(model, tab, item) {
    var lines = [[]], breaks = [];
    model.words.forEach(function (w, k) {
      lines[lines.length - 1].push(w);
      if (k < model.gaps.length) {
        var c = pickBr(model.gaps[k], tab);
        if (c !== null) { breaks.push(c); lines.push([]); }
      }
    });
    item.lines = lines.map(function (l) { return l.join(" "); });
    item.breaks = breaks;
    return item;
  }

  // ── 미리보기(iframe) ─────────────────────────────
  var frameWrap, frame, panel, bar;

  function frameDoc() {
    try { return frame.contentDocument; } catch (e) { return null; }
  }
  function frameEls(id) {
    var d = frameDoc();
    return d ? Array.prototype.slice.call(d.querySelectorAll('[data-cms="' + id + '"]')) : [];
  }
  // 이미지 ↔ 영상 (11.19). tools/cms.py swap_html · lib.php cms_swap_html 과 같은 모양 (미리보기용)
  var IMG_ONLY = ["src", "alt", "loading", "decoding", "draggable", "srcset", "sizes", "width", "height"];
  var VIDEO_ONLY = ["poster", "preload", "autoplay", "muted", "loop", "playsinline", "controls", "width", "height"];
  function swapHtml(id, sw, item) {
    var form = item.as || sw.tag;
    function attrs(drop) {
      return sw.attrs.filter(function (a) { return drop.indexOf(a[0]) < 0; }).map(function (a) {
        return a[1] === null ? " " + a[0] : " " + a[0] + '="' + a[1] + '"';
      }).join("");
    }
    if (form === sw.tag) {
      var s0 = "<" + form + ' data-cms="' + id + '"' + attrs([]);
      return form === "img" ? s0 + " />" : s0 + ">" + sw.inner + "</video>";
    }
    var head = "<" + form + ' data-cms="' + id + '" data-cms-swap';
    if (form === "video") {
      return head + attrs(IMG_ONLY) + ' poster="' + esc(item.poster || "") + '" autoplay muted loop playsinline preload="metadata"><source src="' + esc(item.src || "") + '" type="video/mp4" /></video>';
    }
    return head + attrs(VIDEO_ONLY) + ' src="' + esc(item.src || "") + '" alt="" />';
  }
  function swapForm(id) {
    var el = frameEls(id)[0];
    return el ? el.tagName.toLowerCase() : null;
  }

  function previewValue(id, item) {
    var m = meta(id);
    if (m.swap) {
      var want = item.as || m.swap.tag;
      var now = swapForm(id);
      if (now && (item.as || now !== want)) {
        frameEls(id).forEach(function (el) { el.outerHTML = swapHtml(id, m.swap, item); });
        if (!item.as) (m.children || []).forEach(function (c) { previewValue(c, currentValue(c)); });
        markSelected();
        if (item.as) return;
      }
    }
    frameEls(id).forEach(function (el) {
      if (m.kind === "logos") {
        el.innerHTML = logosHtml(item);
      } else if (m.kind === "text") {
        el.innerHTML = textHtml(item);
        if (item.href && el.tagName === "A") el.setAttribute("href", item.href);
      } else {
        ["src", "srcset", "poster", "data-vimeo"].forEach(function (k) {
          if (item[k] !== undefined && el.hasAttribute(k)) el.setAttribute(k, item[k]);
        });
        if (m.kind === "vsource" && el.parentNode && el.parentNode.load) el.parentNode.load();
        if (m.kind === "msource" || m.kind === "img") {
          var pic = el.closest("picture");
          var img = pic && pic.querySelector("img");
          if (img) img.src = img.getAttribute("src"); // picture 다시 고르기
        }
      }
    });
  }

  function frameUrl() {
    var q = "?lang=" + S.lang + "&cms=" + Date.now(); // 저장 직후 서버·브라우저 캐시에 걸린 옛 화면이 보이지 않게
    return "/" + S.page.route + q;
  }

  function loadFrame(keepScroll) {
    var y = 0;
    var d = frameDoc();
    if (keepScroll && d && d.defaultView) y = d.defaultView.scrollY;
    frame.onload = function () { onFrameLoad(y); };
    frame.src = frameUrl();
    fitFrame();
  }

  var STYLE =
    "[data-cms]{cursor:pointer}" +
    "html.cms-edit [data-cms]:hover{outline:2px dashed #2f7cf6 !important;outline-offset:2px}" +
    ".cms-sel{outline:3px solid #ff7a1a !important;outline-offset:2px}" +
    ".cms-flash{animation:cmsflash 1.2s ease 2}@keyframes cmsflash{50%{outline:3px solid #ff7a1a;outline-offset:6px}}";

  function onFrameLoad(y) {
    var d = frameDoc();
    if (!d) return;
    var st = d.createElement("style");
    st.textContent = STYLE;
    d.head.appendChild(st);
    d.documentElement.classList.toggle("cms-edit", S.editMode);
    var langSeg = bar && bar.querySelector('[data-name="lang"]');
    if (langSeg) langSeg.classList.toggle("is-off", !hasEnglish());
    // 저장 전 고친 값 다시 입히기
    Object.keys(S.pending).forEach(function (id) { if (meta(id)) previewValue(id, currentValue(id)); });
    d.addEventListener("click", onFrameClick, true);
    if (y) setTimeout(function () { d.defaultView.scrollTo(0, y); }, 300);
    markSelected();
    renderPanel();
    measurePage();
  }

  function onFrameClick(e) {
    if (!S.editMode) return;
    e.preventDefault();
    e.stopPropagation();
    var d = frameDoc();
    var found = [];
    var add = function (el) {
      if (!el) return;
      var id = el.getAttribute("data-cms");
      if (id && meta(id) && found.indexOf(id) < 0) found.push(id);
    };
    var stack = d.elementsFromPoint ? d.elementsFromPoint(e.clientX, e.clientY) : [e.target];
    stack.forEach(function (el) {
      var c = el.closest("[data-cms]");
      // 글은 가장 위의 것 하나만 (바깥 요소의 글까지 잡지 않게)
      if (c && meta(c.getAttribute("data-cms")).kind === "text") {
        if (!found.some(function (id) { return meta(id).kind === "text"; })) add(c);
        return;
      }
      add(c);
      if (el.tagName === "IMG" || el.tagName === "VIDEO") {
        add(el);
        var pic = el.closest("picture");
        if (pic) Array.prototype.forEach.call(pic.querySelectorAll("source[data-cms]"), add);
        if (el.tagName === "VIDEO") Array.prototype.forEach.call(el.querySelectorAll("source[data-cms]"), add);
      }
      var vim = el.closest("[data-vimeo][data-cms]");
      if (vim) add(vim);
      // 영상 자리를 덮은 버튼·딤을 눌렀을 때 그 아래 영상도
      var slot = el.closest(".wd-film-frame, .wd10-video, [data-playing]");
      if (slot) {
        Array.prototype.forEach.call(slot.querySelectorAll("video[data-cms], video source[data-cms], img[data-cms]"), add);
      }
    });
    if (!found.length) return;
    select(found);
  }

  function select(ids, scroll) {
    S.selected = ids;
    S.tab = "item";
    markSelected(scroll);
    renderPanel();
  }

  function markSelected(scroll) {
    var d = frameDoc();
    if (!d) return;
    Array.prototype.forEach.call(d.querySelectorAll(".cms-sel"), function (el) { el.classList.remove("cms-sel"); });
    var first = null;
    S.selected.forEach(function (id) {
      frameEls(id).forEach(function (el) {
        el.classList.add("cms-sel");
        if (!first && el.getClientRects().length) first = el;
      });
    });
    if (scroll && first) {
      // scrollIntoView 는 바깥(관리자 화면의 미리보기 틀)까지 스크롤해서 미리보기가 밀렸다 → iframe 안에서만 움직인다
      var win = d.defaultView;
      var r = first.getBoundingClientRect();
      var y = Math.max(0, win.scrollY + r.top - (win.innerHeight - r.height) / 2);
      var lenis = win.PL2Space && win.PL2Space.lenis;
      if (lenis && lenis.scrollTo) lenis.scrollTo(y, { immediate: true });
      else win.scrollTo(0, y);
      first.classList.remove("cms-flash");
      void first.offsetWidth;
      first.classList.add("cms-flash");
    }
  }

  function fitFrame() {
    if (!frame) return;
    var W = frameWrap.clientWidth - 32;
    var H = frameWrap.clientHeight - 32;
    if (S.view === "mo") {
      frame.style.width = "390px";
      frame.style.height = Math.min(H, 844) + "px";
      frame.style.transform = "none";
      frameWrap.classList.add("mo");
      return;
    }
    frameWrap.classList.remove("mo");
    var base = 1440;
    var scale = Math.min(1, W / base);
    frame.style.width = base + "px";
    frame.style.height = H / scale + "px";
    frame.style.transform = "scale(" + scale + ")";
  }

  // ── 항목 설명 ─────────────────────────────────────
  function describe(id) {
    var m = meta(id);
    var el = frameEls(id)[0];
    var bits = [];
    var kind = {
      text: "글", img: "이미지", msource: "모바일 이미지", video: "영상 포스터", vsource: "영상 파일", vimeo: "비메오 영상", logos: "로고 목록",
    }[m.kind];
    if (m.kind === "text" && el) {
      var t = el.tagName;
      // 가장 가까운 클래스 이름으로 종류를 짐작한다 (title → 제목, desc/text → 본문, tag/chip → 태그)
      var c = "";
      for (var n = el; n && n !== el.ownerDocument.body && !c; n = n.parentElement) {
        if (/title|tit\b|heading|head-t/i.test(n.className)) c = "제목";
        else if (/desc|text|body|lead|copy|sub/i.test(n.className)) c = "본문";
        else if (/tag|chip|badge|label|cat/i.test(n.className)) c = "태그";
      }
      if (t === "H1" || t === "H2" || t === "H3") kind = "제목";
      else if (t === "A") kind = el.closest("nav.gnb") ? "메뉴" : "링크";
      else kind = c || "글";
    }
    if (m.kind === "img" && el && el.closest("picture") && el.closest("picture").querySelector("source")) kind = "PC 이미지";
    if (m.swap && el && el.tagName.toLowerCase() !== m.swap.tag) kind = m.swap.tag === "img" ? "영상 (원래 이미지 자리)" : "이미지 (원래 영상 자리)";
    bits.push(kind);
    if (el) {
      var l = el.closest("[data-l]");
      if (l) bits.push(l.getAttribute("data-l") === "en" ? "영문" : "한글");
      if (el.closest(".wd-t-pc")) bits.push("PC 화면 문구");
      if (el.closest(".wd-t-mo")) bits.push("모바일 화면 문구");
    }
    if (m.files.length > 1) bits.push("모든 페이지 공통 (" + m.files.length + "곳)");
    return bits.join(" · ");
  }
  function hiddenNow(id) {
    var el = frameEls(id)[0];
    if (!el) return false;
    if (el.tagName === "SOURCE") return false;
    return !el.getClientRects().length;
  }
  function pageIds() {
    var rel = S.page.file;
    return Object.keys(S.index.ids).filter(function (id) { return S.index.ids[id].files.indexOf(rel) >= 0; });
  }
  function docOrder(ids) {
    var d = frameDoc();
    if (!d) return ids;
    var order = {};
    Array.prototype.forEach.call(d.querySelectorAll("[data-cms]"), function (el, i) {
      var id = el.getAttribute("data-cms");
      if (!(id in order)) order[id] = i;
    });
    return ids.slice().sort(function (a, b) { return (order[a] || 0) - (order[b] || 0); });
  }

  // ── 패널: 글 편집 (PC칸 / 모바일칸) ─────────────────
  // 두 칸의 글자는 늘 같고 줄을 나누는 곳만 다르다. 한 칸에서 글을 고치면 다른 칸에도 같은 글이 들어가고,
  // 그 칸의 줄바꿈은 같은 낱말 사이에 남는다.
  function textEditor(id) {
    var tab = brTable(id);
    if (tab === undefined) {
      return h("section", { class: "card" }, head(id), h("p", { class: "hint", text: "PC·모바일 줄바꿈을 확인하는 중이에요…" }));
    }
    if (!tab || !Object.keys(tab).length) return textEditorLines(id);

    var m = meta(id);
    var item = currentValue(id);
    var base = m.base;
    var model = toModel(item, tab);
    var can = { pc: false, mo: false };
    Object.keys(tab).forEach(function (c) { if (tab[c][0]) can.pc = true; if (tab[c][1]) can.mo = true; });
    var count = h("div", { class: "count" });
    var boxes = {};

    function commit() {
      fromModel(model, tab, item);
      setPending(id, item);
      updateCount();
      markEdited();
    }
    function updateCount() {
      var n = textLength(item);
      var b = textLength({ lines: base.lines });
      count.className = "count" + (n > b * 1.15 + 4 ? " warn" : "");
      count.textContent = "글자 수 " + n + "자 (원래 " + b + "자)" + (n > b * 1.15 + 4 ? " — 원래보다 길어요. 미리보기에서 줄이 넘치지 않는지 확인해 주세요." : "");
    }
    function grow(ta) {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + 2 + "px";
    }
    function fill(side) {
      var ta = boxes[side];
      ta.value = can[side] ? modelText(model, side) : model.words.join(" ");
      grow(ta);
    }
    function markEdited() {
      wrap.classList.toggle("is-pending", Object.prototype.hasOwnProperty.call(S.pending, id));
    }
    function twin(side, label, sub) {
      var ta = h("textarea", { class: "line twin", rows: 2, wrap: "off", spellcheck: "false", "data-side": side });
      boxes[side] = ta;
      if (!can[side]) ta.disabled = true;
      ta.addEventListener("input", function () {
        applySide(model, side, ta.value);
        commit();
        fill(side === "pc" ? "mo" : "pc");
        grow(ta);
      });
      var note = can[side] ? sub : (side === "mo"
        ? "이 글은 모바일에서 화면 폭에 맞춰 자동으로 줄이 바뀌어 따로 정할 수 없어요. 글은 PC 칸에서 고쳐 주세요."
        : "이 글은 PC에서 화면 폭에 맞춰 자동으로 줄이 바뀌어 따로 정할 수 없어요. 글은 모바일 칸에서 고쳐 주세요.");
      return h("label", { class: "twin-field" },
        h("span", { class: "twin-label" }, h("b", { text: label }), h("small", { text: note })),
        ta);
    }

    var pcField = twin("pc", "PC 화면", "Enter 로 PC에서 줄을 나눕니다");
    var moField = twin("mo", "모바일 화면", "Enter 로 모바일에서 줄을 나눕니다");
    fill("pc");
    fill("mo");
    setTimeout(function () { grow(boxes.pc); grow(boxes.mo); }, 0);
    updateCount();

    var hrefRow = null;
    if (base.href) {
      var inp = h("input", { type: "url", value: item.href || base.href, class: "href" });
      inp.addEventListener("input", function () {
        var v = inp.value.trim();
        if (v === base.href || !v) delete item.href;
        else item.href = v;
        commit();
      });
      hrefRow = h("label", { class: "field" }, h("span", { text: "링크 주소" }), inp);
    }

    var wrap = h("section", { class: "card" },
      head(id),
      h("p", { class: "hint", text: "두 칸의 글자는 함께 바뀌고, 줄을 나누는 곳만 따로 정합니다. 한쪽에서 글을 고치면 다른 칸에도 똑같이 들어가요." }),
      pcField,
      moField,
      count,
      hrefRow,
      actions(id, function () { item = currentValue(id); model = toModel(item, tab); fill("pc"); fill("mo"); updateCount(); markEdited(); })
    );
    markEdited();
    return wrap;
  }

  // 예전 줄 편집기 (줄바꿈을 잴 수 없을 때만)
  function textEditorLines(id) {
    var m = meta(id);
    var item = currentValue(id);
    var base = m.base;
    var box = h("div", { class: "lines" });
    var count = h("div", { class: "count" });

    function commit() {
      setPending(id, item);
      updateCount();
      renderBar();
      markEdited();
    }
    function updateCount() {
      var n = textLength(item);
      var b = textLength({ lines: base.lines });
      count.className = "count" + (n > b * 1.15 + 4 ? " warn" : "");
      count.textContent = "글자 수 " + n + "자 (원래 " + b + "자)" + (n > b * 1.15 + 4 ? " — 원래보다 길어요. 미리보기에서 줄이 넘치지 않는지 확인해 주세요." : "");
    }
    function draw(focusLine, caret) {
      box.innerHTML = "";
      item.lines.forEach(function (line, i) {
        var ta = h("textarea", { rows: 1, class: "line", spellcheck: "false" });
        ta.value = line;
        ta.addEventListener("input", function () {
          // 붙여넣기 등으로 줄바꿈이 들어오면 줄을 나눈다
          if (/\n/.test(ta.value)) {
            var parts = ta.value.split(/\r?\n/);
            item.lines.splice.apply(item.lines, [i, 1].concat(parts));
            var add = [];
            for (var k = 0; k < parts.length - 1; k++) add.push("br-mo br-pc");
            item.breaks.splice.apply(item.breaks, [i, 0].concat(add));
            commit();
            draw(i + parts.length - 1, 0);
            return;
          }
          item.lines[i] = ta.value;
          grow(ta);
          commit();
        });
        ta.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            var pos = ta.selectionStart;
            var before = ta.value.slice(0, pos), after = ta.value.slice(ta.selectionEnd);
            item.lines.splice(i, 1, before, after);
            item.breaks.splice(i, 0, "br-mo br-pc");
            commit();
            draw(i + 1, 0);
          } else if (e.key === "Backspace" && ta.selectionStart === 0 && ta.selectionEnd === 0 && i > 0) {
            e.preventDefault();
            var prev = item.lines[i - 1];
            var joined = prev.replace(/ +$/, "") + (prev && ta.value ? " " : "") + ta.value.replace(/^ +/, "");
            item.lines.splice(i - 1, 2, joined);
            item.breaks.splice(i - 1, 1);
            commit();
            draw(i - 1, prev.replace(/ +$/, "").length + (prev && ta.value ? 1 : 0));
          }
        });
        var row = h("div", { class: "line-row" }, ta);
        box.appendChild(row);
        if (i < item.lines.length - 1) {
          var cur = item.breaks[i] || "";
          var sel = h("select", { class: "br", title: "이 줄 끝의 줄바꿈" });
          var opts = Object.keys(BR_LABEL);
          if (opts.indexOf(cur) < 0) opts.unshift(cur);
          opts.forEach(function (v) {
            var label = BR_LABEL[v] || (v === "" ? "PC·모바일 둘 다 (기본)" : "특수 줄바꿈 (" + v + ")");
            sel.appendChild(h("option", { value: v, text: "↵ " + label, selected: v === cur }));
          });
          sel.addEventListener("change", function () { item.breaks[i] = sel.value; commit(); });
          box.appendChild(h("div", { class: "br-row" }, sel));
        }
        setTimeout(function () { grow(ta); }, 0);
        if (focusLine === i) setTimeout(function () { ta.focus(); ta.setSelectionRange(caret, caret); }, 0);
      });
    }
    function grow(ta) {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }
    function markEdited() {
      wrap.classList.toggle("is-pending", Object.prototype.hasOwnProperty.call(S.pending, id));
    }

    draw();
    updateCount();

    var hrefRow = null;
    if (base.href) {
      var inp = h("input", { type: "url", value: item.href || base.href, class: "href" });
      inp.addEventListener("input", function () {
        var v = inp.value.trim();
        if (v === base.href || !v) delete item.href;
        else item.href = v;
        commit();
      });
      hrefRow = h("label", { class: "field" }, h("span", { text: "링크 주소" }), inp);
    }

    var wrap = h("section", { class: "card" },
      head(id),
      h("p", { class: "hint", text: "Enter 로 줄을 나누고, 줄 맨 앞에서 Backspace 로 윗줄과 합칩니다. 줄 사이의 상자에서 줄바꿈이 보일 화면을 고릅니다." }),
      box,
      count,
      hrefRow,
      actions(id, function () { item = currentValue(id); draw(); updateCount(); markEdited(); })
    );
    markEdited();
    return wrap;
  }

  function head(id) {
    var hidden = hiddenNow(id);
    var hint = null;
    if (hidden) {
      var el = frameEls(id)[0];
      var where = el && el.closest(".wd-t-mo") ? "모바일" : el && el.closest(".wd-t-pc") ? "PC" : el && el.closest('[data-l="en"]') ? "영문" : null;
      hint = h("p", { class: "hidden-note", text: "지금 미리보기 화면에서는 보이지 않는 항목입니다" + (where ? " (" + where + " 화면에서 보임)" : "") + ". 고친 내용은 그대로 저장됩니다." });
    }
    return h("div", { class: "card-head" },
      h("strong", { text: describe(id) }),
      isEdited(id) ? h("span", { class: "tag", text: "수정됨" }) : null,
      hint
    );
  }

  function actions(id, redraw) {
    var row = h("div", { class: "actions" });
    if (Object.prototype.hasOwnProperty.call(S.pending, id)) {
      row.appendChild(h("button", { class: "ghost", text: "이 항목 고친 것 취소", onclick: function () {
        delete S.pending[id];
        previewValue(id, currentValue(id));
        renderBar();
        redraw();
        renderPanel();
      } }));
    }
    if (isEdited(id) || (S.pending[id] && !same(S.pending[id], meta(id).base))) {
      row.appendChild(h("button", { class: "ghost", text: "처음 내용으로", onclick: function () {
        setPending(id, null);
        redraw();
        renderPanel();
      } }));
    }
    return row;
  }

  // ── 패널: 이미지·영상 ─────────────────────────────
  // 이미지 ↔ 영상 바꾸기 버튼. target = 바꿀 자리 id (영상 파일 카드에서는 부모 <video> 의 id)
  function swapButton(target) {
    var tm = meta(target);
    if (!tm || !tm.swap) return null;
    if (tm.swap.tag === "img") {
      return fileButton("영상으로 바꾸기 (mp4)", "video/mp4", function (file, bar) {
        if (file.size > 100 * 1024 * 1024) { toast("영상이 100MB 보다 큽니다. 줄여서 올려 주세요.", "err"); return; }
        return upload(file, "video", 0, bar).then(function (r) {
          return makePoster(file, false).then(function (blob) {
            return upload(new File([blob], "poster.jpg", { type: "image/jpeg" }), "image", 1920, null);
          }).then(function (r2) {
            setPending(target, { as: "video", src: r.url, poster: r2.url });
            toast("영상으로 바꿨어요. 저장하면 사이트에 반영됩니다.");
            renderPanel();
          });
        });
      });
    }
    return fileButton("이미지로 바꾸기 (jpg · png · webp)", "image/jpeg,image/png,image/webp", function (file, bar) {
      return upload(file, "image", 1920, bar).then(function (r) {
        setPending(target, { as: "img", src: r.url });
        toast("이미지로 바꿨어요. 저장하면 사이트에 반영됩니다.");
        renderPanel();
      });
    });
  }

  // 바꾼 자리(이미지 자리의 영상, 영상 자리의 이미지)
  function swappedEditor(id, item) {
    var m = meta(id);
    var body = h("div", { class: "media" });
    if (item.as === "video") {
      body.appendChild(h("video", { src: item.src, poster: item.poster, controls: true, muted: true, preload: "metadata", class: "thumb" }));
      body.appendChild(fileButton("다른 영상으로 바꾸기 (mp4)", "video/mp4", function (file, bar) {
        return upload(file, "video", 0, bar).then(function (r) {
          return makePoster(file, false).then(function (blob) {
            return upload(new File([blob], "poster.jpg", { type: "image/jpeg" }), "image", 1920, null);
          }).then(function (r2) { setPending(id, { as: "video", src: r.url, poster: r2.url }); renderPanel(); });
        });
      }));
    } else {
      body.appendChild(h("img", { src: item.src, class: "thumb", alt: "" }));
      body.appendChild(fileButton("다른 이미지로 바꾸기", "image/jpeg,image/png,image/webp", function (file, bar) {
        return upload(file, "image", 1920, bar).then(function (r) { setPending(id, { as: "img", src: r.url }); renderPanel(); });
      }));
    }
    body.appendChild(h("button", { class: "ghost", text: m.swap.tag === "img" ? "원래 이미지로 되돌리기" : "원래 영상으로 되돌리기", onclick: function () {
      setPending(id, null);
      renderPanel();
    } }));
    body.appendChild(h("p", { class: "hint", text: "자리 크기는 그대로이고, 영상·이미지는 그 자리에 맞춰 채워집니다. 원래와 같은 비율로 올리면 잘리는 곳이 없어요." }));
    return h("section", { class: "card" + (Object.prototype.hasOwnProperty.call(S.pending, id) ? " is-pending" : "") },
      head(id), body, actions(id, function () {}));
  }

  function mediaEditor(id) {
    var m = meta(id);
    var item = currentValue(id);
    if (item.as) return swappedEditor(id, item);
    var key = { img: "src", msource: "srcset", video: "poster", vsource: "src", vimeo: "data-vimeo" }[m.kind];
    var val = item[key] !== undefined ? item[key] : m.base[key];
    var body = h("div", { class: "media" });
    var el = frameEls(id)[0];

    if (m.kind === "vimeo") {
      var inp = h("input", { type: "text", value: val, placeholder: "https://vimeo.com/123456789" });
      var note = h("p", { class: "hint", text: "비메오 주소나 영상 번호를 넣으세요. 재생 버튼을 누르면 이 영상이 나옵니다." });
      inp.addEventListener("input", function () {
        var mm = /vimeo\.com\/(?:video\/)?(\d{5,12})/.exec(inp.value) || /^\s*(\d{5,12})\s*$/.exec(inp.value);
        if (!mm) { inp.classList.add("bad"); return; }
        inp.classList.remove("bad");
        var it = {}; it[key] = mm[1];
        setPending(id, it);
      });
      body.appendChild(h("label", { class: "field" }, h("span", { text: "비메오 영상" }), inp));
      body.appendChild(note);
    } else if (m.kind === "vsource") {
      var vid = h("video", { src: val, controls: true, muted: true, preload: "metadata", class: "thumb" });
      body.appendChild(vid);
      var info = h("p", { class: "hint" });
      vid.addEventListener("loadedmetadata", function () {
        info.textContent = "지금 영상: " + vid.videoWidth + "×" + vid.videoHeight + " · " + Math.round(vid.duration) + "초";
      });
      body.appendChild(info);
      // 같은 <video> 의 포스터(재생 전 정지 화면). 영상만 바꾸면 옛 장면이 남으므로 첫 장면으로 같이 바꾼다 (11.19)
      var videoEl = el && el.parentNode && el.parentNode.tagName === "VIDEO" ? el.parentNode : null;
      var posterId = videoEl && videoEl.getAttribute("data-cms");
      var posterOk = posterId && meta(posterId) && meta(posterId).base.poster !== undefined;
      var bake = posterOk && needsBakedDim(videoEl);
      var posterBox = null;
      if (posterOk) {
        posterBox = h("input", { type: "checkbox", checked: true });
        body.appendChild(h("label", { class: "check" }, posterBox,
          h("span", { text: "첫 장면으로 포스터(재생 전 화면)도 같이 바꾸기" + (bake ? " — 이 자리는 포스터에 어두운 막(60%)을 입힙니다" : "") })));
      }
      body.appendChild(fileButton("영상 바꾸기 (mp4, 100MB 이하)", "video/mp4", function (file, bar) {
        if (file.size > 100 * 1024 * 1024) { toast("영상이 100MB 보다 큽니다. 줄여서 올려 주세요.", "err"); return; }
        if (file.size > 40 * 1024 * 1024) toast("영상이 큽니다 (" + Math.round(file.size / 1048576) + "MB). 방문자 화면에서 늦게 뜰 수 있어요.");
        var withPoster = posterBox && posterBox.checked;
        return upload(file, "video", 0, bar).then(function (r) {
          var it = {}; it[key] = r.url;
          setPending(id, it);
          if (!withPoster) return;
          return makePoster(file, bake).then(function (blob) {
            var pf = new File([blob], "poster.jpg", { type: "image/jpeg" });
            return upload(pf, "image", 1920, null).then(function (r2) {
              setPending(posterId, { poster: r2.url });
              toast("영상과 포스터를 바꿨어요. 저장하면 사이트에 반영됩니다.");
            });
          }).catch(function () {
            toast("영상은 바꿨지만 포스터를 자동으로 만들지 못했어요. 영상 포스터 칸에서 이미지를 직접 올려 주세요.", "err");
          });
        }).then(function () { renderPanel(); });
      }));
      body.appendChild(h("p", { class: "hint", text: "소리가 필요 없는 영상은 소리를 빼고, 가로 1920px · 20MB 안팎으로 줄여서 올리면 빨리 뜹니다." }));
    } else {
      var img = h("img", { src: val, class: "thumb", alt: "" });
      var sizeInfo = h("p", { class: "hint" });
      img.addEventListener("load", function () {
        sizeInfo.textContent = "지금 이미지: " + img.naturalWidth + "×" + img.naturalHeight + " — 같은 비율로 올리면 자리에 꼭 맞습니다.";
      });
      body.appendChild(img);
      body.appendChild(sizeInfo);
      body.appendChild(fileButton("이미지 바꾸기 (jpg · png · webp)", "image/jpeg,image/png,image/webp", function (file, bar) {
        var maxw = img.naturalWidth || 1920;
        if (m.kind === "video" && el && el.videoWidth) maxw = Math.max(maxw, el.videoWidth);
        maxw = Math.min(3840, Math.max(maxw, 400));
        return upload(file, "image", maxw, bar).then(function (r) {
          var it = {}; it[key] = r.url;
          setPending(id, it);
          renderPanel();
        });
      }));
    }
    var swapTarget = m.kind === "img" ? id : m.kind === "vsource" ? m.parent : null;
    var sb = swapTarget ? swapButton(swapTarget) : null;
    if (sb) {
      body.appendChild(h("p", { class: "hint", text: m.kind === "img" ? "이 자리는 영상으로도 바꿀 수 있어요 (소리 없이 자동 반복 재생)." : "이 자리는 이미지로도 바꿀 수 있어요." }));
      body.appendChild(sb);
    }
    return h("section", { class: "card" + (Object.prototype.hasOwnProperty.call(S.pending, id) ? " is-pending" : "") },
      head(id), body, actions(id, function () {}));
  }

  // ── 패널: 로고 목록 (About 로고 띠, 11.19) ─────────────
  // 서버(lib.php cms_logos_html)·빌드(cms.py logos_html)와 같은 모양. 여기서는 미리보기용
  var LOGO_FILL = 9;
  function logosHtml(item) {
    var out = "\n";
    for (var r = 0; r < 2; r++) {
      var row = ((item.rows || [])[r] || []).filter(function (x) { return x && /^(\/[A-Za-z0-9._\/-]+|https:\/\/[A-Za-z0-9._\/-]+)$/.test(x.src || ""); });
      out += '<div class="ab-brands-row">';
      var half = [];
      if (row.length) {
        var reps = Math.max(1, Math.ceil(LOGO_FILL / row.length));
        for (var k = 0; k < reps; k++) row.forEach(function (x) { half.push([x, k === 0]); });
      }
      for (var c = 0; c < 2; c++) {
        half.forEach(function (hx) {
          var show = hx[1] && c === 0;
          out += '<div class="ab-brand"' + (show ? "" : ' aria-hidden="true"') + '><img src="' + esc(hx[0].src) + '" alt="' + (show ? esc(norm(hx[0].alt || "")) : "") + '" /></div>';
        });
      }
      out += "</div>";
    }
    return out;
  }

  function logosEditor(id) {
    var item = currentValue(id);
    var body = h("div", { class: "logos" });
    var wrap;

    function commit() {
      setPending(id, { rows: item.rows });
      wrap.classList.toggle("is-pending", Object.prototype.hasOwnProperty.call(S.pending, id));
    }
    function draw() {
      body.innerHTML = "";
      ["윗줄 (왼쪽으로 흐름)", "아랫줄 (오른쪽으로 흐름)"].forEach(function (title, r) {
        var row = item.rows[r] || (item.rows[r] = []);
        var box = h("div", { class: "logo-row" }, h("b", { text: title + " · " + row.length + "개" }));
        row.forEach(function (x, i) {
          var name = h("input", { type: "text", value: x.alt || "", placeholder: "회사 이름", title: "화면에는 안 보이고, 화면 낭독기·검색엔진이 읽는 이름입니다" });
          name.addEventListener("input", function () { x.alt = name.value; commit(); });
          var move = function (to) {
            row.splice(i, 1);
            if (to === "other") item.rows[1 - r].push(x);
            else row.splice(i + to, 0, x);
            commit();
            draw();
          };
          box.appendChild(h("div", { class: "logo-item" },
            h("img", { src: x.src, alt: "" }),
            name,
            h("div", { class: "logo-btns" },
              h("button", { class: "ghost", text: "↑", title: "앞으로", disabled: i === 0, onclick: function () { move(-1); } }),
              h("button", { class: "ghost", text: "↓", title: "뒤로", disabled: i === row.length - 1, onclick: function () { move(1); } }),
              h("button", { class: "ghost", text: r === 0 ? "아랫줄로" : "윗줄로", onclick: function () { move("other"); } }),
              h("button", { class: "ghost danger", text: "빼기", onclick: function () {
                if (!window.confirm((x.alt || "이 로고") + " 를 띠에서 뺄까요? (저장 전까지는 되돌릴 수 있어요)")) return;
                row.splice(i, 1);
                commit();
                draw();
              } })
            )
          ));
        });
        box.appendChild(fileButton("이 줄에 로고 넣기 (png · jpg · webp)", "image/png,image/jpeg,image/webp", function (file, bar) {
          return upload(file, "image", 600, bar).then(function (res) {
            row.push({ src: res.url, alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") });
            commit();
            draw();
            toast("로고를 넣었어요. 이름 칸을 회사 이름으로 고쳐 주세요.");
          });
        }));
        if (row.length && row.length < LOGO_FILL) {
          box.appendChild(h("p", { class: "hint", text: "로고가 " + LOGO_FILL + "개보다 적어서, 띠가 비지 않게 같은 로고를 반복해 채워요." }));
        }
        body.appendChild(box);
      });
    }

    draw();
    wrap = h("section", { class: "card" + (Object.prototype.hasOwnProperty.call(S.pending, id) ? " is-pending" : "") },
      head(id),
      h("p", { class: "hint", text: "로고는 이 순서대로 띠에서 흐릅니다. 배경이 투명한 png, 가로로 긴 로고(약 400×150)가 가장 잘 맞아요." }),
      body,
      actions(id, function () { item = currentValue(id); draw(); wrap.classList.toggle("is-pending", Object.prototype.hasOwnProperty.call(S.pending, id)); })
    );
    return wrap;
  }

  // 재생 버튼 자리인데 CSS 가 어두운 막(::after)을 씌우지 않는 곳 = 포스터 이미지에 막이 구워져 있는 곳 (상세 10 CJ)
  function needsBakedDim(videoEl) {
    var slot = videoEl.closest("[data-playing]");
    if (!slot) return false;
    var bg = slot.ownerDocument.defaultView.getComputedStyle(slot, "::after").backgroundColor || "";
    var m = /rgba?\(([^)]+)\)/.exec(bg);
    if (!m) return true;
    var parts = m[1].split(",");
    return parts.length === 4 && parseFloat(parts[3]) === 0;
  }

  // 올린 영상 파일에서 포스터(jpg)를 만든다. 첫 장면이 거의 검으면(페이드인) 1초 · 3초 장면으로 넘어간다.
  function makePoster(file, dim) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.src = url;
      var times = [0.05, 1, 3];
      var step = 0;
      var done = function (err, blob) {
        URL.revokeObjectURL(url);
        if (err) reject(err); else resolve(blob);
      };
      var timer = setTimeout(function () { done(new Error("timeout")); }, 20000);
      v.addEventListener("error", function () { clearTimeout(timer); done(new Error("decode")); });
      v.addEventListener("loadedmetadata", function () {
        v.currentTime = Math.min(times[0], v.duration || 0);
      });
      v.addEventListener("seeked", function () {
        var w = v.videoWidth, hh = v.videoHeight;
        if (!w || !hh) { clearTimeout(timer); done(new Error("size")); return; }
        var scale = Math.min(1, 1920 / w);
        var c = document.createElement("canvas");
        c.width = Math.round(w * scale);
        c.height = Math.round(hh * scale);
        var g = c.getContext("2d");
        g.drawImage(v, 0, 0, c.width, c.height);
        // 밝기 확인 (작게 줄여서 평균)
        var s = document.createElement("canvas");
        s.width = 32; s.height = 18;
        s.getContext("2d").drawImage(c, 0, 0, 32, 18);
        var px = s.getContext("2d").getImageData(0, 0, 32, 18).data, sum = 0;
        for (var i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
        var avg = sum / (px.length / 4) / 3;
        if (avg < 14 && step < times.length - 1 && v.duration > times[step + 1]) {
          step++;
          v.currentTime = times[step];
          return;
        }
        if (dim) {
          g.fillStyle = "rgba(0,0,0,0.6)";
          g.fillRect(0, 0, c.width, c.height);
        }
        clearTimeout(timer);
        c.toBlob(function (b) { if (b) done(null, b); else done(new Error("blob")); }, "image/jpeg", 0.88);
      });
    });
  }

  function fileButton(label, accept, onFile) {
    var input = h("input", { type: "file", accept: accept, hidden: true });
    var prog = h("div", { class: "progress" }, h("i"));
    var btn = h("button", { class: "primary", text: label, onclick: function () { input.click(); } });
    input.addEventListener("change", function () {
      var f = input.files[0];
      input.value = "";
      if (!f) return;
      btn.disabled = true;
      prog.classList.add("on");
      S.uploading++;
      renderBar();
      var p = onFile(f, function (r) { prog.firstChild.style.width = Math.round(r * 100) + "%"; });
      Promise.resolve(p).catch(function (e) { toast(e.message, "err"); }).then(function () {
        S.uploading--;
        btn.disabled = false;
        prog.classList.remove("on");
        renderBar();
      });
    });
    return h("div", { class: "file" }, btn, input, prog);
  }

  // ── 패널 ─────────────────────────────────────────
  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = "";
    var tabs = h("div", { class: "tabs" },
      h("button", { class: S.tab === "item" ? "on" : "", text: "선택한 항목", onclick: function () { S.tab = "item"; renderPanel(); } }),
      h("button", { class: S.tab === "list" ? "on" : "", text: "이 페이지 전체 목록", onclick: function () { S.tab = "list"; renderPanel(); } })
    );
    panel.appendChild(tabs);
    var body = h("div", { class: "panel-body" });
    panel.appendChild(body);

    if (S.tab === "item") {
      var ids = S.selected.filter(function (id) { return meta(id) && meta(id).files.indexOf(S.page.file) >= 0; });
      if (!ids.length) {
        body.appendChild(h("div", { class: "empty" },
          h("p", { text: "왼쪽 미리보기에서 고칠 글이나 이미지를 누르세요." }),
          h("p", { class: "hint", text: "영문 문구, 모바일 전용 문구처럼 지금 화면에 안 보이는 것은 위의 ‘언어’ · ‘화면’ 을 바꾸거나 ‘이 페이지 전체 목록’ 에서 찾을 수 있습니다." })
        ));
        return;
      }
      ids.forEach(function (id) {
        var k = meta(id).kind;
        body.appendChild(k === "text" ? textEditor(id) : k === "logos" ? logosEditor(id) : mediaEditor(id));
      });
      return;
    }

    // 전체 목록
    var q = h("input", { type: "search", placeholder: "글자로 찾기", class: "search" });
    var list = h("div", { class: "list" });
    body.appendChild(q);
    body.appendChild(list);
    var all = docOrder(pageIds());
    function draw() {
      list.innerHTML = "";
      var term = q.value.trim().toLowerCase();
      all.forEach(function (id) {
        var m = meta(id);
        var v = currentValue(id);
        var label = m.kind === "logos" ? "로고 " + v.rows.map(function (r) { return r.length; }).join(" + ") + "개: " + v.rows[0].concat(v.rows[1]).map(function (x) { return x.alt; }).join(", ") :
          m.kind === "text" ? v.lines.join(" ⏎ ") : (v.src || v.srcset || v.poster || v["data-vimeo"] || "").split("/").pop();
        if (term && label.toLowerCase().indexOf(term) < 0) return;
        var row = h("button", { class: "list-row" + (Object.prototype.hasOwnProperty.call(S.pending, id) ? " is-pending" : isEdited(id) ? " is-edited" : "") + (hiddenNow(id) ? " is-hidden" : ""), onclick: function () {
          select([id], true);
        } },
          h("small", { text: describe(id) + (hiddenNow(id) ? " · 지금 화면에 안 보임" : "") }),
          h("span", { text: label.length > 140 ? label.slice(0, 140) + "…" : label })
        );
        list.appendChild(row);
      });
    }
    q.addEventListener("input", draw);
    draw();
  }

  function renderBar() {
    if (!bar) return;
    var n = pendingCount();
    bar.querySelector(".pending").textContent = n ? "저장 안 한 변경 " + n + "개" : "변경 없음";
    var save = bar.querySelector(".save");
    save.disabled = !n || S.uploading > 0;
    save.textContent = S.uploading ? "올리는 중…" : "저장해서 사이트에 반영";
  }

  function save() {
    var n = pendingCount();
    if (!n) return;
    var btn = bar.querySelector(".save");
    btn.disabled = true;
    btn.textContent = "저장 중…";
    api("save", { changes: S.pending }).then(function (r) {
      S.content = r.content;
      S.pending = {};
      toast("저장했습니다. 사이트에 반영됐어요.");
      loadFrame(true);
      renderBar();
    }).catch(function (e) {
      if (e.message !== "login") toast(e.message, "err");
      renderBar();
    });
  }

  function showHistory() {
    var box = h("div", { class: "modal-box" }, h("h2", { text: "저장 기록" }), h("p", { class: "hint", text: "저장할 때마다 그 직전 상태가 남습니다. 되돌리면 그 시점의 내용으로 사이트가 바뀝니다 (되돌리기 전 상태도 기록에 남습니다)." }));
    var modal = h("div", { class: "modal", onclick: function (e) { if (e.target === modal) modal.remove(); } }, box);
    document.body.appendChild(modal);
    var list = h("div", { class: "hist" }, h("p", { text: "불러오는 중…" }));
    box.appendChild(list);
    box.appendChild(h("div", { class: "actions" }, h("button", { class: "ghost", text: "닫기", onclick: function () { modal.remove(); } })));
    api("history").then(function (r) {
      list.innerHTML = "";
      if (!r.history.length) list.appendChild(h("p", { text: "아직 기록이 없습니다." }));
      r.history.forEach(function (it) {
        var d = it.name.replace(/^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d).*$/, "$1.$2.$3 $4:$5:$6");
        list.appendChild(h("div", { class: "hist-row" },
          h("span", { text: d + " 직전 · 고친 항목 " + it.count + "개" }),
          h("button", { class: "ghost", text: "이 상태로 되돌리기", onclick: function () {
            if (pendingCount() && !confirm("저장 안 한 변경이 있습니다. 버리고 되돌릴까요?")) return;
            if (!confirm(d + " 직전 상태로 사이트를 되돌릴까요?")) return;
            api("restore", { name: it.name }).then(function (r2) {
              S.content = r2.content;
              S.pending = {};
              modal.remove();
              toast("되돌렸습니다.");
              loadFrame(true);
              renderBar();
            }).catch(function (e) { toast(e.message, "err"); });
          } })
        ));
      });
    }).catch(function (e) { list.textContent = e.message; });
  }

  // ── 화면 ─────────────────────────────────────────
  function pageLabel(p) {
    if (PAGE_NAMES[p.route] !== undefined) return PAGE_NAMES[p.route];
    var t = (p.title || p.route).replace(/\s*[|–-]\s*PL2.*$/i, "");
    return p.num ? "상세 " + p.num + " · " + t : t;
  }

  function hasEnglish() {
    var d = frameDoc();
    return !!(d && d.documentElement.hasAttribute("data-en"));
  }

  function renderEditor() {
    app.innerHTML = "";
    var pageSel = h("select", { class: "page-sel" });
    S.index.pages.forEach(function (p, i) {
      pageSel.appendChild(h("option", { value: i, text: pageLabel(p), selected: p === S.page }));
    });
    pageSel.addEventListener("change", function () {
      S.page = S.index.pages[+pageSel.value];
      S.selected = [];
      loadFrame(false);
    });
    function seg(name, opts, cur, onPick) {
      var w = h("div", { class: "seg", "data-name": name });
      opts.forEach(function (o) {
        w.appendChild(h("button", { class: o[0] === cur ? "on" : "", text: o[1], onclick: function () {
          Array.prototype.forEach.call(w.children, function (b) { b.classList.remove("on"); });
          this.classList.add("on");
          onPick(o[0]);
        } }));
      });
      return w;
    }
    bar = h("header", { class: "bar" },
      h("strong", { class: "logo", text: "PL2 사이트 관리" }),
      pageSel,
      seg("view", [["pc", "PC 화면"], ["mo", "모바일 화면"]], S.view, function (v) { S.view = v; loadFrame(true); }),
      seg("lang", [["ko", "한글"], ["en", "영문"]], S.lang, function (v) { S.lang = v; loadFrame(true); }),
      seg("mode", [["edit", "고치기"], ["play", "둘러보기"]], S.editMode ? "edit" : "play", function (v) {
        S.editMode = v === "edit";
        var d = frameDoc();
        if (d) d.documentElement.classList.toggle("cms-edit", S.editMode);
      }),
      h("span", { class: "spacer" }),
      h("span", { class: "pending" }),
      h("button", { class: "save primary", onclick: save }),
      h("button", { class: "ghost", text: "저장 기록", onclick: showHistory }),
      h("button", { class: "ghost", text: "로그아웃", onclick: function () {
        if (pendingCount() && !confirm("저장 안 한 변경이 있습니다. 로그아웃할까요?")) return;
        api("logout", {}).then(function () { location.reload(); });
      } })
    );
    frame = h("iframe", { class: "frame", title: "미리보기" });
    frameWrap = h("div", { class: "stage" }, frame);
    // PC 화면 틀은 스크롤되면 안 된다 (iframe 안 요소로 스크롤할 때 브라우저가 바깥 틀까지 밀던 문제)
    frameWrap.addEventListener("scroll", function () {
      if (S.view !== "mo") { frameWrap.scrollTop = 0; frameWrap.scrollLeft = 0; }
    });
    panel = h("aside", { class: "panel" });
    app.appendChild(bar);
    app.appendChild(h("main", { class: "work" }, frameWrap, panel));
    renderBar();
    loadFrame(false);
    window.addEventListener("resize", fitFrame);
  }

  function showLogin(msg) {
    csrf = "";
    app.innerHTML = "";
    var pw = h("input", { type: "password", autocomplete: "current-password", placeholder: "비밀번호" });
    var err = h("p", { class: "err", text: msg || "" });
    var form = h("form", { class: "login", onsubmit: function (e) {
      e.preventDefault();
      err.textContent = "";
      api("login", { password: pw.value }).then(function (r) {
        csrf = r.csrf;
        start();
      }).catch(function (e2) { err.textContent = e2.message; });
    } },
      h("h1", { text: "PL2 사이트 관리" }),
      pw,
      h("button", { class: "primary", type: "submit", text: "로그인" }),
      err
    );
    app.appendChild(form);
    setTimeout(function () { pw.focus(); }, 0);
  }

  function start() {
    api("state").then(function (r) {
      S.index = r.index;
      S.content = r.content;
      if (Array.isArray(S.content.items)) S.content.items = {};
      S.page = S.page || S.index.pages.filter(function (p) { return p.route === ""; })[0] || S.index.pages[0];
      renderEditor();
    }).catch(function (e) { if (e.message !== "login") showLogin(e.message); });
  }

  window.addEventListener("beforeunload", function (e) {
    if (S.index && pendingCount()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  if (csrf) start();
  else showLogin();
})();
