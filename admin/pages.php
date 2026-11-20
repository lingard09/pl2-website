<?php
/* PL2 CMS — 새 페이지 (2026-11-19)
 * 고객사가 관리자에서 만드는 상세 페이지. 원본은 /cms-data/pages.json (빌드가 받아 간다).
 * 저장하면 /works/<slug>/index.html 과 Works 목록 카드를 바로 만든다.
 * 렌더링은 tools/cms.py (page_main · page_html · card_html · works_with_cards) 와 바이트까지 같아야 한다.
 */
if (!defined('CMS_ROOT')) {
    exit;
}

define('CMS_PAGES', CMS_DATA . '/pages.json');
define('CMS_SKELETON', __DIR__ . '/page-skeleton.html');

// ── 렌더링 ───────────────────────────────────────────

function cms_p_text($t)
{
    return htmlspecialchars(cms_norm($t), ENT_NOQUOTES, 'UTF-8');
}

function cms_p_lines($t)
{
    $out = array();
    foreach (explode("\n", str_replace("\r", '', (string)$t)) as $x) {
        $out[] = cms_p_text($x);
    }
    return implode(' <br />', $out);
}

function cms_p_koen($ko, $en)
{
    if (cms_norm((string)$en) !== '') {
        return '<span data-l="ko">' . cms_p_lines($ko) . '</span><span data-l="en" lang="en">' . cms_p_lines($en) . '</span>';
    }
    return cms_p_lines($ko);
}

function cms_p_media($m, $cls, $extra)
{
    $m = is_array($m) ? $m : array();
    $c = $cls !== '' ? ' class="' . $cls . '"' : '';
    if (cms_get($m, 'type') === 'video') {
        return '<video' . $c . $extra . ' poster="' . cms_esc_attr(cms_get($m, 'poster', '')) . '" autoplay muted loop playsinline preload="metadata">'
            . '<source src="' . cms_esc_attr(cms_get($m, 'src', '')) . '" type="video/mp4" /></video>';
    }
    return '<img' . $c . $extra . ' src="' . cms_esc_attr(cms_get($m, 'src', '')) . '" alt="" />';
}

// 글 칸 위·아래 간격 (기본은 섹션 간격 320) · 한 칸 줄의 폭 · 두 칸 줄의 비율 (cms.py GAPS · WIDTHS · SPLITS)
function cms_p_gaps()
{
    return array(40, 80, 160);
}

function cms_p_widths()
{
    return array('90', '80', '70', '60', '50');
}

function cms_p_splits()
{
    return array('2-1', '1-2');
}

// 줄의 한 칸 — 캡션이 있으면 figure 로 감싼다 (cms.py pcell)
function cms_p_cell($m)
{
    $el = cms_p_media($m, '', ' data-reveal');
    $cap = is_string(cms_get($m, 'caption')) ? cms_norm($m['caption']) : '';
    if ($cap !== '') {
        return '<figure class="wdc-fig">' . $el . '<figcaption class="wdc-cap">' . cms_p_text($cap) . '</figcaption></figure>';
    }
    return $el;
}

