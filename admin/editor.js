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
  function attrsHtml(list) {
    return list.map(function (a) { return a[1] === null ? " " + a[0] : " " + a[0] + '="' + a[1] + '"'; }).join("");
  }
  var SCALE_MIN = 30; // 크기 % 는 30~99 정수 (100 = 원래 크기라 값을 두지 않는다). cms.py scale_ok · lib.php 와 같게
  function sizeAttrs(attrs, item, drop) {
    var keep = attrs.filter(function (a) { return (drop || []).indexOf(a[0]) < 0; });
    var parts = [], flags = "";
    var fit = item.fit;
    if (fit && fit.w > 0 && fit.h > 0) {
      parts.push("--cms-ar: " + fit.w + " / " + fit.h);
      if (fit.mw > 0 && fit.mh > 0) parts.push("--cms-ar-mo: " + fit.mw + " / " + fit.mh);
      flags += " data-cms-fit";
    }
    if (typeof item.scale === "number" && item.scale % 1 === 0 && item.scale >= SCALE_MIN && item.scale <= 99) {
      parts.push("scale: " + item.scale + "%");
      flags += " data-cms-scale";
    }
    if (!parts.length) return attrsHtml(keep);
    var style = null;
    keep.forEach(function (a) { if (a[0] === "style" && style === null) style = a[1]; });
    var rest = keep.filter(function (a) { return a[0] !== "style"; });
    var st = (style ? style.replace(/[ ;]+$/, "") + "; " : "") + parts.join("; ");
    return attrsHtml(rest) + flags + ' style="' + st + '"';
  }
  function elementHtml(id, sw, item) {
    var form = item.as || sw.tag;
    if (form === sw.tag) {
      var s0 = "<" + form + ' data-cms="' + id + '"' + sizeAttrs(sw.attrs, item);
      return form === "img" ? s0 + " />" : s0 + ">" + sw.inner + "</video>";
    }
    var head = "<" + form + ' data-cms="' + id + '" data-cms-swap';
    if (form === "video") {
      var srcs = (item.msrc ? '<source media="(max-width: 599.98px)" src="' + esc(item.msrc) + '" type="video/mp4" />' : "") +
        '<source src="' + esc(item.src || "") + '" type="video/mp4" />';
      return head + sizeAttrs(sw.attrs, item, IMG_ONLY) + ' poster="' + esc(item.poster || "") + '" autoplay muted loop playsinline preload="metadata">' + srcs + "</video>";
    }
    return head + sizeAttrs(sw.attrs, item, VIDEO_ONLY) + ' src="' + esc(item.src || "") + '" alt="" />';
  }
  function swapHtml(id, sw, item) {
    var el = elementHtml(id, sw, item);
    if (!sw.wrap) return el;
    var inner = (item.as || sw.tag) === sw.tag ? sw.wrap.pre + el + sw.wrap.post : el;
    return "<picture" + attrsHtml(sw.wrap.attrs) + ">" + inner + "</picture>";
  }
  function swapForm(id) {
    var el = frameEls(id)[0];
    return el ? el.tagName.toLowerCase() : null;
  }

  function previewValue(id, item) {
    var m = meta(id);
    if (m.swap) {
      frameEls(id).forEach(function (el) {
        var box = m.swap.wrap ? el.closest("picture") : el;
        if (box) box.outerHTML = swapHtml(id, m.swap, item);
      });
      if (!item.as) (m.children || []).forEach(function (c) { previewValue(c, currentValue(c)); });
      markSelected();
      if (item.as) return;
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
    if (S.mode === "pages") { pagePreview(true); return; }
    var y = 0;
    var d = frameDoc();
    if (keepScroll && d && d.defaultView) y = d.defaultView.scrollY;
    frame.onload = function () { onFrameLoad(y); };
    frame.removeAttribute("srcdoc"); // 새 페이지 미리보기(srcdoc)가 남아 있으면 src 보다 앞선다
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
    if (S.wo && isWorks()) previewOrder();
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

  // ── 크기 설정 (11.19): 높이를 파일 비율에 맞춤(fit) · 크기 단계(scale). 자리 id 의 값에 붙는다 ──
  function sizeOwner(id) {
    var m = meta(id);
    if (m.swap) return id;
    return m.parent && meta(m.parent) && meta(m.parent).swap ? m.parent : null;
  }
  // 파일만 바꿀 때 그 자리의 크기 설정이 지워지지 않게
  function withSize(id, it) {
    var cur = currentValue(id);
    if (cur.fit && it.fit === undefined) it.fit = cur.fit;
    if (cur.scale && it.scale === undefined) it.scale = cur.scale;
    return it;
  }
  function mediaSize(url, video) {
    return new Promise(function (resolve) {
      if (!url) return resolve(null);
      var el = document.createElement(video ? "video" : "img");
      var t = setTimeout(function () { resolve(null); }, 15000);
      if (video) {
        el.preload = "metadata"; el.muted = true;
        el.onloadedmetadata = function () { clearTimeout(t); resolve(el.videoWidth ? [el.videoWidth, el.videoHeight] : null); };
      } else {
        el.onload = function () { clearTimeout(t); resolve(el.naturalWidth ? [el.naturalWidth, el.naturalHeight] : null); };
      }
      el.onerror = function () { clearTimeout(t); resolve(null); };
      el.src = url;
    });
  }
  // 지금 값의 파일 크기 → {w, h, mw, mh}
  function fileDims(owner) {
    var m = meta(owner), it = currentValue(owner), kids = m.children || [];
    var pc, mo = null;
    if (it.as === "video") { pc = mediaSize(it.src, true); if (it.msrc) mo = mediaSize(it.msrc, true); }
    else if (it.as === "img") pc = mediaSize(it.src, false);
    else if (m.swap.tag === "img") {
      pc = mediaSize(it.src || m.base.src, false);
      kids.forEach(function (k) { if (meta(k).kind === "msource") { var v = currentValue(k); mo = mediaSize(v.srcset || meta(k).base.srcset, false); } });
    } else {
      var vs = kids.filter(function (k) { return meta(k).kind === "vsource"; })[0];
      pc = vs ? mediaSize(currentValue(vs).src || meta(vs).base.src, true) : mediaSize(it.poster || m.base.poster, false);
    }
    return Promise.all([pc, mo]).then(function (r) {
      if (!r[0]) return null;
      var f = { w: r[0][0], h: r[0][1] };
      if (r[1]) { f.mw = r[1][0]; f.mh = r[1][1]; }
      return f;
    });
  }
  function refreshFit(owner) {
    if (!currentValue(owner).fit) return Promise.resolve();
    return fileDims(owner).then(function (f) {
      var it = currentValue(owner);
      if (!it.fit) return;
      if (f) it.fit = f;
      setPending(owner, it);
      if (S.tab === "item") renderPanel();
    });
  }
  // 이 항목의 파일이 바뀐 뒤: 높이 맞춤이 켜진 자리면 비율을 다시 잰다
  function afterFileChange(id) {
    var o = sizeOwner(id);
    if (o) refreshFit(o);
  }

  function sizeControls(owner) {
    var m = meta(owner);
    if (!m || !m.swap || (!m.fit && !m.scale)) return null;
    var it = currentValue(owner);
    var box = h("div", { class: "size-box" }, h("b", { text: "크기" }));
    if (m.fit) {
      var cb = h("input", { type: "checkbox", checked: !!it.fit });
      cb.addEventListener("change", function () {
        cb.disabled = true;
        if (!cb.checked) {
          var v = currentValue(owner); delete v.fit; setPending(owner, v); renderPanel(); return;
        }
        fileDims(owner).then(function (f) {
          if (!f) { toast("파일 크기를 읽지 못했어요. 잠시 뒤 다시 해 주세요.", "err"); renderPanel(); return; }
          var v = currentValue(owner); v.fit = f; setPending(owner, v); renderPanel();
        });
      });
      box.appendChild(h("label", { class: "check" }, cb, h("span", { text: "자리 높이를 올린 파일 비율에 맞추기" + (it.fit ? " (지금 " + it.fit.w + "×" + it.fit.h + (it.fit.mw ? ", 모바일 " + it.fit.mw + "×" + it.fit.mh : "") + ")" : "") })));
      box.appendChild(h("p", { class: "hint", text: "폭은 디자인 그대로, 높이만 파일 비율대로 바뀌어 잘리는 곳이 없어집니다. 아래 내용은 그만큼 밀리거나 당겨집니다." }));
    }
    if (m.scale) {
      var setScale = function (n) {
        var v = currentValue(owner);
        n = Math.round(n);
        if (!(n >= SCALE_MIN) || n >= 100) delete v.scale; else v.scale = n;
        setPending(owner, v);
        renderPanel();
      };
      var num = h("input", { type: "number", class: "scale-num", min: SCALE_MIN, max: 100, step: 1, value: it.scale || 100 });
      num.addEventListener("change", function () {
        var n = parseInt(num.value, 10);
        if (isNaN(n)) n = 100;
        setScale(Math.max(SCALE_MIN, Math.min(100, n)));
      });
      var quick = h("span", { class: "scale-quick" });
      [100, 90, 80, 70, 50].forEach(function (q) {
        quick.appendChild(h("button", { class: "ghost" + ((it.scale || 100) === q ? " on" : ""), text: q + "%", onclick: function () { setScale(q); } }));
      });
      box.appendChild(h("div", { class: "field" }, h("span", { text: "보이는 크기 % (" + SCALE_MIN + "~100, 가운데 기준으로 줄어듭니다)" }),
        h("div", { class: "scale-row" }, num, h("span", { text: "%" }), quick)));
    }
    return box;
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
            setPending(target, withSize(target, { as: "video", src: r.url, poster: r2.url }));
            toast("영상으로 바꿨어요. 저장하면 사이트에 반영됩니다.");
            afterFileChange(target);
            renderPanel();
          });
        });
      });
    }
    return fileButton("이미지로 바꾸기 (jpg · png · webp)", "image/jpeg,image/png,image/webp", function (file, bar) {
      return upload(file, "image", 1920, bar).then(function (r) {
        setPending(target, withSize(target, { as: "img", src: r.url }));
        toast("이미지로 바꿨어요. 저장하면 사이트에 반영됩니다.");
        afterFileChange(target);
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
          }).then(function (r2) {
            var v = withSize(id, { as: "video", src: r.url, poster: r2.url });
            if (item.msrc) v.msrc = item.msrc;
            setPending(id, v); afterFileChange(id); renderPanel();
          });
        });
      }));
      if (m.swap.wrap) {
        // PC·모바일 이미지가 따로 있던 자리: 모바일 영상도 따로 (없으면 PC 영상을 모바일에서도)
        if (item.msrc) {
          body.appendChild(h("video", { src: item.msrc, controls: true, muted: true, preload: "metadata", class: "thumb thumb-mo" }));
          body.appendChild(h("button", { class: "ghost", text: "모바일 영상 빼기 (모바일에서도 PC 영상)", onclick: function () {
            var v = currentValue(id); delete v.msrc; setPending(id, v); afterFileChange(id); renderPanel();
          } }));
        }
        body.appendChild(fileButton(item.msrc ? "다른 모바일 영상으로 바꾸기" : "모바일 영상 따로 올리기 (선택)", "video/mp4", function (file, bar) {
          return upload(file, "video", 0, bar).then(function (r) {
            var v = currentValue(id); v.msrc = r.url; setPending(id, v); afterFileChange(id); renderPanel();
          });
        }));
      }
    } else {
      body.appendChild(h("img", { src: item.src, class: "thumb", alt: "" }));
      body.appendChild(fileButton("다른 이미지로 바꾸기", "image/jpeg,image/png,image/webp", function (file, bar) {
        return upload(file, "image", 1920, bar).then(function (r) { setPending(id, withSize(id, { as: "img", src: r.url })); afterFileChange(id); renderPanel(); });
      }));
    }
    body.appendChild(h("button", { class: "ghost", text: m.swap.tag === "img" ? "원래 이미지로 되돌리기" : "원래 영상으로 되돌리기", onclick: function () {
      var cur = currentValue(id), v = {};
      if (cur.fit) v.fit = cur.fit;
      if (cur.scale) v.scale = cur.scale;
      setPending(id, Object.keys(v).length ? v : null);
      afterFileChange(id);
      renderPanel();
    } }));
    body.appendChild(h("p", { class: "hint", text: "자리 크기는 그대로이고, 영상·이미지는 그 자리에 맞춰 채워집니다. 원래와 같은 비율로 올리면 잘리는 곳이 없어요." }));
    var sc = sizeControls(id);
    if (sc) body.appendChild(sc);
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
          afterFileChange(id);
          if (!withPoster) return;
          return makePoster(file, bake).then(function (blob) {
            var pf = new File([blob], "poster.jpg", { type: "image/jpeg" });
            return upload(pf, "image", 1920, null).then(function (r2) {
              setPending(posterId, meta(posterId).swap ? withSize(posterId, { poster: r2.url }) : { poster: r2.url });
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
          setPending(id, m.swap ? withSize(id, it) : it);
          afterFileChange(id);
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
    var szc = swapTarget ? sizeControls(swapTarget) : null;
    if (szc) body.appendChild(szc);
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
  // ── Works 카드 순서 (11.20) ─────────────────────────
  // 미리보기의 두 열에서 카드를 읽어 위·아래·옆 줄로 옮긴다. 저장하면 서버(admin/pages.php works_order)가
  // pages.json 에 순서를 두고 Works 목록 html 을 다시 쓴다. 이름표: 새 페이지 = p:<id>, 기존 카드 = 첫 data-cms id
  function isWorks() {
    return S.mode !== "pages" && S.page && S.page.route === "works/";
  }
  function readCards() {
    var d = frameDoc();
    var cols = d ? d.querySelectorAll(".wk-grid > .wk-col") : [];
    if (cols.length !== 2) return null;
    return [0, 1].map(function (ci) {
      return Array.prototype.map.call(cols[ci].children, function (c) {
        var pid = c.getAttribute("data-cms-page");
        var first = c.querySelector("[data-cms]");
        var media = c.querySelector(".wk-card-media");
        var proj = c.querySelector(".wk-card-project"), brand = c.querySelector(".wk-card-brand");
        return {
          key: pid ? "p:" + pid : first ? first.getAttribute("data-cms") : "",
          thumb: media ? (media.tagName === "VIDEO" ? media.poster : media.currentSrc || media.src) : "",
          name: proj ? proj.textContent.trim() : "",
          brand: brand ? brand.textContent.trim() : "",
          isNew: !!pid,
          hidden: c.tagName === "ARTICLE"
        };
      }).filter(function (x) { return x.key; });
    });
  }
  function cardNode(d, key) {
    if (key.slice(0, 2) === "p:") return d.querySelector('.wk-col > [data-cms-page="' + key.slice(2) + '"]');
    var el = d.querySelector('.wk-col [data-cms="' + key + '"]');
    while (el && !(el.parentNode && el.parentNode.classList && el.parentNode.classList.contains("wk-col"))) el = el.parentNode;
    return el;
  }
  function previewOrder() {
    var d = frameDoc();
    var cols = d ? d.querySelectorAll(".wk-grid > .wk-col") : [];
    if (cols.length !== 2 || !S.wo) return;
    S.wo.cols.forEach(function (col, ci) {
      col.forEach(function (x) { var n = cardNode(d, x.key); if (n) cols[ci].appendChild(n); });
    });
  }
  function orderPanel(body) {
    if (!S.wo) {
      var c = readCards();
      if (!c) {
        body.appendChild(h("p", { class: "empty", text: "미리보기를 불러오는 중입니다. 잠시 뒤 다시 눌러 주세요." }));
        return;
      }
      S.wo = { cols: c, saved: clone(c), dirty: false };
    }
    var wo = S.wo;
    function moved() {
      wo.dirty = true;
      previewOrder();
      var y = body.scrollTop;
      renderPanel();
      var b2 = panel.querySelector(".panel-body");
      if (b2) b2.scrollTop = y;
    }
    body.appendChild(h("p", { class: "hint", text: "PC 에서는 왼쪽·오른쪽 두 줄로 보이고, 모바일에서는 두 줄을 위에서부터 번갈아 섞어 한 줄로 보여요. 화살표로 옮기면 미리보기에 바로 보이고, ‘카드 순서 저장’ 을 눌러야 사이트에 반영됩니다." }));
    var grid = h("div", { class: "wo-cols" });
    ["왼쪽 줄", "오른쪽 줄"].forEach(function (label, ci) {
      var col = wo.cols[ci];
      var box = h("div", { class: "wo-col" }, h("b", { text: label + " (" + col.length + ")" }));
      col.forEach(function (x, i) {
        box.appendChild(h("div", { class: "wo-item" + (x.isNew ? " is-new" : "") },
          x.thumb ? h("img", { src: x.thumb, alt: "", class: "wo-thumb" }) : h("div", { class: "wo-thumb" }),
          h("small", { class: "wo-name", text: (x.name || x.brand || x.key) + (x.hidden ? " (비공개 카드)" : "") }),
          h("div", { class: "wo-btns" },
            h("button", { class: "ghost", text: "↑", title: "위로", disabled: i === 0, onclick: function () { col.splice(i - 1, 0, col.splice(i, 1)[0]); moved(); } }),
            h("button", { class: "ghost", text: "↓", title: "아래로", disabled: i === col.length - 1, onclick: function () { col.splice(i + 1, 0, col.splice(i, 1)[0]); moved(); } }),
            h("button", { class: "ghost", text: ci === 0 ? "→" : "←", title: ci === 0 ? "오른쪽 줄로" : "왼쪽 줄로", onclick: function () {
              var other = wo.cols[1 - ci];
              other.splice(Math.min(i, other.length), 0, col.splice(i, 1)[0]);
              moved();
            } }))));
      });
      grid.appendChild(box);
    });
    body.appendChild(grid);
    body.appendChild(h("div", { class: "actions pe-save" },
      h("button", { class: "primary", text: "카드 순서 저장", disabled: !wo.dirty, onclick: function () {
        var btn = this;
        btn.disabled = true;
        api("works_order", { cols: wo.cols.map(function (col) { return col.map(function (x) { return x.key; }); }) }).then(function (r) {
          S.pages = r.pages;
          wo.saved = clone(wo.cols);
          wo.dirty = false;
          toast("카드 순서를 저장했습니다. 사이트 Works 목록에 반영됐어요.");
          renderPanel();
        }).catch(function (e) { toast(e.message, "err"); btn.disabled = false; });
      } }),
      h("button", { class: "ghost", text: "옮긴 것 되돌리기", disabled: !wo.dirty, onclick: function () {
        wo.cols = clone(wo.saved);
        wo.dirty = false;
        previewOrder();
        renderPanel();
      } })));
  }

  function renderPanel() {
    if (!panel) return;
    if (S.mode === "pages") { pagesPanel(); return; }
    panel.innerHTML = "";
    var tabs = h("div", { class: "tabs" },
      h("button", { class: S.tab === "item" ? "on" : "", text: "선택한 항목", onclick: function () { S.tab = "item"; renderPanel(); } }),
      h("button", { class: S.tab === "list" ? "on" : "", text: "이 페이지 전체 목록", onclick: function () { S.tab = "list"; renderPanel(); } }),
      isWorks() ? h("button", { class: S.tab === "order" ? "on" : "", text: "카드 순서", onclick: function () { S.tab = "order"; renderPanel(); } }) : null
    );
    panel.appendChild(tabs);
    var body = h("div", { class: "panel-body" });
    panel.appendChild(body);
    if (S.tab === "order") {
      if (isWorks()) { orderPanel(body); return; }
      S.tab = "item";
      tabs.firstChild.classList.add("on");
    }

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

  // 페이지 선택 상자: 사이트 페이지 → 직접 만든 페이지 → 새로 만들기·관리
  function fillPageSel() {
    var sel = S.pageSel;
    if (!sel) return;
    sel.innerHTML = "";
    [["기본 페이지", false], ["상세 페이지", true]].forEach(function (g) {
      var og = h("optgroup", { label: g[0] });
      S.index.pages.forEach(function (p, i) {
        if (!!p.num !== g[1]) return;
        og.appendChild(h("option", { value: i, text: pageLabel(p), selected: S.mode !== "pages" && p === S.page }));
      });
      if (og.children.length) sel.appendChild(og);
    });
    var list = (S.pages && S.pages.pages) || [];
    if (list.length) {
      var g = h("optgroup", { label: "직접 만든 페이지" });
      list.forEach(function (pg) {
        // 줄바꿈은 띄어쓰기로, 한 글자씩 끊은 한글(닌/텐/도)은 붙여서
        var t = String(pg.title || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean)
          .reduce(function (a, x) { return !a ? x : a + (/[가-힣]$/.test(a) && /^[가-힣]/.test(x) ? "" : " ") + x; }, "") || pg.slug;
        g.appendChild(h("option", { value: "pe:" + pg.id, text: t + (pg.status === "public" ? "" : " (임시 저장)"),
          selected: S.mode === "pages" && S.pe && S.pe.id === pg.id }));
      });
      sel.appendChild(g);
    }
    sel.appendChild(h("option", { value: "pages", text: "＋ 새 페이지 만들기 · 관리",
      selected: S.mode === "pages" && !(S.pe && S.pe.id && list.some(function (pg) { return pg.id === S.pe.id; })) }));
  }

  function renderEditor() {
    app.innerHTML = "";
    var pageSel = h("select", { class: "page-sel" });
    S.pageSel = pageSel;
    fillPageSel();
    pageSel.addEventListener("change", function () {
      var v = pageSel.value;
      var leaving = S.mode === "pages" && S.pe && S.peDirty;
      if (leaving && !confirm("새 페이지에 저장 안 한 내용이 있습니다. 나갈까요?")) {
        fillPageSel();
        return;
      }
      if (S.wo && S.wo.dirty && !confirm("Works 카드 순서를 저장하지 않았습니다. 나갈까요?")) {
        fillPageSel();
        return;
      }
      S.wo = null;
      if (v === "pages" || v.slice(0, 3) === "pe:") {
        if (S.mode !== "pages" && pendingCount()) toast("저장 안 한 글·이미지 변경은 그대로 남아 있어요. 페이지로 돌아가 저장해 주세요.");
        S.mode = "pages";
        S.peDirty = false;
        bar.classList.add("is-pages");
        var id = v === "pages" ? "" : v.slice(3);
        openPages(id);
        return;
      }
      S.mode = "site";
      S.pe = null;
      S.peDirty = false;
      bar.classList.remove("is-pages");
      S.page = S.index.pages[+v];
      S.selected = [];
      loadFrame(false);
      renderPanel();
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
      // 직접 만든 페이지도 페이지 선택에 넣는다 (못 받아도 편집은 된다)
      return api("pages").then(function (p) { S.pages = p.pages; }, function () {}).then(renderEditor);
    }).catch(function (e) { if (e.message !== "login") showLogin(e.message); });
  }

  // ── 새 페이지 (11.19) ─────────────────────────────
  // 고객사가 직접 만드는 상세 페이지. 서버 admin/pages.php 가 /works/<slug>/ 와 Works 카드를 만든다.
  // 미리보기는 서버가 실제와 같은 틀로 만들어 준 html 을 그대로 보여 준다.
  function blankPage() {
    return { slug: "", status: "draft", brand: "", title: "", tags: [], desc: "", hero: null,
      intro: { title: "", ko: "", en: "" }, card: { size: "m" }, blocks: [newGrid("single")] };
  }
  function openPages(id) {
    return api("pages").then(function (r) {
      S.pages = r.pages;
      if (!Array.isArray(S.pages.pages)) S.pages.pages = [];
      var pg = id ? S.pages.pages.filter(function (x) { return x.id === id; })[0] : null;
      S.pe = pg ? { id: pg.id, page: clone(pg) } : null;
      S.peDirty = false;
      fillPageSel();
      renderPanel();
      pagePreview(true);
    }).catch(function (e) { toast(e.message, "err"); });
  }
  // 편집 화면 → 목록
  function peToList() {
    if (S.peDirty && !confirm("저장 안 한 내용이 있습니다. 목록으로 갈까요?")) return;
    S.pe = null;
    S.peDirty = false;
    fillPageSel();
    renderPanel();
    pagePreview(true);
  }
  function peChanged(redraw) {
    S.peDirty = true;
    if (redraw) {
      var body = panel.querySelector(".panel-body");
      var y = body ? body.scrollTop : 0;
      renderPanel();
      var b2 = panel.querySelector(".panel-body");
      if (b2) b2.scrollTop = y;
    }
    clearTimeout(S.pvTimer);
    S.pvTimer = setTimeout(function () { pagePreview(false); }, 700);
  }
  // 미리보기용: 빈 칸은 빼고 보낸다
  function previewCopy(p) {
    var c = clone(p);
    c.blocks = (c.blocks || []).map(function (b) {
      if (b.type === "media") { b.items = (b.items || []).filter(function (m) { return m && m.src; }); return b; }
      if (b.type === "grid") {
        b.cols.forEach(function (c) { c.items = c.items.filter(function (it) { return it.type === "text" || it.src; }); });
        return b;
      }
      return b;
    }).filter(function (b) {
      if (b.type === "media") return b.items.length > 0;
      if (b.type === "grid") return b.cols.some(function (c) { return c.items.some(function (it) { return it.src; }); }) &&
        b.cols.reduce(function (a, c) { return a + c.w; }, 0) <= 100 &&
        b.cols.every(function (c) { return c.items.every(function (it) { return it.x || (it.w || 100) + (it.ml || 0) <= 100; }); });
      if (b.type === "film") return /^[0-9]{5,12}$/.test(b.vimeo || "") && b.poster;
      if (FX[b.type]) return fxReady(b);
      return true;
    });
    if (c.card && !c.card.media) delete c.card.media;
    return c;
  }
  function stageMessage(msg) {
    frame.onload = null;
    frame.removeAttribute("src");
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;font:15px/1.6 -apple-system,sans-serif;color:#6d6d68;background:#f4f4f2;text-align:center;padding:24px">' + esc(msg) + "</body>";
    fitFrame();
  }
  function pagePreview(force) {
    if (S.mode !== "pages") return;
    if (!S.pe) {
      stageMessage("오른쪽에서 새 페이지를 만들거나, 만든 페이지를 골라 고치세요.");
      return;
    }
    var p = S.pe.page;
    if (!p.hero || !p.hero.src || !String(p.title || "").trim()) {
      stageMessage("제목과 첫 화면(히어로) 이미지·영상을 넣으면 여기에 미리보기가 나옵니다.");
      return;
    }
    var seq = (S.pvSeq || 0) + 1;
    S.pvSeq = seq;
    api("page_preview", { id: S.pe.id || "", page: previewCopy(p) }).then(function (r) {
      if (seq !== S.pvSeq) return;
      var d = frameDoc();
      var y = !force && d && d.defaultView ? d.defaultView.scrollY : 0;
      frame.onload = function () { if (y) try { frame.contentWindow.scrollTo(0, y); } catch (e) {} };
      frame.removeAttribute("src");
      frame.srcdoc = r.html;
      fitFrame();
    }).catch(function (e) { if (seq === S.pvSeq) stageMessage(e.message); });
  }

  function mediaThumb(m) {
    if (!m || !m.src) return h("div", { class: "pm-empty", text: "비어 있음" });
    return m.type === "video"
      ? h("video", { src: m.src, poster: m.poster, muted: true, preload: "metadata", class: "pm-thumb" })
      : h("img", { src: m.src, alt: "", class: "pm-thumb" });
  }
  // 이미지·영상 한 칸 고르기. onSet(새 값 | null)
  function mediaPick(cur, onSet, optional, imgOnly) {
    var box = h("div", { class: "pm" }, mediaThumb(cur));
    if (cur && cur.src) {
      var dims = h("small", { class: "hint pm-dims", text: "파일 크기 읽는 중…" });
      box.appendChild(dims);
      mediaSize(cur.src, cur.type === "video").then(function (r) {
        dims.textContent = r ? "지금 파일: " + r[0] + "×" + r[1] + (r[0] < 1200 && cur.type !== "video" ? " — 작아서 큰 화면에서 흐려 보일 수 있어요" : "") : "";
      });
    }
    var btns = h("div", { class: "pm-btns" });
    btns.appendChild(fileButton(cur && cur.src ? "이미지로 바꾸기" : "이미지 올리기", "image/jpeg,image/png,image/webp", function (file, bar) {
      return upload(file, "image", 1920, bar).then(function (r) { onSet({ type: "img", src: r.url }); });
    }));
    if (!imgOnly) btns.appendChild(fileButton(cur && cur.src ? "영상으로 바꾸기" : "영상 올리기 (mp4)", "video/mp4", function (file, bar) {
      if (file.size > 100 * 1024 * 1024) { toast("영상이 100MB 보다 큽니다. 줄여서 올려 주세요.", "err"); return; }
      return upload(file, "video", 0, bar).then(function (r) {
        return makePoster(file, false).then(function (blob) {
          return upload(new File([blob], "poster.jpg", { type: "image/jpeg" }), "image", 1920, null);
        }).then(function (r2) { onSet({ type: "video", src: r.url, poster: r2.url }); });
      });
    }));
    if (optional && cur && cur.src) btns.appendChild(h("button", { class: "ghost", text: "비우기", onclick: function () { onSet(null); } }));
    box.appendChild(btns);
    return box;
  }
  function field(label, input, hint) {
    return h("label", { class: "field" }, h("span", { text: label }), input, hint ? h("small", { class: "hint", text: hint }) : null);
  }
  function textIn(obj, key, multi, ph) {
    var el = h(multi ? "textarea" : "input", multi ? { rows: 3, class: "pe-ta", placeholder: ph || "" } : { type: "text", placeholder: ph || "" });
    el.value = obj[key] || "";
    el.addEventListener("input", function () { obj[key] = el.value; peChanged(false); });
    return el;
  }

  // 선택 상자 하나. opts = [[값, 이름]…], onPick(값) 뒤 미리보기 갱신
  function optSel(opts, cur, onPick) {
    var sel = h("select", {});
    opts.forEach(function (o) { sel.appendChild(h("option", { value: o[0], text: o[1], selected: o[0] === cur })); });
    sel.addEventListener("change", function () { onPick(sel.value); peChanged(false); });
    return sel;
  }
  var GAP_OPTS = [["320", "넓게 (기본)"], ["160", "보통"], ["80", "좁게"], ["40", "아주 좁게"]];
  // 줄 배치: 한 칸이면 폭, 두 칸이면 비율 (모바일은 언제나 꽉 찬 1열)
  function layoutField(b) {
    var opts = b.items.length === 2
      ? [["", "반반 (1:1)"], ["2-1", "왼쪽을 크게 (2:1)"], ["1-2", "오른쪽을 크게 (1:2)"]]
      : [["", "꽉 차게 (100%)"], ["90", "90%"], ["80", "80%"], ["70", "70%"], ["60", "60%"], ["50", "50%"]];
    return field(b.items.length === 2 ? "두 칸 비율 (PC)" : "폭 (PC, 가운데 정렬)", optSel(opts, b.layout || "", function (v) { if (v) b.layout = v; else delete b.layout; }));
  }
  function captionField(m) {
    var on = typeof m.caption === "string";
    var cb = h("input", { type: "checkbox", checked: on });
    var box = h("div", { class: "pe-cap" }, h("label", { class: "check" }, cb, h("span", { text: "아래에 캡션 달기" })));
    if (on) {
      var inp = h("input", { type: "text", value: m.caption, placeholder: "예: SLBS Studio X Samsung - Gangnam Store" });
      inp.addEventListener("input", function () { m.caption = inp.value; peChanged(false); });
      box.appendChild(inp);
    }
    cb.addEventListener("change", function () {
      if (cb.checked) m.caption = ""; else delete m.caption;
      peChanged(true);
    });
    return box;
  }

  // ── 이미지·영상 배치 (11.23 "기존 페이지들 배치가 일관되지 않아서 … 레이아웃 유형별 세부 옵션") ─────
  // 사이트 html 은 cms.py pgrid = pages.php cms_p_grid, 모양은 works-detail.css .wdc-grid.
  // 숫자: 열 폭 · 크기는 %, 간격은 1920 화면 기준 px (모바일은 간격 없이 붙는다).
  var GRID_KIND = { single: "한 개", two: "2열", multi: "여러 열" };
  function gMedia(w, x) { var it = { w: w, gap: 0 }; if (x) it.x = x; return it; }
  function gText() { return { type: "text", title: "", ko: "", en: "", w: 80, gap: 0, x: "c" }; }
  function newGrid(kind, withText) {
    if (kind === "single") return { type: "grid", kind: "single", gap: 12, cols: [{ w: 100, items: [gMedia(100, "c")] }] };
    if (kind === "two") return { type: "grid", kind: "two", gap: 12, eq: !withText,
      cols: [{ w: 50, items: [gMedia(100)] }, { w: 50, items: [withText ? gText() : gMedia(100)] }] };
    return { type: "grid", kind: "multi", gap: 12, cols: [0, 1, 2, 3].map(function () { return { w: 25, items: [gMedia(100)] }; }) };
  }
  function numIn(obj, key, lo, hi, def, redraw) {
    var el = h("input", { type: "number", step: "1", min: String(lo), max: String(hi), value: String(obj[key] === undefined ? def : obj[key]) });
    el.addEventListener("change", function () {
      var v = parseInt(el.value, 10);
      if (isNaN(v)) v = def;
      obj[key] = clampI(v, lo, hi);
      el.value = String(obj[key]);
      peChanged(!!redraw);
    });
    return el;
  }
  var ALIGN_OPTS = [["l", "왼쪽"], ["c", "가운데"], ["r", "오른쪽"]];
  function alignSel(obj, key) {
    return optSel(ALIGN_OPTS, obj[key] || "l", function (v) { if (v === "l") delete obj[key]; else obj[key] = v; });
  }
  function colSum(b) { return b.cols.reduce(function (a, c) { return a + c.w; }, 0); }
  // 열 폭을 똑같이 나눈다 (합 100)
  function evenCols(b) {
    var n = b.cols.length;
    b.cols.forEach(function (c, i) { c.w = Math.floor(100 / n) + (i < 100 % n ? 1 : 0); });
  }
  // 항목 하나 (이미지·영상 또는 글)
  function gridItem(b, col, it, k) {
    var single = b.kind === "single";
    var box = h("div", { class: "pg-item" });
    var head = h("div", { class: "pe-block-head" },
      h("b", { text: it.type === "text" ? "글" : "이미지·영상" }),
      h("span", { class: "spacer" }));
    if (!single) {
      head.appendChild(h("button", { class: "ghost", text: "↑", title: "위로", disabled: k === 0, onclick: function () { col.items.splice(k - 1, 0, col.items.splice(k, 1)[0]); peChanged(true); } }));
      head.appendChild(h("button", { class: "ghost", text: "↓", title: "아래로", disabled: k === col.items.length - 1, onclick: function () { col.items.splice(k + 1, 0, col.items.splice(k, 1)[0]); peChanged(true); } }));
      head.appendChild(h("button", { class: "ghost danger", text: "빼기", onclick: function () { col.items.splice(k, 1); peChanged(true); } }));
    }
    box.appendChild(head);
    if (it.type === "text") {
      box.appendChild(field("제목", textIn(it, "title", false, "")));
      box.appendChild(field("한글", textIn(it, "ko", true, "")));
      box.appendChild(field("영문 (선택)", textIn(it, "en", true, "")));
    } else {
      box.appendChild(mediaPick(it.src ? it : null, function (v) {
        delete it.src; delete it.poster; delete it.type;
        if (v) { it.type = v.type; it.src = v.src; if (v.poster) it.poster = v.poster; }
        peChanged(true);
      }, false));
      if (it.src) box.appendChild(captionField(it));
    }
    // 정렬: 왼쪽이면 '왼쪽 띄우기 %' 로 열 안 어디서 시작할지 정한다 (11.23 재검토 — 짝지은 세로 이미지·목업 자리)
    var pos = optSel(ALIGN_OPTS, it.x || "l", function (v) {
      if (v === "l") delete it.x; else { it.x = v; delete it.ml; }
      peChanged(true);
    });
    var opts = h("div", { class: "pe-opts pg-opts" },
      field("크기 (%)", numIn(it, "w", 10, 100, 100, true)),
      field(k === 0 ? "시작 높이 (px)" : "위 간격 (px)", numIn(it, "gap", 0, 2000, 0)),
      field("정렬", pos));
    if (!it.x) opts.appendChild(field("왼쪽 띄우기 (%)", numIn(it, "ml", 0, 90, 0, true)));
    box.appendChild(opts);
    if (!it.x && (it.w || 100) + (it.ml || 0) > 100) box.appendChild(h("small", { class: "hint fx-warn", text: "크기 + 왼쪽 띄우기가 " + ((it.w || 100) + (it.ml || 0)) + "% 예요. 100% 이하로 줄여야 저장돼요." }));
    return box;
  }
  function gridEditor(b, row) {
    var hints = {
      single: "이미지·영상 한 개를 원하는 크기로 왼쪽·가운데·오른쪽에 놓아요. 정렬이 왼쪽이면 ‘왼쪽 띄우기’로 원하는 자리에 놓을 수 있어요.",
      two: "왼쪽·오른쪽 열에 이미지·영상·글을 각각 원하는 만큼 쌓아요. ‘시작 높이’로 한쪽을 내려 높이 차이를 만들고, 열 아래에 이미지를 더 넣을 수 있어요.",
      multi: "주로 세로형 이미지·영상을 2~4열로 놓아요. 칸마다 시작 높이·간격을 정하고, ‘왼쪽 띄우기’로 두 장씩 짝지어 모을 수도 있어요."
    };
    row.appendChild(h("small", { class: "hint", text: hints[b.kind] + " 모바일은 " + (b.kind === "multi" ? "2개씩" : "1열로") + " 붙여서 보여 줘요." }));
    if (b.kind !== "single") {
      var opts = h("div", { class: "pe-opts" });
      if (b.kind === "two") {
        var r = b.cols[0].w + ":" + b.cols[1].w;
        var preset = { "50:50": "1-1", "67:33": "2-1", "33:67": "1-2" }[r] || "custom";
        opts.appendChild(field("열 비율", optSel([["1-1", "반반 (1:1)"], ["2-1", "왼쪽을 크게 (2:1)"], ["1-2", "오른쪽을 크게 (1:2)"], ["custom", "직접 (아래 열 폭)"]], preset, function (v) {
          var m = { "1-1": [50, 50], "2-1": [67, 33], "1-2": [33, 67] }[v];
          if (m) { b.cols[0].w = m[0]; b.cols[1].w = m[1]; }
          peChanged(true);
        })));
      } else {
        opts.appendChild(field("열 개수", optSel([["2", "2열"], ["3", "3열"], ["4", "4열"]], String(b.cols.length), function (v) {
          var n = +v;
          while (b.cols.length < n) b.cols.push({ w: 25, items: [gMedia(100)] });
          if (b.cols.length > n) {
            var lost = b.cols.slice(n).some(function (c) { return c.items.some(function (it) { return it.src || it.type === "text"; }); });
            if (lost && !confirm("뒤쪽 열에 넣은 것이 함께 빠집니다. 줄일까요?")) { peChanged(true); return; }
            b.cols.length = n;
          }
          evenCols(b);
          peChanged(true);
        })));
      }
      opts.appendChild(field("열 사이 간격 (px)", numIn(b, "gap", 0, 400, 12)));
      opts.appendChild(field("남는 폭에서 줄 정렬", alignSel(b, "align")));
      row.appendChild(opts);
      if (b.kind === "two") {
        var onlyMedia = b.cols.every(function (c) { return c.items.length === 1 && c.items[0].type !== "text"; });
        var eq = h("input", { type: "checkbox", checked: b.eq === true, disabled: !onlyMedia });
        eq.addEventListener("change", function () { if (eq.checked) b.eq = true; else delete b.eq; peChanged(true); });
        var drop = h("input", { type: "checkbox", checked: (b.cols[1].items[0] || {}).gap > 0 });
        drop.addEventListener("change", function () {
          var first = b.cols[1].items[0];
          if (!first) { drop.checked = false; return; }
          first.gap = drop.checked ? 240 : 0;
          if (drop.checked) delete b.eq;
          peChanged(true);
        });
        row.appendChild(h("div", { class: "pg-checks" },
          h("label", { class: "check" }, eq, h("span", { text: "좌우 높이 맞춤 — 짧은 쪽을 긴 쪽 높이로 채워요 (열마다 이미지·영상이 하나일 때만)" })),
          h("label", { class: "check" }, drop, h("span", { text: "좌우 높이 차이 — 오른쪽 열을 240px 내려서 시작해요 (오른쪽 첫 칸 ‘시작 높이’로 조절)" }))));
      }
      var sum = colSum(b);
      if (sum > 100) row.appendChild(h("small", { class: "hint fx-warn", text: "열 폭을 더하면 " + sum + "% 예요. 100% 이하로 줄여야 저장·미리보기가 돼요." }));
    }
    var cols = h("div", { class: "pg-cols n" + b.cols.length });
    b.cols.forEach(function (col, ci) {
      var name = b.kind === "single" ? "" : b.kind === "two" ? (ci === 0 ? "왼쪽 열" : "오른쪽 열") : ci + 1 + "열";
      var box = h("div", { class: "pg-col" });
      if (name) box.appendChild(h("div", { class: "pg-col-head" }, h("b", { text: name }), field("열 폭 (%)", numIn(col, "w", 10, 100, 50, true))));
      col.items.forEach(function (it, k) { box.appendChild(gridItem(b, col, it, k)); });
      if (b.kind !== "single" && col.items.length < 8) {
        box.appendChild(h("div", { class: "pg-adds" },
          h("button", { class: "inner-add", text: "＋ 이 열 아래에 이미지·영상", onclick: function () { col.items.push(gMedia(100)); col.items[col.items.length - 1].gap = col.items.length > 1 ? 12 : 0; delete b.eq; peChanged(true); } }),
          h("button", { class: "inner-add", text: "＋ 이 열 아래에 글", onclick: function () { var t = gText(); t.gap = col.items.length ? 40 : 0; col.items.push(t); delete b.eq; peChanged(true); } })));
      }
      cols.appendChild(box);
    });
    row.appendChild(cols);
  }

  // ── 인터랙션 블록 (11.20 "하단 캡처들의 액션을 새 페이지에서도") ─────────
  // 사이트 모양·움직임은 assets/wdc-blocks.css · wdc-blocks.js, html 은 cms.py pfx_block = pages.php cms_p_fx.
  function blankChapter(n) {
    return { num: (n < 10 ? "0" : "") + n, title: "", ko: "", en: "", cards: [] };
  }
  var FX = {
    strip: { short: "가운데로 한 장씩", label: "필름스트립", from: "상세 01",
      hint: "스크롤하면 이미지가 한 장씩 가운데 큰 칸으로 와요. 3~20장. 세로로 긴 이미지(518×740 비율)가 잘 맞아요. 모바일은 손으로 넘기는 가로 목록이에요.",
      make: function () { return { type: "strip", items: [], caption: "" }; } },
    stack: { short: "카드에 겹쳐 얹힘", label: "레이어 얹힘", from: "상세 01",
      hint: "어두운 띠 가운데 카드에 세트마다 이미지 1~3장이 아래에서 올라와 겹쳐요. 400×760 비율, 배경이 투명한 PNG 를 쓰면 겹치는 모양이 보여요. 모바일은 마지막 세트를 다 겹친 모양으로 보여 줘요.",
      make: function () { return { type: "stack", sets: [[]] }; } },
    compare: { short: "선을 끌어 비교", label: "전/후 비교", from: "상세 05",
      hint: "가운데 선을 끌어 전·후를 비교해요. 두 이미지는 같은 크기로 만들어 주세요. 높이는 '후' 이미지 비율을 따라가요.",
      make: function () { return { type: "compare", before: null, after: null }; } },
    wipe: { short: "둘째 장이 덮어 내림", label: "스크롤 전환", from: "상세 07",
      hint: "화면에 멈춘 채 스크롤하면 둘째 이미지가 위에서 아래로 덮어요. 두 이미지는 같은 크기로 만들어 주세요. 모바일은 두 장을 위아래로 보여 줘요.",
      make: function () { return { type: "wipe", a: null, b: null, caption: "" }; } },
    slide: { short: "스크롤로 넘김", label: "스크롤 캐러셀", from: "상세 09",
      hint: "PC 는 화면에 멈춘 채 스크롤할 때마다 한 장씩, 모바일은 3초마다 넘어가요. 2~8장, 높이는 첫 장 비율을 따라가요.",
      make: function () { return { type: "slide", items: [] }; } },
    chapters: { short: "번호 목록 + 사진 배치", label: "스크롤 챕터", from: "상세 02",
      hint: "챕터마다 왼쪽 사진은 끌어서 자리·크기를 정해요. 오른쪽 목록은 화면에 고정된 채 지금 챕터가 커지고 설명이 펼쳐져요. 모바일은 챕터마다 글 + 사진 넘기기예요.",
      make: function () { return { type: "chapters", list: [blankChapter(1), blankChapter(2)] }; } }
  };
  function clampI(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }
  // 높이를 따라갈 이미지의 비율 [가로, 세로] 를 블록에 적어 둔다
  function setRatio(b, m) {
    if (!m || !m.src) { delete b.ratio; return; }
    mediaSize(m.src, false).then(function (r) {
      if (r && r[0] > 0 && r[1] > 0 && r[0] <= 20000 && r[1] <= 20000) { b.ratio = [r[0], r[1]]; peChanged(false); }
    });
  }
  // 이미지 여러 장 한 번에 올리기. onEach(주소) 를 올린 순서대로 부른다
  function multiUpload(label, room, onEach) {
    var input = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, hidden: true });
    var prog = h("div", { class: "progress" }, h("i"));
    var btn = h("button", { class: "inner-add", text: label, onclick: function () { input.click(); } });
    input.addEventListener("change", function () {
      var all = Array.prototype.slice.call(input.files);
      input.value = "";
      if (!all.length) return;
      var files = all.slice(0, room);
      if (all.length > room) toast("여기에는 " + room + "장만 더 넣을 수 있어서 앞의 " + room + "장만 올립니다.", "err");
      btn.disabled = true;
      prog.classList.add("on");
      S.uploading++;
      renderBar();
      var i = 0;
      var next = function () {
        if (i >= files.length) return Promise.resolve();
        var f = files[i++];
        return upload(f, "image", 1920, function (r) { prog.firstChild.style.width = Math.round(((i - 1 + r) / files.length) * 100) + "%"; })
          .then(function (r) { onEach(r.url); }).then(next);
      };
      next().catch(function (e) { toast(e.message, "err"); }).then(function () {
        S.uploading--;
        renderBar();
        peChanged(true);
      });
    });
    return h("div", { class: "file" }, btn, input, prog);
  }
  // 이미지 목록: 썸네일 + 앞/뒤로 + 빼기, 끝에 올리기. onFirst() 는 첫 장이 바뀌었을 때
  function imgGrid(arr, max, onFirst) {
    var box = h("div", { class: "fx-grid" });
    var moved = function (k) { if (k === 0 && onFirst) onFirst(); peChanged(true); };
    arr.forEach(function (m, k) {
      box.appendChild(h("div", { class: "fx-cell" },
        h("img", { src: m.src, alt: "", class: "fx-thumb" }),
        h("span", { class: "fx-no", text: String(k + 1) }),
        h("div", { class: "fx-cell-btns" },
          h("button", { class: "ghost", text: "←", title: "앞으로", disabled: k === 0, onclick: function () { arr.splice(k - 1, 0, arr.splice(k, 1)[0]); moved(k - 1); } }),
          h("button", { class: "ghost", text: "→", title: "뒤로", disabled: k === arr.length - 1, onclick: function () { arr.splice(k + 1, 0, arr.splice(k, 1)[0]); moved(k); } }),
          h("button", { class: "ghost danger", text: "×", title: "빼기", onclick: function () { arr.splice(k, 1); moved(k); } }))));
    });
    if (arr.length < max) {
      box.appendChild(multiUpload(arr.length ? "＋ 더 올리기" : "＋ 이미지 올리기 (여러 장 한 번에 가능)", max - arr.length, function (url) {
        arr.push({ type: "img", src: url });
        if (arr.length === 1 && onFirst) onFirst();
      }));
    }
    return box;
  }
  function fxCount(n, min, max, unit) {
    return h("small", { class: "hint" + (n < min ? " fx-warn" : ""), text: n + unit + " / " + min + "~" + max + unit + (n < min ? " — " + (min - n) + unit + " 더 넣어야 보여요" : "") });
  }
  // 스크롤 챕터의 사진 판 (사이트의 1920×960 판과 같은 비율). 끌면 옮기고 오른쪽 아래 모서리를 끌면 크기
  function chCanvas(c) {
    var cv = h("div", { class: "fx-canvas" }, h("div", { class: "fx-canvas-text", text: "글 자리" }));
    c.cards.forEach(function (k, n) {
      var el = h("div", { class: "fx-card" },
        h("img", { src: k.src, alt: "", draggable: "false" }),
        h("b", { class: "fx-card-no", text: String(n + 1) }),
        h("i", { class: "fx-card-size", title: "끌어서 크기 바꾸기" }));
      var place = function () {
        el.style.left = k.x / 100 + "%";
        el.style.top = k.y / 100 + "%";
        el.style.width = k.w / 100 + "%";
      };
      place();
      el.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var r = cv.getBoundingClientRect();
        var resize = e.target.classList.contains("fx-card-size");
        var sx = e.clientX, sy = e.clientY, ox = k.x, oy = k.y, ow = k.w;
        el.setPointerCapture(e.pointerId);
        el.classList.add("on");
        var mv = function (ev) {
          var dx = ((ev.clientX - sx) / r.width) * 10000;
          var dy = ((ev.clientY - sy) / r.height) * 10000;
          if (resize) k.w = clampI(ow + dx, 300, 10000);
          else { k.x = clampI(ox + dx, 0, 10000); k.y = clampI(oy + dy, 0, 10000); }
          place();
        };
        var up = function () {
          el.removeEventListener("pointermove", mv);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
          el.classList.remove("on");
          if (k.x !== ox || k.y !== oy || k.w !== ow) peChanged(true);
        };
        el.addEventListener("pointermove", mv);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
      });
      cv.appendChild(el);
    });
    return cv;
  }
  function pctIn(k, key, lo, hi) {
    var el = h("input", { type: "number", step: "0.5", min: String(lo / 100), max: String(hi / 100), value: String(k[key] / 100) });
    el.addEventListener("change", function () {
      var v = parseFloat(el.value);
      if (isNaN(v)) { el.value = String(k[key] / 100); return; }
      k[key] = clampI(v * 100, lo, hi);
      peChanged(true);
    });
    return el;
  }
  function chapterEditor(b) {
    var wrap = h("div", { class: "fx-ch" });
    b.list.forEach(function (c, i) {
      var cards = h("div", { class: "fx-ch-cards" });
      c.cards.forEach(function (k, n) {
        cards.appendChild(h("div", { class: "fx-ch-card" },
          h("img", { src: k.src, alt: "", class: "fx-thumb" }),
          h("span", { class: "fx-no", text: String(n + 1) }),
          field("가로 %", pctIn(k, "x", 0, 10000)),
          field("세로 %", pctIn(k, "y", 0, 10000)),
          field("폭 %", pctIn(k, "w", 300, 10000)),
          h("div", { class: "fx-cell-btns" },
            h("button", { class: "ghost", text: "↑", title: "앞으로 (먼저 그려짐)", disabled: n === 0, onclick: function () { c.cards.splice(n - 1, 0, c.cards.splice(n, 1)[0]); peChanged(true); } }),
            h("button", { class: "ghost danger", text: "×", title: "빼기", onclick: function () { c.cards.splice(n, 1); peChanged(true); } }))));
      });
      if (c.cards.length < 6) {
        cards.appendChild(multiUpload(c.cards.length ? "＋ 사진 더 올리기" : "＋ 사진 올리기 (여러 장 가능)", 6 - c.cards.length, function (url) {
          var n = c.cards.length;
          // 처음 자리: 왼쪽 절반 안에서 지그재그로 (판에서 끌어 옮기면 된다)
          c.cards.push({ type: "img", src: url, x: (n % 2) * 1800, y: Math.min(n * 2600, 7400), w: 3000 });
        }));
      }
      wrap.appendChild(h("div", { class: "fx-ch-item" },
        h("div", { class: "pe-block-head" }, h("b", { text: "챕터 " + (i + 1) }),
          h("span", { class: "spacer" }),
          h("button", { class: "ghost", text: "↑", disabled: i === 0, onclick: function () { b.list.splice(i - 1, 0, b.list.splice(i, 1)[0]); peChanged(true); } }),
          h("button", { class: "ghost", text: "↓", disabled: i === b.list.length - 1, onclick: function () { b.list.splice(i + 1, 0, b.list.splice(i, 1)[0]); peChanged(true); } }),
          b.list.length > 1 ? h("button", { class: "ghost danger", text: "빼기", onclick: function () { b.list.splice(i, 1); peChanged(true); } }) : null),
        h("div", { class: "pe-opts fx-ch-names" }, field("번호", textIn(c, "num", false, "01")), field("제목", textIn(c, "title", false, "예: Landscape"))),
        field("설명 (한글)", textIn(c, "ko", true, "PC 에서 줄을 나눌 곳에 Enter")),
        field("설명 (영문, 선택)", textIn(c, "en", true, "")),
        h("small", { class: "hint", text: "사진을 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꿔요. 점선 자리에는 오른쪽 글 목록이 와요. 숫자로 고쳐도 돼요." }),
        chCanvas(c),
        cards));
    });
    if (b.list.length < 6) wrap.appendChild(h("button", { class: "inner-add", text: "＋ 이 블록에 챕터 추가", onclick: function () { b.list.push(blankChapter(b.list.length + 1)); peChanged(true); } }));
    return wrap;
  }
  function fxEditor(b, row) {
    var d = FX[b.type];
    row.appendChild(h("small", { class: "hint", text: d.hint }));
    if (b.type === "strip") {
      row.appendChild(fxCount(b.items.length, 3, 20, "장"));
      row.appendChild(imgGrid(b.items, 20));
      row.appendChild(field("캡션 (선택)", textIn(b, "caption", false, "예: [Prompt] Childhood Sketchbook 안정성 테스트")));
    } else if (b.type === "slide") {
      row.appendChild(fxCount(b.items.length, 2, 8, "장"));
      row.appendChild(imgGrid(b.items, 8, function () { setRatio(b, b.items[0]); }));
    } else if (b.type === "stack") {
      b.sets.forEach(function (s, j) {
        row.appendChild(h("div", { class: "fx-set" },
          h("div", { class: "pe-block-head" }, h("b", { text: "세트 " + (j + 1) + " (아래 장부터 차례로 얹혀요)" }),
            h("span", { class: "spacer" }),
            b.sets.length > 1 ? h("button", { class: "ghost danger", text: "세트 빼기", onclick: function () { b.sets.splice(j, 1); peChanged(true); } }) : null),
          imgGrid(s, 3)));
      });
      if (b.sets.length < 5) row.appendChild(h("button", { class: "inner-add", text: "＋ 이 블록에 세트 추가", onclick: function () { b.sets.push([]); peChanged(true); } }));
    } else if (b.type === "compare" || b.type === "wipe") {
      var keys = b.type === "compare" ? [["before", "전 (왼쪽)"], ["after", "후 (오른쪽)"]] : [["a", "첫 이미지"], ["b", "덮어 내리는 이미지"]];
      var main = b.type === "compare" ? "after" : "a";
      var cells = h("div", { class: "pe-cells two" });
      keys.forEach(function (kv) {
        cells.appendChild(h("div", { class: "pe-cell" }, h("small", { class: "hint", text: kv[1] }),
          mediaPick(b[kv[0]], function (m) {
            b[kv[0]] = m;
            if (kv[0] === main) setRatio(b, m);
            peChanged(true);
          }, false, true)));
      });
      row.appendChild(cells);
      if (b.type === "wipe") row.appendChild(field("캡션 (선택)", textIn(b, "caption", false, "예: Light/Dark Theme")));
    } else if (b.type === "chapters") {
      row.appendChild(chapterEditor(b));
    }
  }
  // 미리보기·저장 전에 덜 채운 인터랙션 블록 걸러내기 (미리보기 전용 — 저장은 서버가 이유를 알려 준다)
  function fxReady(b) {
    if (b.type === "strip") return b.items.length >= 3;
    if (b.type === "slide") return b.items.length >= 2;
    if (b.type === "stack") { b.sets = b.sets.filter(function (s) { return s.length; }); return b.sets.length > 0; }
    if (b.type === "compare") return !!(b.before && b.after);
    if (b.type === "wipe") return !!(b.a && b.b);
    if (b.type === "chapters") {
      b.list = b.list.filter(function (c) { return c.cards.length; }).map(function (c) {
        if (!String(c.title || "").trim()) c.title = "(제목)";
        return c;
      });
      return b.list.length > 0;
    }
    return true;
  }

  function pagesPanel() {
    panel.innerHTML = "";
    var body = h("div", { class: "panel-body" });
    panel.appendChild(h("div", { class: "tabs" }, h("button", { class: "on", text: S.pe ? (S.pe.id ? "페이지 고치기" : "새 페이지") : "직접 만든 페이지" })));
    panel.appendChild(body);
    if (!S.pe) {
      body.appendChild(h("p", { class: "hint", text: "이미지·영상을 차례로 나열하는 상세 페이지를 직접 만들 수 있어요. 공개로 저장하면 Works 목록 맨 앞에 카드가 생깁니다." }));
      body.appendChild(h("button", { class: "primary", text: "＋ 새 페이지 만들기", onclick: function () {
        S.pe = { id: "", page: blankPage() };
        S.peDirty = false;
        fillPageSel();
        renderPanel();
        pagePreview(true);
      } }));
      var list = (S.pages && S.pages.pages) || [];
      if (!list.length) body.appendChild(h("p", { class: "empty", text: "아직 만든 페이지가 없습니다." }));
      list.forEach(function (pg) {
        body.appendChild(h("div", { class: "card pe-row" },
          h("div", { class: "card-head" }, h("b", { text: String(pg.title || "").split("\n").join(" ") }),
            h("span", { class: "tag" + (pg.status === "public" ? "" : " tag-draft"), text: pg.status === "public" ? "공개" : "임시 저장" })),
          h("small", { class: "hint", text: "/works/" + pg.slug + "/" }),
          h("div", { class: "actions" },
            h("button", { text: "고치기", onclick: function () {
              S.pe = { id: pg.id, page: clone(pg) };
              S.peDirty = false;
              fillPageSel();
              renderPanel();
              pagePreview(true);
            } }),
            pg.status === "public" ? h("button", { class: "ghost", text: "사이트에서 보기", onclick: function () { window.open("/works/" + pg.slug + "/", "_blank"); } }) : null,
            h("button", { class: "ghost danger", text: "지우기", onclick: function () {
              if (!confirm("‘" + String(pg.title || "").split("\n").join(" ") + "’ 페이지를 지울까요? 사이트와 Works 목록에서 바로 사라집니다.")) return;
              api("page_delete", { id: pg.id }).then(function (r) { S.pages = r.pages; toast("지웠습니다."); fillPageSel(); renderPanel(); })
                .catch(function (e) { toast(e.message, "err"); });
            } })
          )));
      });
      return;
    }
    var p = S.pe.page;
    body.appendChild(h("div", { class: "pe-top" },
      h("button", { class: "ghost", text: "← 만든 페이지 목록", onclick: peToList }),
      S.pe.id && p.status === "public" ? h("button", { class: "ghost", text: "사이트에서 보기", onclick: function () { window.open("/works/" + p.slug + "/", "_blank"); } }) : null));
    // 기본 정보
    var slug = h("input", { type: "text", value: p.slug, placeholder: "예: samsung-new-film" });
    slug.addEventListener("input", function () {
      slug.value = slug.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-");
      p.slug = slug.value.replace(/^-+|-+$/g, "");
      S.peDirty = true;
    });
    var status = h("select", {});
    [["draft", "임시 저장 (사이트에 안 보임)"], ["public", "공개 (사이트와 Works 목록에 보임)"]].forEach(function (o) {
      status.appendChild(h("option", { value: o[0], text: o[1], selected: p.status === o[0] }));
    });
    status.addEventListener("change", function () { p.status = status.value; S.peDirty = true; });
    var tags = h("input", { type: "text", value: (p.tags || []).join(", "), placeholder: "예: Campaign, Film, Photography" });
    tags.addEventListener("input", function () { p.tags = tags.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean); peChanged(false); });
    body.appendChild(h("section", { class: "card" },
      h("b", { text: "기본 정보" }),
      field("페이지 주소  pl2std.com/works/…/", slug, "영문 소문자·숫자·하이픈(-)만"),
      field("공개 여부", status),
      field("배경색", optSel([["dark", "검정 (기본)"], ["light", "흰색"]], p.theme === "light" ? "light" : "dark", function (v) { if (v === "light") p.theme = "light"; else delete p.theme; })),
      field("브랜드", textIn(p, "brand", false, "예: Samsung")),
      field("제목 (Enter 로 줄을 나눕니다)", textIn(p, "title", true, "프로젝트 제목")),
      field("태그 (쉼표로 구분)", tags),
      field("검색·공유 설명 (비우면 개요 앞부분)", textIn(p, "desc", false, ""))
    ));
    body.appendChild(h("section", { class: "card" },
      h("b", { text: "첫 화면 (히어로)" }),
      mediaPick(p.hero, function (m) { p.hero = m; peChanged(true); }, false)
    ));
    var intro = p.intro || (p.intro = { title: "", ko: "", en: "" });
    body.appendChild(h("section", { class: "card" },
      h("b", { text: "개요" }),
      field("개요 제목", textIn(intro, "title", false, "예: One Team, Multiple Scenes")),
      field("한글", textIn(intro, "ko", true, "PC 에서 줄을 나눌 곳에 Enter (모바일은 자동 줄바꿈)")),
      field("영문 (비우면 영문 화면에서도 한글)", textIn(intro, "en", true, ""))
    ));
    // 내용 칸
    var blocksBox = h("section", { class: "card" }, h("b", { text: "내용 (위에서부터 차례로)" }));
    (p.blocks || []).forEach(function (b, i) {
      var fx = !!FX[b.type];
      var label = { media: "이미지·영상 줄 (예전 방식)", text: "글", film: "풀필름 (비메오)" }[b.type] ||
        (b.type === "grid" ? "이미지·영상 배치 · " + GRID_KIND[b.kind] : fx ? FX[b.type].label : b.type);
      var row = h("div", { class: "pe-block " + (fx ? "pe-kind-fx" : "pe-kind-basic") },
        h("div", { class: "pe-block-head pe-block-bar" },
          h("span", { class: "pe-num", text: String(i + 1) }),
          h("span", { class: "pe-kind", text: fx ? "인터랙션" : "기본" }),
          h("b", { text: label }),
          h("span", { class: "spacer" }),
          h("button", { class: "ghost", text: "↑", disabled: i === 0, onclick: function () { p.blocks.splice(i - 1, 0, p.blocks.splice(i, 1)[0]); peChanged(true); } }),
          h("button", { class: "ghost", text: "↓", disabled: i === p.blocks.length - 1, onclick: function () { p.blocks.splice(i + 1, 0, p.blocks.splice(i, 1)[0]); peChanged(true); } }),
          h("button", { class: "ghost danger", text: "빼기", onclick: function () { p.blocks.splice(i, 1); peChanged(true); } })));
      if (b.type === "media") {
        var cells = h("div", { class: "pe-cells" + (b.items.length === 2 ? " two" : "") });
        b.items.forEach(function (m, k) {
          var cell = h("div", { class: "pe-cell" }, mediaPick(m, function (v) {
            if (v && m && m.caption) v.caption = m.caption; // 파일을 바꿔도 캡션은 둔다
            b.items[k] = v;
            peChanged(true);
          }, false));
          if (m && m.src) cell.appendChild(captionField(m));
          if (b.items.length === 2) cell.appendChild(h("button", { class: "ghost", text: "이 칸 빼기", onclick: function () { b.items.splice(k, 1); delete b.layout; peChanged(true); } }));
          cells.appendChild(cell);
        });
        row.appendChild(cells);
        row.appendChild(layoutField(b));
        if (b.items.length === 1) row.appendChild(h("button", { class: "inner-add", text: "＋ 이 줄에 한 칸 더 (한 줄에 2개)", onclick: function () { b.items.push(null); delete b.layout; peChanged(true); } }));
      } else if (b.type === "grid") {
        gridEditor(b, row);
      } else if (b.type === "text") {
        row.appendChild(field("제목", textIn(b, "title", false, "")));
        row.appendChild(field("한글", textIn(b, "ko", true, "")));
        row.appendChild(field("영문 (선택)", textIn(b, "en", true, "")));
        row.appendChild(h("div", { class: "pe-opts" },
          field("정렬 (PC)", optSel([["c", "가운데"], ["l", "왼쪽"], ["r", "오른쪽"]], b.align || "c", function (v) { if (v === "c") delete b.align; else b.align = v; })),
          field("위 간격", optSel(GAP_OPTS, String(b.above || 320), function (v) { if (v === "320") delete b.above; else b.above = +v; })),
          field("아래 간격", optSel(GAP_OPTS, String(b.below || 320), function (v) { if (v === "320") delete b.below; else b.below = +v; }))));
      } else if (fx) {
        fxEditor(b, row);
      } else {
        var vim = h("input", { type: "text", value: b.vimeo || "", placeholder: "https://vimeo.com/123456789" });
        vim.addEventListener("input", function () {
          var mm = /vimeo\.com\/(?:video\/)?(\d{5,12})/.exec(vim.value) || /^\s*(\d{5,12})\s*$/.exec(vim.value);
          vim.classList.toggle("bad", !mm);
          b.vimeo = mm ? mm[1] : "";
          peChanged(false);
        });
        row.appendChild(field("제목", textIn(b, "title", false, "Watch the Full Film")));
        row.appendChild(field("비메오 주소", vim));
        row.appendChild(h("small", { class: "hint", text: "재생 전 이미지" }));
        row.appendChild(mediaPick(b.poster ? { type: "img", src: b.poster } : null, function (m) {
          b.poster = m ? (m.type === "video" ? m.poster : m.src) : "";
          peChanged(true);
        }, false));
      }
      blocksBox.appendChild(row);
    });
    if (!(p.blocks || []).length) blocksBox.appendChild(h("p", { class: "empty", text: "아직 내용 칸이 없습니다. 아래에서 추가하세요." }));
    // 내용 칸 추가 — 블록 안의 버튼과 헷갈리지 않게 따로 묶은 영역 (11.21)
    var addBlock = function (nb) {
      p.blocks.push(nb);
      peChanged(true);
      var rows = panel.querySelectorAll(".pe-block");
      if (rows.length) rows[rows.length - 1].scrollIntoView({ block: "start", behavior: "smooth" });
    };
    var tile = function (cls, name, desc, fn) {
      return h("button", { class: "pe-tile " + cls, onclick: fn }, h("b", { text: "＋ " + name }), h("small", { text: desc }));
    };
    var basic = h("div", { class: "pe-tiles" },
      tile("is-basic", "이미지·영상 한 개", "크기 · 왼쪽/가운데/오른쪽", function () { addBlock(newGrid("single")); }),
      tile("is-basic", "2열 · 이미지+이미지", "높이 맞춤 · 높이 차이 · 열마다 개수", function () { addBlock(newGrid("two")); }),
      tile("is-basic", "2열 · 이미지+글", "한쪽은 이미지, 한쪽은 글", function () { addBlock(newGrid("two", true)); }),
      tile("is-basic", "여러 열 (2~4)", "주로 세로형 · 열마다 시작 높이", function () { addBlock(newGrid("multi")); }),
      tile("is-basic", "글", "제목 + 설명", function () { addBlock({ type: "text", title: "", ko: "", en: "" }); }),
      tile("is-basic", "풀필름", "비메오 영상", function () { addBlock({ type: "film", title: "", vimeo: "", poster: "" }); }));
    var fxTiles = h("div", { class: "pe-tiles" });
    Object.keys(FX).forEach(function (k) {
      fxTiles.appendChild(tile("is-fx", FX[k].label, FX[k].short + " · " + FX[k].from, function () { addBlock(FX[k].make()); }));
    });
    var adder = h("section", { class: "pe-adder" },
      h("div", { class: "pe-adder-title" }, h("b", { text: "내용 칸 추가" }), h("small", { text: "누르면 위 목록 맨 아래에 새 칸이 생겨요" })),
      h("div", { class: "pe-adder-group" }, h("span", { class: "pe-kind", text: "기본" }), basic),
      h("div", { class: "pe-adder-group" }, h("span", { class: "pe-kind is-fx", text: "인터랙션" }), fxTiles));
    body.appendChild(blocksBox);
    body.appendChild(adder);
    // Works 카드
    var card = p.card || (p.card = { size: "m" });
    var size = h("select", {});
    [["s", "작게 (가로로 긴 카드)"], ["m", "보통"], ["l", "크게 (정사각형)"]].forEach(function (o) {
      size.appendChild(h("option", { value: o[0], text: o[1], selected: (card.size || "m") === o[0] }));
    });
    size.addEventListener("change", function () { card.size = size.value; S.peDirty = true; });
    body.appendChild(h("section", { class: "card" },
      h("b", { text: "Works 목록 카드" }),
      field("카드 크기", size),
      h("small", { class: "hint", text: "카드 이미지·영상 (비우면 첫 화면과 같은 것)" }),
      mediaPick(card.media, function (m) { if (m) card.media = m; else delete card.media; peChanged(true); }, true)
    ));
    // 저장
    body.appendChild(h("div", { class: "actions pe-save" },
      h("button", { class: "primary", text: "이 페이지 저장", onclick: function () {
        var btn = this;
        btn.disabled = true;
        api("page_save", { id: S.pe.id || "", page: p }).then(function (r) {
          S.pages = r.pages;
          S.pe = { id: r.page.id, page: clone(r.page) };
          S.peDirty = false;
          fillPageSel();
          toast(r.page.status === "public" ? "저장했습니다. 사이트와 Works 목록에 반영됐어요." : "임시 저장했습니다 (사이트에는 아직 안 보여요).");
          renderPanel();
          pagePreview(false);
        }).catch(function (e) { toast(e.message, "err"); btn.disabled = false; });
      } }),
      h("button", { class: "ghost", text: "목록으로", onclick: peToList })
    ));
  }

  window.addEventListener("beforeunload", function (e) {
    if ((S.mode === "pages" && S.pe && S.peDirty) || (S.wo && S.wo.dirty)) {
      e.preventDefault();
      e.returnValue = "";
    }
    if (S.index && pendingCount()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  if (csrf) start();
  else showLogin();
})();