function cms_page_main($p)
{
    $out = array('<div class="wd-container">', '<section class="wd-top">', '<div class="wd-hero wd-hero--fade-black">');
    $out[] = cms_p_media(cms_get($p, 'hero', array()), 'wd-hero-media', '');
    $out[] = '<div class="wd-hero-dim" aria-hidden="true"></div>';
    $head = '<div class="wd-hero-title"><div class="wd-hero-head">';
    if (cms_norm((string)cms_get($p, 'brand', '')) !== '') {
        $head .= '<span class="wd-hero-brand">' . cms_p_text($p['brand']) . '</span>';
    }
    $head .= '<h1 class="wd-hero-h1">' . cms_p_lines(cms_get($p, 'title', '')) . '</h1></div>';
    $tags = array();
    foreach ((array)cms_get($p, 'tags', array()) as $t) {
        if (cms_norm((string)$t) !== '') {
            $tags[] = '<span class="wd-tag">' . cms_p_text($t) . '</span>';
        }
    }
    if ($tags) {
        $head .= '<div class="wd-hero-tags">' . implode('', $tags) . '</div>';
    }
    $out[] = $head . '</div>';
    $out[] = '</div>';
    $intro = (array)cms_get($p, 'intro', array());
    $it = (string)cms_get($intro, 'title', '');
    $ik = (string)cms_get($intro, 'ko', '');
    if (cms_norm($it) !== '' || cms_norm($ik) !== '') {
        $x = '<div class="wd-intro">';
        if (cms_norm($it) !== '') {
            $x .= '<p class="wd-intro-title">' . cms_p_text($it) . '</p>';
        }
        if (cms_norm($ik) !== '') {
            $x .= '<p class="wd-intro-desc">' . cms_p_koen($ik, cms_get($intro, 'en', '')) . '</p>';
        }
        $out[] = $x . '</div>';
    }
    $out[] = '</section>';
    $inlist = false;
    foreach ((array)cms_get($p, 'blocks', array()) as $b) {
        $t = cms_get($b, 'type');
        if ($t === 'media') {
            $items = array();
            foreach ((array)cms_get($b, 'items', array()) as $m) {
                if (is_array($m) && cms_get($m, 'src')) {
                    $items[] = $m;
                }
            }
            $items = array_slice($items, 0, 2);
            if (!$items) {
                continue;
            }
            if (!$inlist) {
                $out[] = '<section class="wdc-list">';
                $inlist = true;
            }
            $cls = 'wdc-row wdc-row--' . count($items);
            $lay = cms_get($b, 'layout');
            if ((count($items) === 1 && in_array($lay, cms_p_widths(), true)) || (count($items) === 2 && in_array($lay, cms_p_splits(), true))) {
                $cls .= ' wdc-row--' . $lay;
            }
            $row = '<div class="' . $cls . '">';
            foreach ($items as $m) {
                $row .= cms_p_cell($m);
            }
            $out[] = $row . '</div>';
            continue;
        }
        if ($inlist) {
            $out[] = '</section>';
            $inlist = false;
        }
        if ($t === 'text') {
            $cls = 'wdc-text';
            foreach (array('above' => 't', 'below' => 'b') as $k => $pre) {
                if (in_array(cms_get($b, $k), cms_p_gaps(), true)) {
                    $cls .= ' wdc-text--' . $pre . $b[$k];
                }
            }
            $al = cms_get($b, 'align');
            $al = $al === 'l' ? 'left' : ($al === 'r' ? 'right' : 'center');
            $x = '<section class="' . $cls . '"><div class="wd-head wd-head--' . $al . '">';
            if (cms_norm((string)cms_get($b, 'title', '')) !== '') {
                $x .= '<h2 class="wd-head-title">' . cms_p_text($b['title']) . '</h2>';
            }
            if (cms_norm((string)cms_get($b, 'ko', '')) !== '') {
                $x .= '<p class="wd-head-desc">' . cms_p_koen($b['ko'], cms_get($b, 'en', '')) . '</p>';
            }
            $out[] = $x . '</div></section>';
        } elseif ($t === 'film' && preg_match('/^[0-9]{5,12}$/', (string)cms_get($b, 'vimeo', ''))) {
            $ft = (string)cms_get($b, 'title', '');
            $out[] = '<section class="wd-film">'
                . '<h2 class="wd-head-title wd-film-title">' . cms_p_text($ft !== '' ? $ft : 'Watch the Full Film') . '</h2>'
                . '<div class="wd-film-frame" data-playing="false" data-vimeo="' . $b['vimeo'] . '">'
                . '<img src="' . cms_esc_attr(cms_get($b, 'poster', '')) . '" alt="" />'
                . '<button type="button" class="wd-film-play" aria-label="영상 재생"></button></div></section>';
        }
    }
    if ($inlist) {
        $out[] = '</section>';
    }
    $out[] = '</div>';
    return implode("\n", $out);
}

function cms_page_title_plain($p)
{
    $out = array();
    foreach (explode("\n", str_replace("\r", '', (string)cms_get($p, 'title', ''))) as $x) {
        if (cms_norm($x) !== '') {
            $out[] = cms_norm($x);
        }
    }
    return implode(' ', $out);
}

function cms_page_html($p, $skeleton)
{
    $title = cms_page_title_plain($p);
    $desc = cms_norm((string)cms_get($p, 'desc', ''));
    if ($desc === '') {
        $intro = (array)cms_get($p, 'intro', array());
        $d = cms_norm(str_replace("\n", ' ', (string)cms_get($intro, 'ko', '')));
        preg_match('/^.{0,120}/us', $d, $m);
        $desc = isset($m[0]) ? $m[0] : '';
    }
    if ($desc === '') {
        $desc = $title;
    }
    $hero = (array)cms_get($p, 'hero', array());
    $og = cms_get($hero, 'type') === 'video' ? cms_get($hero, 'poster') : cms_get($hero, 'src');
    $rep = array(
        '{{TITLE}}' => cms_esc_attr($title),
        '{{DESC}}' => cms_esc_attr($desc),
        '{{OG}}' => cms_esc_attr('https://pl2std.com' . ($og ? $og : '/assets/og/og-default.jpg')),
        '{{SLUG}}' => $p['slug'],
        '{{MAIN}}' => cms_page_main($p),
    );
    return preg_replace_callback('/\{\{(TITLE|DESC|OG|SLUG|MAIN)\}\}/', function ($m) use ($rep) {
        return $rep[$m[0]];
    }, $skeleton);
}

function cms_card_html($p)
{
    $c = (array)cms_get($p, 'card', array());
    $m = cms_get($c, 'media');
    if (!$m) {
        $m = cms_get($p, 'hero', array());
    }
    $size = in_array(cms_get($c, 'size'), array('s', 'm', 'l'), true) ? $c['size'] : 'm';
    $brand = cms_norm((string)cms_get($p, 'brand', '')) !== '' ? '<p class="wk-card-brand">' . cms_p_text($p['brand']) . '</p>' : '';
    return '<a class="wk-card wk-card--' . $size . '" data-cms-page="' . $p['id'] . '" href="' . $p['slug'] . '/">'
        . cms_p_media($m, 'wk-card-media', '')
        . '<div class="wk-card-overlay">' . $brand . '<p class="wk-card-project">' . cms_p_text(cms_page_title_plain($p)) . '</p></div></a>';
}

// Works 목록에 나갈 페이지 — 공개된 것, 최신 먼저 (cms.py public_pages: 같은 시각이면 원래 순서)
function cms_public_pages($pages)
{
    $lst = array();
    foreach ((array)$pages as $i => $p) {
        if (cms_get($p, 'status') === 'public') {
            $lst[] = array((string)cms_get($p, 'created', ''), $i, $p);
        }
    }
    usort($lst, function ($a, $b) {
        $c = strcmp($b[0], $a[0]);
        return $c !== 0 ? $c : $a[1] - $b[1];
    });
    $out = array();
    foreach ($lst as $x) {
        $out[] = $x[2];
    }
    return $out;
}

// Works 목록 html → array(앞, array(왼쪽 카드들, 오른쪽 카드들), array(각 열 뒤)) — 모양이 다르면 null (cms.py split_cols)
function cms_split_cols($doc)
{
    $parts = explode('<div class="wk-col">', $doc);
    if (count($parts) !== 3) {
        return null;
    }
    $cols = array();
    $rests = array();
    for ($i = 1; $i <= 2; $i++) {
        $part = $parts[$i];
        $pos = 0;
        $cards = array();
        while (true) {
            preg_match('/\G\s*(?:<!--.*?-->\s*)*/s', $part, $m, 0, $pos);
            $pos += strlen($m[0]);
            if (substr($part, $pos, 6) === '</div>') {
                break;
            }
            if (!preg_match('/\G<(a|article) class="wk-card[^"]*"/', $part, $m, 0, $pos)) {
                return null;
            }
            $end = strpos($part, '</' . $m[1] . '>', $pos);
            if ($end === false) {
                return null;
            }
            $end += strlen($m[1]) + 3;
            $cards[] = substr($part, $pos, $end - $pos);
            $pos = $end;
        }
        $cols[] = $cards;
        $rests[] = substr($part, $pos);
    }
    return array($parts[0], $cols, $rests);
}

// 카드 이름표: 새 페이지 = p:<id>, 기존 카드 = 안에 있는 첫 data-cms id (cms.py card_key)
function cms_card_key($c)
{
    if (preg_match('/data-cms-page="([^"]+)"/', $c, $m)) {
        return 'p:' . $m[1];
    }
    if (preg_match('/data-cms="([^"]+)"/', $c, $m)) {
        return $m[1];
    }
    return null;
}

// pages.json 의 works.cols (cms.py works_order)
function cms_works_order($data)
{
    $w = is_array($data) ? cms_get($data, 'works') : null;
    $cols = is_array($w) ? cms_get($w, 'cols') : null;
    if (!is_array($cols) || count($cols) !== 2 || !isset($cols[0]) || !isset($cols[1]) || !is_array($cols[0]) || !is_array($cols[1])) {
        return array(array(), array());
    }
    $out = array();
    foreach (array($cols[0], $cols[1]) as $c) {
        $o = array();
        foreach ($c as $k) {
            if (is_string($k)) {
                $o[] = $k;
            }
        }
        $out[] = $o;
    }
    return $out;
}

// 새 페이지 카드를 넣고 카드 순서를 맞춘다 (cms.py works_with_cards 와 같은 규칙)
function cms_works_with_cards($doc, $pages, $order = null)
{
    $sp = cms_split_cols($doc);
    if (!$sp) {
        return $doc;
    }
    list($head, $cols, $rests) = $sp;
    if (!$order) {
        $order = array(array(), array());
    }
    $static = array(array(), array());
    foreach ($cols as $ci => $col) {
        foreach ($col as $c) {
            if (!preg_match('/^<a class="wk-card[^"]*" data-cms-page="/', $c)) {
                $static[$ci][] = $c;
            }
        }
    }
    $pub = cms_public_pages($pages);
    $pcard = array();
    foreach ($pub as $p) {
        $pcard['p:' . $p['id']] = cms_card_html($p);
    }
    $smap = array();
    foreach ($static as $col) {
        foreach ($col as $c) {
            $k = cms_card_key($c);
            if ($k !== null && !isset($smap[$k])) {
                $smap[$k] = $c;
            }
        }
    }
    $listed = array();
    foreach (array_merge($order[0], $order[1]) as $k) {
        $listed[$k] = true;
    }
    $out = array(array(), array());
    $i = 0;
    foreach ($pub as $p) {
        if (!isset($listed['p:' . $p['id']])) {
            $out[$i % 2][] = $pcard['p:' . $p['id']];
            $i++;
        }
    }
    $used = array();
    foreach (array(0, 1) as $ci) {
        foreach ($order[$ci] as $k) {
            if (isset($used[$k])) {
                continue;
            }
            $c = isset($pcard[$k]) ? $pcard[$k] : (isset($smap[$k]) ? $smap[$k] : null);
            if ($c !== null) {
                $out[$ci][] = $c;
                $used[$k] = true;
            }
        }
    }
    foreach ($static as $ci => $col) {
        foreach ($col as $c) {
            $k = cms_card_key($c);
            if ($k === null || !isset($used[$k])) {
                $out[$ci][] = $c;
                if ($k !== null) {
                    $used[$k] = true;
                }
            }
        }
    }
    $x = array('', '');
    foreach (array(0, 1) as $ci) {
        foreach ($out[$ci] as $c) {
            $x[$ci] .= "\n" . $c;
        }
    }
    return $head . '<div class="wk-col">' . $x[0] . "\n" . $rests[0] . '<div class="wk-col">' . $x[1] . "\n" . $rests[1];
}

// ── 저장소 ───────────────────────────────────────────

function cms_load_pages()
{
    if (!file_exists(CMS_PAGES)) {
        return array('version' => 0, 'pages' => array());
    }
    $d = json_decode(file_get_contents(CMS_PAGES), true);
    if (!is_array($d) || !isset($d['pages']) || !is_array($d['pages'])) {
        cms_fail('pages.json 이 깨져 있습니다', 500);
    }
    return $d;
}

function cms_page_file($slug)
{
    return CMS_ROOT . '/works/' . $slug . '/index.html';
}

// 이 페이지에 메뉴·바닥글 고친 값(g-…)을 넣는다
function cms_page_apply_shared($doc)
{
    $idx = cms_load_index();
    $content = cms_load_content();
    if (preg_match_all('/data-cms="(g-[0-9]+)"/', $doc, $mm)) {
        foreach (array_unique($mm[1]) as $id) {
            $items = (array)$content['items'];
            if (isset($items[$id]) && isset($idx['ids'][$id])) {
                $n = 0;
                $doc = cms_apply_one($doc, $id, $items[$id], $n, $idx['ids'][$id]);
            }
        }
    }
    return $doc;
}

function cms_page_write($p)
{
    if (!file_exists(CMS_SKELETON)) {
        cms_fail('새 페이지 틀이 없습니다 (배포를 다시 해 주세요)', 500);
    }
    $dir = dirname(cms_page_file($p['slug']));
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        cms_fail('페이지 폴더를 만들지 못했습니다', 500);
    }
    $doc = cms_page_apply_shared(cms_page_html($p, file_get_contents(CMS_SKELETON)));
    if (!cms_write_file(cms_page_file($p['slug']), $doc)) {
        cms_fail('페이지 파일을 쓰지 못했습니다', 500);
    }
}

function cms_page_remove($slug)
{
    $f = cms_page_file($slug);
    if (file_exists($f)) {
        @unlink($f);
    }
    @rmdir(dirname($f));
}

function cms_works_update($data)
{
    $f = CMS_ROOT . '/works/index.html';
    if (!file_exists($f)) {
        return;
    }
    if (!cms_write_file($f, cms_works_with_cards(file_get_contents($f), $data['pages'], cms_works_order($data)))) {
        cms_fail('Works 목록을 고치지 못했습니다', 500);
    }
}

function cms_pages_save_file($data)
{
    $data['version'] = (int)cms_get($data, 'version', 0) + 1;
    $data['updated'] = date('c');
    $data['pages'] = array_values($data['pages']);
    if (!cms_write_file(CMS_PAGES, cms_json_text($data))) {
        cms_fail('pages.json 을 쓰지 못했습니다', 500);
    }
    // 이전 판을 남긴다 (최근 50개)
    cms_ensure_dirs();
    @mkdir(CMS_PRIV . '/pages-history', 0755, true);
    cms_write_private('pages-history/' . date('Ymd-His') . '-' . cms_random_hex(2), $data);
    $files = glob(CMS_PRIV . '/pages-history/*.php');
    sort($files);
    while (count($files) > 50) {
        @unlink(array_shift($files));
    }
    return $data;
}

// ── 값 검사 ─────────────────────────────────────────

function cms_p_str($v, $max, $multi)
{
    if ($v === null) {
        return '';
    }
    if (!is_string($v) || strlen($v) > $max) {
        return false;
    }
    $v = str_replace("\r", '', $v);
    return $multi ? $v : cms_norm($v);
}

function cms_p_clean_media($m, $need)
{
    if ($m === null && !$need) {
        return null;
    }
    if (!is_array($m)) {
        return false;
    }
    $up = '#^/cms-data/uploads/[A-Za-z0-9._-]+$#';
    $type = cms_get($m, 'type');
    $src = cms_get($m, 'src');
    if (!in_array($type, array('img', 'video'), true) || !is_string($src) || !preg_match($up, $src)) {
        return false;
    }
    if ($type === 'img') {
        return array('type' => 'img', 'src' => $src);
    }
    $poster = cms_get($m, 'poster');
    if (!is_string($poster) || !preg_match($up, $poster)) {
        return false;
    }
    return array('type' => 'video', 'src' => $src, 'poster' => $poster);
}

// 이미 있는 주소 (사이트 페이지·다른 새 페이지)
function cms_reserved_slugs($pages, $selfId)
{
    $out = array('_preview' => true);
    $idx = cms_load_index();
    foreach ($idx['pages'] as $pg) {
        if (preg_match('#^works/([^/]+)/$#', $pg['route'], $m)) {
            $out[$m[1]] = true;
        }
    }
    foreach ($pages as $p) {
        if (cms_get($p, 'id') !== $selfId) {
            $out[$p['slug']] = true;
        }
    }
    return $out;
}

function cms_page_clean($in, $pages, $old, $preview = false)
{
    if (!is_array($in)) {
        return '형식이 잘못됐습니다';
    }
    $p = array();
    $p['id'] = $old ? $old['id'] : 'p' . cms_random_hex(4);
    $p['created'] = $old ? $old['created'] : date('c');
    $slug = cms_get($in, 'slug');
    if ($preview && (!is_string($slug) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug))) {
        $slug = 'preview';
    }
    if (!is_string($slug) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug) || strlen($slug) > 60) {
        return '페이지 주소는 영문 소문자·숫자·하이픈(-)으로 적어 주세요 (예: samsung-new-film)';
    }
    $res = $preview ? array() : cms_reserved_slugs($pages, $p['id']);
    if (isset($res[$slug])) {
        return '이미 쓰고 있는 주소입니다: /works/' . $slug . '/';
    }
    if (!$preview && (!$old || $old['slug'] !== $slug) && file_exists(cms_page_file($slug))) {
        return '서버에 같은 주소의 페이지가 이미 있습니다: /works/' . $slug . '/';
    }
    $p['slug'] = $slug;
    $p['status'] = cms_get($in, 'status') === 'public' ? 'public' : 'draft';
    foreach (array('title' => array(300, true), 'brand' => array(100, false), 'desc' => array(300, false)) as $k => $o) {
        $v = cms_p_str(cms_get($in, $k), $o[0], $o[1]);
        if ($v === false) {
            return '글이 너무 깁니다: ' . $k;
        }
        $p[$k] = $v;
    }
    if (cms_norm($p['title']) === '') {
        return '제목을 넣어 주세요';
    }
    $tags = cms_get($in, 'tags', array());
    if (!is_array($tags) || count($tags) > 12) {
        return '태그는 12개까지 넣을 수 있습니다';
    }
    $p['tags'] = array();
    foreach (array_values($tags) as $t) {
        $v = cms_p_str($t, 60, false);
        if ($v === false) {
            return '태그가 너무 깁니다';
        }
        if ($v !== '') {
            $p['tags'][] = $v;
        }
    }
    $hero = cms_p_clean_media(cms_get($in, 'hero'), true);
    if ($hero === false) {
        return '첫 화면(히어로) 이미지나 영상을 올려 주세요';
    }
    $p['hero'] = $hero;
    $intro = (array)cms_get($in, 'intro', array());
    $p['intro'] = array();
    foreach (array('title' => array(200, false), 'ko' => array(4000, true), 'en' => array(4000, true)) as $k => $o) {
        $v = cms_p_str(cms_get($intro, $k), $o[0], $o[1]);
        if ($v === false) {
            return '개요 글이 너무 깁니다';
        }
        $p['intro'][$k] = $v;
    }
    $card = (array)cms_get($in, 'card', array());
    $cm = cms_p_clean_media(cms_get($card, 'media'), false);
    if ($cm === false) {
        return 'Works 카드 이미지·영상이 올바르지 않습니다';
    }
    $p['card'] = array('size' => in_array(cms_get($card, 'size'), array('s', 'm', 'l'), true) ? $card['size'] : 'm');
    if ($cm) {
        $p['card']['media'] = $cm;
    }
    $blocks = cms_get($in, 'blocks', array());
    if (!is_array($blocks) || count($blocks) > 80) {
        return '내용 칸은 80개까지 넣을 수 있습니다';
    }
    $p['blocks'] = array();
    foreach (array_values($blocks) as $b) {
        $t = is_array($b) ? cms_get($b, 'type') : null;
        if ($t === 'media') {
            $items = cms_get($b, 'items', array());
            if (!is_array($items) || count($items) < 1 || count($items) > 2) {
                return '이미지·영상 줄에는 1개 또는 2개를 넣어 주세요';
            }
            $c = array();
            foreach (array_values($items) as $m) {
                $mm = cms_p_clean_media($m, true);
                if ($mm === false) {
                    return '이미지·영상 줄에 비어 있는 칸이 있습니다. 파일을 올리거나 칸을 지워 주세요';
                }
                $cap = cms_p_str(cms_get($m, 'caption'), 300, false);
                if ($cap === false) {
                    return '캡션이 너무 깁니다';
                }
                if ($cap !== '') {
                    $mm['caption'] = $cap;
                }
                $c[] = $mm;
            }
            $x = array('type' => 'media', 'items' => $c);
            $lay = cms_get($b, 'layout');
            if ((count($c) === 1 && in_array($lay, cms_p_widths(), true)) || (count($c) === 2 && in_array($lay, cms_p_splits(), true))) {
                $x['layout'] = $lay;
            }
            $p['blocks'][] = $x;
        } elseif ($t === 'text') {
            $x = array('type' => 'text');
            foreach (array('title' => array(200, false), 'ko' => array(4000, true), 'en' => array(4000, true)) as $k => $o) {
                $v = cms_p_str(cms_get($b, $k), $o[0], $o[1]);
                if ($v === false) {
                    return '글이 너무 깁니다';
                }
                $x[$k] = $v;
            }
            if (in_array(cms_get($b, 'align'), array('l', 'r'), true)) {
                $x['align'] = $b['align'];
            }
            foreach (array('above', 'below') as $k) {
                if (in_array(cms_get($b, $k), cms_p_gaps(), true)) {
                    $x[$k] = $b[$k];
                }
            }
            $p['blocks'][] = $x;
        } elseif ($t === 'film') {
            $vim = (string)cms_get($b, 'vimeo', '');
            if (!preg_match('/^[0-9]{5,12}$/', $vim)) {
                return '비메오 영상 번호가 올바르지 않습니다';
            }
            $poster = cms_get($b, 'poster');
            if (!is_string($poster) || !preg_match('#^/cms-data/uploads/[A-Za-z0-9._-]+$#', $poster)) {
                return '풀필름 재생 전 이미지를 올려 주세요';
            }
            $ft = cms_p_str(cms_get($b, 'title'), 100, false);
            if ($ft === false) {
                return '글이 너무 깁니다';
            }
            $p['blocks'][] = array('type' => 'film', 'title' => $ft, 'vimeo' => $vim, 'poster' => $poster);
        } else {
            return '모르는 칸 종류입니다';
        }
    }
    return $p;
}

function cms_page_find($pages, $id)
{
    foreach ($pages as $i => $p) {
        if (cms_get($p, 'id') === $id) {
            return $i;
        }
    }
    return -1;
}

// ── API 처리 (api.php 가 부른다) ──────────────────────

function cms_pages_api($a, $body)
{
    if ($a === 'pages') {
        cms_json_out(array('ok' => true, 'pages' => cms_load_pages()));
    }
    if ($a === 'page_preview') {
        $data = cms_load_pages();
        $id = (string)cms_get($body, 'id', '');
        $i = cms_page_find($data['pages'], $id);
        $p = cms_page_clean(cms_get($body, 'page'), $data['pages'], $i >= 0 ? $data['pages'][$i] : null, true);
        if (is_string($p)) {
            cms_fail($p); // 편집기가 빈 칸을 빼고 보내므로 여기 오는 건 제목·첫 화면이 없을 때
        }
        if (!file_exists(CMS_SKELETON)) {
            cms_fail('새 페이지 틀이 없습니다', 500);
        }
        $doc = cms_page_apply_shared(cms_page_html($p, file_get_contents(CMS_SKELETON)));
        // 미리보기 창(srcdoc)에서 ../../assets 가 맞게 풀리도록
        $doc = preg_replace('/<head>/', '<head><base href="/works/_preview/" />', $doc, 1);
        cms_json_out(array('ok' => true, 'html' => $doc));
    }
    if ($a === 'page_save') {
        $lock = cms_lock();
        $data = cms_load_pages();
        $id = (string)cms_get($body, 'id', '');
        $i = cms_page_find($data['pages'], $id);
        $old = $i >= 0 ? $data['pages'][$i] : null;
        $p = cms_page_clean(cms_get($body, 'page'), $data['pages'], $old);
        if (is_string($p)) {
            flock($lock, LOCK_UN);
            cms_fail($p);
        }
        if ($i >= 0) {
            $data['pages'][$i] = $p;
        } else {
            $data['pages'][] = $p;
        }
        $data = cms_pages_save_file($data);
        if ($old && $old['slug'] !== $p['slug']) {
            cms_page_remove($old['slug']);
        }
        if ($p['status'] === 'public') {
            cms_page_write($p);
        } else {
            cms_page_remove($p['slug']);
        }
        cms_works_update($data);
        flock($lock, LOCK_UN);
        cms_json_out(array('ok' => true, 'page' => $p, 'pages' => $data));
    }
    if ($a === 'page_delete') {
        $lock = cms_lock();
        $data = cms_load_pages();
        $i = cms_page_find($data['pages'], (string)cms_get($body, 'id', ''));
        if ($i < 0) {
            flock($lock, LOCK_UN);
            cms_fail('없는 페이지입니다');
        }
        $slug = $data['pages'][$i]['slug'];
        array_splice($data['pages'], $i, 1);
        $data = cms_pages_save_file($data);
        cms_page_remove($slug);
        cms_works_update($data);
        flock($lock, LOCK_UN);
        cms_json_out(array('ok' => true, 'pages' => $data));
    }
    if ($a === 'works_order') {
        $cols = cms_get($body, 'cols');
        if (!is_array($cols) || count($cols) !== 2 || !isset($cols[0]) || !isset($cols[1]) || !is_array($cols[0]) || !is_array($cols[1])) {
            cms_fail('형식이 잘못됐습니다');
        }
        $clean = array(array(), array());
        $seen = array();
        foreach (array(0, 1) as $ci) {
            foreach ($cols[$ci] as $k) {
                if (!is_string($k) || !preg_match('/^(?:p:[a-z0-9]{1,20}|[a-z0-9-]{1,40})$/', $k) || count($seen) >= 300) {
                    cms_fail('카드 이름표가 올바르지 않습니다');
                }
                if (!isset($seen[$k])) {
                    $seen[$k] = true;
                    $clean[$ci][] = $k;
                }
            }
        }
        $lock = cms_lock();
        $data = cms_load_pages();
        $data['works'] = array('cols' => $clean);
        $data = cms_pages_save_file($data);
        cms_works_update($data);
        flock($lock, LOCK_UN);
        cms_json_out(array('ok' => true, 'pages' => $data));
    }
}

// 메뉴·바닥글(g-…)을 고치면 새 페이지에도 반영한다 (cms_apply_ids 가 부른다)
function cms_custom_page_files()
{
    if (!file_exists(CMS_PAGES)) {
        return array();
    }
    $d = json_decode(file_get_contents(CMS_PAGES), true);
    $out = array();
    foreach ((array)cms_get($d, 'pages', array()) as $p) {
        if (cms_get($p, 'status') === 'public' && preg_match('/^[a-z0-9-]+$/', (string)cms_get($p, 'slug', ''))) {
            $out[] = 'works/' . $p['slug'] . '/index.html';
        }
    }
    return $out;
}
