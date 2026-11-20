<?php
/* PL2 CMS — 공용 함수 (2026-11-19)
 *
 * 서버(카페24) PHP 가 5.5 라서 5.5 문법만 쓴다:
 *   ?? · ?-> · 타입 지정 · random_bytes · hash_equals · 가변 인자(...) 없음.
 *
 * 파일 위치 (사이트 루트 = 이 폴더의 부모)
 *   admin/cms-index.json         빌드가 만든 목록: 페이지, id → 들어 있는 html 파일, 원래 값
 *   cms-data/content.json        고객사가 고친 값 (공개 — 빌드가 받아 간다. 글·이미지 주소뿐이라 비밀이 아니다)
 *   cms-data/uploads/            올린 이미지·영상
 *   cms-data/private/            비밀번호 해시·로그인 실패 기록·이전 판 (.php 로 저장 → 웹으로 열어도 빈 화면)
 *
 * 적용 규칙(cms_text_html, cms_apply_one)은 tools/cms.py 와 똑같아야 한다. 고치면 둘 다 고친다.
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');
date_default_timezone_set('Asia/Seoul');

define('CMS_ROOT', dirname(__DIR__));
define('CMS_DATA', CMS_ROOT . '/cms-data');
define('CMS_PRIV', CMS_DATA . '/private');
define('CMS_UPLOADS', CMS_DATA . '/uploads');
define('CMS_HISTORY', CMS_PRIV . '/history');
define('CMS_INDEX', __DIR__ . '/cms-index.json');
define('CMS_CONTENT', CMS_DATA . '/content.json');
define('CMS_UPLOAD_URL', '/cms-data/uploads/');
define('CMS_HISTORY_KEEP', 100);
define('CMS_MAX_FAILS', 5);         // 이 횟수만큼 틀리면
define('CMS_LOCK_SECONDS', 900);    // 15분 잠근다

// ── 기본 ─────────────────────────────────────────────

function cms_json_out($data, $code = 200)
{
    if (function_exists('http_response_code')) {
        http_response_code($code);
    } else {
        header('X-PHP-Response-Code: ' . $code, true, $code);
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function cms_fail($msg, $code = 400)
{
    cms_json_out(array('ok' => false, 'error' => $msg), $code);
}

function cms_get($arr, $key, $default = null)
{
    return (is_array($arr) && array_key_exists($key, $arr)) ? $arr[$key] : $default;
}

function cms_random_hex($bytes)
{
    $strong = false;
    $raw = function_exists('openssl_random_pseudo_bytes') ? openssl_random_pseudo_bytes($bytes, $strong) : false;
    if ($raw === false || !$strong) {
        $raw = '';
        for ($i = 0; $i < $bytes; $i++) {
            $raw .= chr(mt_rand(0, 255));
        }
    }
    return bin2hex($raw);
}

function cms_equals($a, $b)
{
    // hash_equals 는 5.6 부터라 직접 (시간 차로 맞춰 보는 공격 방지)
    if (!is_string($a) || !is_string($b) || strlen($a) !== strlen($b)) {
        return false;
    }
    $r = 0;
    for ($i = 0; $i < strlen($a); $i++) {
        $r |= ord($a[$i]) ^ ord($b[$i]);
    }
    return $r === 0;
}

function cms_ensure_dirs()
{
    foreach (array(CMS_DATA, CMS_PRIV, CMS_UPLOADS, CMS_HISTORY) as $d) {
        if (!is_dir($d)) {
            @mkdir($d, 0755, true);
        }
    }
    $deny = "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n";
    if (!file_exists(CMS_PRIV . '/.htaccess')) {
        @file_put_contents(CMS_PRIV . '/.htaccess', $deny);
    }
    // 올린 파일은 실행되지 않게: 이미지·영상 말고 실행될 수 있는 확장자는 열어 주지 않는다.
    // 2026-11-19: RemoveHandler/RemoveType 을 넣었더니 카페24(AllowOverride 제한)에서 폴더 전체가 500 이 됐다.
    // 비밀 폴더에서 동작이 확인된 Order/Deny · Require 만 쓴다. 표시 문자열(v2)이 없는 옛 파일은 새로 쓴다.
    $up = "# pl2cms-v2\n"
        . "<FilesMatch \"\\.([Pp][Hh][Pp][0-9]?|[Pp][Hh][Tt][Mm][Ll]|[Pp][Hh][Aa][Rr]|[Hh][Tt][Mm][Ll]?|[Ss][Vv][Gg]|[Jj][Ss])$\">\n"
        . "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n</FilesMatch>\n";
    $f = CMS_UPLOADS . '/.htaccess';
    if (!file_exists($f) || strpos((string)@file_get_contents($f), 'pl2cms-v2') === false) {
        @file_put_contents($f, $up);
    }
}

/* 비밀 파일: PHP 종료 코드(exit) 한 줄 뒤에 JSON. 웹으로 열면 빈 화면이고, 여기서는 앞부분을 떼고 읽는다.
   (주의: // 한 줄 주석 안에 PHP 닫는 태그를 쓰면 거기서 PHP 가 끝난다 — 2026-11-19 에 그걸로 코드가 화면에 샜다) */
function cms_read_private($name, $default)
{
    $f = CMS_PRIV . '/' . $name . '.php';
    if (!file_exists($f)) {
        return $default;
    }
    $raw = file_get_contents($f);
    $p = strpos($raw, '?' . '>');
    $data = json_decode($p === false ? '' : substr($raw, $p + 2), true);
    return is_array($data) ? $data : $default;
}

function cms_write_private($name, $data)
{
    cms_ensure_dirs();
    return cms_write_file(CMS_PRIV . '/' . $name . '.php', "<?php exit; ?" . ">" . json_encode($data, JSON_UNESCAPED_UNICODE));
}

function cms_write_file($path, $text)
{
    $tmp = $path . '.tmp-' . cms_random_hex(4);
    if (@file_put_contents($tmp, $text) === false) {
        return false;
    }
    if (!@rename($tmp, $path)) {
        // 일부 호스팅은 덮어쓰는 rename 이 안 된다
        @unlink($path);
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            return false;
        }
    }
    return true;
}

function cms_load_index()
{
    static $idx = null;
    if ($idx === null) {
        $idx = json_decode(@file_get_contents(CMS_INDEX), true);
        if (!is_array($idx)) {
            cms_fail('cms-index.json 을 읽지 못했습니다', 500);
        }
    }
    return $idx;
}

function cms_load_content()
{
    if (!file_exists(CMS_CONTENT)) {
        return array('version' => 0, 'updated' => null, 'items' => array());
    }
    $c = json_decode(file_get_contents(CMS_CONTENT), true);
    if (!is_array($c) || !isset($c['items']) || !is_array($c['items'])) {
        cms_fail('content.json 이 깨져 있습니다', 500);
    }
    return $c;
}

function cms_json_text($data)
{
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
    if (defined('JSON_PRETTY_PRINT')) {
        $flags |= JSON_PRETTY_PRINT;
    }
    return json_encode($data, $flags);
}

// 저장할 때 서로 겹치지 않게 (두 사람이 동시에 저장하는 경우)
function cms_lock()
{
    cms_ensure_dirs();
    $fh = fopen(CMS_PRIV . '/lock', 'c');
    if (!$fh || !flock($fh, LOCK_EX)) {
        cms_fail('다른 저장이 진행 중입니다. 잠시 뒤 다시 시도해 주세요.', 503);
    }
    return $fh;
}

// ── 로그인 ───────────────────────────────────────────

function cms_session()
{
    if (session_id() !== '') {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || cms_get($_SERVER, 'HTTP_X_FORWARDED_PROTO') === 'https';
    session_name('pl2cms');
    session_set_cookie_params(0, '/admin/', null, $https, true);
    session_start();
}

function cms_client_ip()
{
    return cms_get($_SERVER, 'REMOTE_ADDR', '?');
}

function cms_locked_for()
{
    $fails = cms_read_private('fails', array());
    $e = cms_get($fails, cms_client_ip());
    if ($e && $e['n'] >= CMS_MAX_FAILS && time() - $e['t'] < CMS_LOCK_SECONDS) {
        return CMS_LOCK_SECONDS - (time() - $e['t']);
    }
    return 0;
}

function cms_note_fail($ok)
{
    $fails = cms_read_private('fails', array());
    $ip = cms_client_ip();
    // 오래된 기록은 버린다
    foreach ($fails as $k => $v) {
        if (time() - $v['t'] > CMS_LOCK_SECONDS) {
            unset($fails[$k]);
        }
    }
    if ($ok) {
        unset($fails[$ip]);
    } else {
        $e = cms_get($fails, $ip, array('n' => 0, 't' => time()));
        $fails[$ip] = array('n' => $e['n'] + 1, 't' => time());
    }
    cms_write_private('fails', $fails);
}

function cms_login($password)
{
    $auth = cms_read_private('auth', null);
    if (!$auth || empty($auth['hash'])) {
        return 'setup';
    }
    if (cms_locked_for() > 0) {
        return 'locked';
    }
    $ok = password_verify((string)$password, $auth['hash']);
    cms_note_fail($ok);
    if (!$ok) {
        return 'wrong';
    }
    session_regenerate_id(true);
    $_SESSION['cms_ok'] = 1;
    $_SESSION['cms_csrf'] = cms_random_hex(16);
    $_SESSION['cms_at'] = time();
    return 'ok';
}

function cms_logged_in()
{
    cms_session();
    if (empty($_SESSION['cms_ok'])) {
        return false;
    }
    // 12시간 지나면 다시 로그인
    if (time() - cms_get($_SESSION, 'cms_at', 0) > 43200) {
        $_SESSION = array();
        return false;
    }
    return true;
}

function cms_require_login()
{
    if (!cms_logged_in()) {
        cms_fail('로그인이 필요합니다', 401);
    }
    $t = cms_get($_SERVER, 'HTTP_X_CSRF', '');
    if (!cms_equals((string)$t, (string)cms_get($_SESSION, 'cms_csrf', ''))) {
        cms_fail('보안 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요.', 403);
    }
}

// ── 적용 규칙 (tools/cms.py 와 같다) ───────────────────

// 공백은 ASCII 6개만 (\x20 \x09 \x0A \x0B \x0C \x0D). \v · \s 를 쓰면 바이트 0x85 도 공백으로 잡혀
// 한글 UTF-8 이 쪼개진다 (2026-11-19 "하나의" 가 빈 줄로 바뀐 원인). tools/cms.py · editor.js 와 같은 목록.
function cms_norm($t)
{
    return trim(preg_replace('/[\x20\x09\x0A\x0B\x0C\x0D]+/', ' ', (string)$t), ' ');
}

function cms_esc_attr($v)
{
    return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
}

function cms_text_html($item)
{
    $lines = cms_get($item, 'lines');
    if (!is_array($lines) || !$lines) {
        $lines = array('');
    }
    $breaks = cms_get($item, 'breaks', array());
    $out = '';
    $n = count($lines);
    for ($i = 0; $i < $n; $i++) {
        $out .= htmlspecialchars(cms_norm($lines[$i]), ENT_NOQUOTES, 'UTF-8');
        if ($i < $n - 1) {
            $cls = (is_array($breaks) && isset($breaks[$i])) ? (string)$breaks[$i] : '';
            if (!preg_match('/^[a-z0-9 -]*$/', $cls)) {
                $cls = '';
            }
            $out .= $cls !== '' ? ' <br class="' . $cls . '" />' : ' <br />';
        }
    }
    return $out;
}

function cms_set_href($tag, $pat, $value)
{
    $v = cms_esc_attr($value);
    return preg_replace_callback($pat, function ($m) use ($v) {
        return 'href="' . $v . '"';
    }, $tag);
}

// 로고 띠 (About) — tools/cms.py logos_html 과 바이트까지 같은 결과
define('CMS_LOGO_FILL', 9);

function cms_safe_src($src)
{
    return is_string($src) && preg_match('#^(/[A-Za-z0-9._/-]+|https://[A-Za-z0-9._/-]+)$#', $src);
}

function cms_logos_html($item)
{
    $rows = cms_get($item, 'rows', array());
    if (!is_array($rows)) {
        $rows = array();
    }
    $rows = array_values($rows);
    $out = "\n";
    for ($r = 0; $r < 2; $r++) {
        $row = array();
        if (isset($rows[$r]) && is_array($rows[$r])) {
            foreach ($rows[$r] as $x) {
                if (is_array($x) && cms_safe_src(cms_get($x, 'src'))) {
                    $row[] = $x;
                }
            }
        }
        $out .= '          <div class="ab-brands-row">' . "\n";
        $half = array();
        if ($row) {
            $reps = max(1, (int)ceil(CMS_LOGO_FILL / count($row)));
            for ($k = 0; $k < $reps; $k++) {
                foreach ($row as $x) {
                    $half[] = array($x, $k === 0);
                }
            }
        }
        for ($copy = 0; $copy < 2; $copy++) {
            foreach ($half as $hx) {
                $show = $hx[1] && $copy === 0;
                $alt = $show ? cms_esc_attr(cms_norm(cms_get($hx[0], 'alt', ''))) : '';
                $hidden = $show ? '' : ' aria-hidden="true"';
                $out .= '            <div class="ab-brand"' . $hidden . '>' . "\n"
                    . '              <img src="' . cms_esc_attr($hx[0]['src']) . '" alt="' . $alt . '" />' . "\n"
                    . '            </div>' . "\n";
            }
        }
        $out .= '          </div>' . "\n";
    }
    return $out . '        ';
}

// 이미지 ↔ 영상 교체 — tools/cms.py swap_html 과 바이트까지 같은 결과
function cms_attrs_html($attrs, $drop)
{
    $s = '';
    foreach ($attrs as $a) {
        if (in_array($a[0], $drop, true)) {
            continue;
        }
        $s .= $a[1] === null ? ' ' . $a[0] : ' ' . $a[0] . '="' . $a[1] . '"';
    }
    return $s;
}

// 크기 % — 30~99 정수 (100 = 원래 크기). cms.py scale_ok · editor.js 와 같게
function cms_scale_ok($v)
{
    return is_int($v) && $v >= 30 && $v <= 99;
}

// 원래 속성 + 크기 설정 (tools/cms.py size_attrs 와 같은 결과)
function cms_size_attrs($attrs, $item, $drop)
{
    $keep = array();
    foreach ($attrs as $a) {
        if (!in_array($a[0], $drop, true)) {
            $keep[] = $a;
        }
    }
    $parts = array();
    $flags = '';
    $fit = cms_get($item, 'fit');
    if (is_array($fit) && (int)cms_get($fit, 'w', 0) > 0 && (int)cms_get($fit, 'h', 0) > 0) {
        $parts[] = '--cms-ar: ' . (int)$fit['w'] . ' / ' . (int)$fit['h'];
        if ((int)cms_get($fit, 'mw', 0) > 0 && (int)cms_get($fit, 'mh', 0) > 0) {
            $parts[] = '--cms-ar-mo: ' . (int)$fit['mw'] . ' / ' . (int)$fit['mh'];
        }
        $flags .= ' data-cms-fit';
    }
    $sc = cms_get($item, 'scale');
    if (cms_scale_ok($sc)) {
        $parts[] = 'scale: ' . $sc . '%';
        $flags .= ' data-cms-scale';
    }
    if (!$parts) {
        return cms_attrs_html($keep, array());
    }
    $style = null;
    $rest = array();
    foreach ($keep as $a) {
        if ($a[0] === 'style') {
            if ($style === null) {
                $style = $a[1];
            }
        } else {
            $rest[] = $a;
        }
    }
    $st = ($style !== null && $style !== '' ? rtrim($style, ' ;') . '; ' : '') . implode('; ', $parts);
    return cms_attrs_html($rest, array()) . $flags . ' style="' . $st . '"';
}

function cms_element_html($id, $sw, $item)
{
    $as = cms_get($item, 'as');
    $form = $as ? $as : $sw['tag'];
    if ($form === $sw['tag']) {
        $s = '<' . $form . ' data-cms="' . $id . '"' . cms_size_attrs($sw['attrs'], $item, array());
        return $form === 'img' ? $s . ' />' : $s . '>' . $sw['inner'] . '</video>';
    }
    $head = '<' . $form . ' data-cms="' . $id . '" data-cms-swap';
    if ($form === 'video') {
        $drop = array('src', 'alt', 'loading', 'decoding', 'draggable', 'srcset', 'sizes', 'width', 'height');
        $msrc = cms_get($item, 'msrc');
        $srcs = ($msrc ? '<source media="(max-width: 599.98px)" src="' . cms_esc_attr($msrc) . '" type="video/mp4" />' : '')
            . '<source src="' . cms_esc_attr(cms_get($item, 'src', '')) . '" type="video/mp4" />';
        return $head . cms_size_attrs($sw['attrs'], $item, $drop) . ' poster="' . cms_esc_attr(cms_get($item, 'poster', '')) . '"'
            . ' autoplay muted loop playsinline preload="metadata">' . $srcs . '</video>';
    }
    $drop = array('poster', 'preload', 'autoplay', 'muted', 'loop', 'playsinline', 'controls', 'width', 'height');
    return $head . cms_size_attrs($sw['attrs'], $item, $drop) . ' src="' . cms_esc_attr(cms_get($item, 'src', '')) . '" alt="" />';
}

function cms_swap_html($id, $sw, $item)
{
    $el = cms_element_html($id, $sw, $item);
    $w = cms_get($sw, 'wrap');
    if (!$w) {
        return $el;
    }
    $as = cms_get($item, 'as');
    $inner = (!$as || $as === $sw['tag']) ? $w['pre'] . $el . $w['post'] : $el;
    return '<picture' . cms_attrs_html($w['attrs'], array()) . '>' . $inner . '</picture>';
}

function cms_apply_one($doc, $id, $item, &$count, $meta = null)
{
    $q = preg_quote($id, '/');
    $count = 0;
    $sw = is_array($meta) ? cms_get($meta, 'swap') : null;
    if ($sw) {
        // 교체·크기 설정이 있는 자리는 원래 태그 정보로 자리를 통째로 다시 만든다 (되돌릴 때도)
        if (cms_get($sw, 'wrap')) {
            $pat = '/<picture\b[^>]*>(?:(?!<\/picture>).)*?data-cms="' . $q . '"(?:(?!<\/picture>).)*?<\/picture>/s';
        } else {
            $pat = '/<img data-cms="' . $q . '"[^>]*>|<video data-cms="' . $q . '"[^>]*>.*?<\/video>/s';
        }
        $new = cms_swap_html($id, $sw, $item);
        $doc = preg_replace_callback($pat, function ($m) use ($new) {
            return $new;
        }, $doc, -1, $count);
        if ($doc === null) {
            cms_fail('적용 중 오류 (정규식)', 500);
        }
        if (cms_get($item, 'as')) {
            return $doc;
        }
    }
    if (array_key_exists('rows', $item)) {
        $pat = '/(<([a-zA-Z0-9]+) data-cms="' . $q . '"[^>]*>)(.*?)(<\/\2>)/s';
        $cb = function ($m) use ($item, &$count) {
            $count++;
            return $m[1] . cms_logos_html($item) . $m[4];
        };
        $doc = preg_replace_callback($pat, $cb, $doc);
    } elseif (array_key_exists('lines', $item)) {
        $pat = '/(<([a-zA-Z0-9]+) data-cms="' . $q . '"[^>]*>)(.*?)(<\/\2>)/s';
        $cb = function ($m) use ($item, &$count) {
            $count++;
            $tag = $m[1];
            $inner = $m[3];
            preg_match('/^[\x20\x09\x0A\x0B\x0C\x0D]*/', $inner, $l);
            preg_match('/[\x20\x09\x0A\x0B\x0C\x0D]*$/', $inner, $t);
            $plain = array();
            foreach ((array)cms_get($item, 'lines', array()) as $x) {
                $plain[] = cms_norm($x);
            }
            $plain = implode(' ', $plain);
            // 바꿀 값에 $ · \ 가 있어도 치환 기호로 읽히지 않게 콜백으로 넣는다
            if (preg_match('/\bhref="tel:/', $tag)) {
                $tag = cms_set_href($tag, '/\bhref="tel:[^"]*"/', 'tel:' . preg_replace('/[^0-9+]/', '', $plain));
            } elseif (preg_match('/\bhref="mailto:/', $tag)) {
                $tag = cms_set_href($tag, '/\bhref="mailto:[^"]*"/', 'mailto:' . $plain);
            }
            $href = cms_get($item, 'href');
            if ($href && preg_match('/^(https?:\/\/|mailto:|tel:)/', $href)) {
                $tag = cms_set_href($tag, '/\bhref="[^"]*"/', $href);
            }
            return $tag . $l[0] . cms_text_html($item) . $t[0] . $m[4];
        };
        $doc = preg_replace_callback($pat, $cb, $doc);
    } else {
        $pat = '/<[a-zA-Z0-9]+ data-cms="' . $q . '"[^>]*>/';
        $cb = function ($m) use ($item, &$count) {
            $count++;
            $tag = $m[0];
            foreach (array('src', 'srcset', 'poster', 'data-vimeo') as $attr) {
                if (array_key_exists($attr, $item) && $item[$attr] !== null && preg_match('/\b' . $attr . '="/', $tag)) {
                    $val = cms_esc_attr($item[$attr]);
                    $tag = preg_replace_callback('/(\s)' . preg_quote($attr, '/') . '="[^"]*"/', function ($mm) use ($attr, $val) {
                        return $mm[1] . $attr . '="' . $val . '"';
                    }, $tag);
                }
            }
            return $tag;
        };
        $doc = preg_replace_callback($pat, $cb, $doc);
    }
    if ($doc === null) {
        cms_fail('적용 중 오류 (정규식)', 500);
    }
    return $doc;
}

// id → 실제로 쓸 값: 고친 값이 있으면 그것, 없으면 원래 값
function cms_effective($idx, $content, $id)
{
    $items = (array)$content['items']; // 비었으면 stdClass 일 수 있다 (cms_write_content)
    if (isset($items[$id])) {
        return $items[$id];
    }
    return $idx['ids'][$id]['base'];
}

// 주어진 id 들을 html 파일에 적용한다. 반환: 적용한 곳 수
function cms_apply_ids($ids, $content)
{
    $idx = cms_load_index();
    $byfile = array();
    // 이미지↔영상 자리를 원래 태그로 되돌리면 안쪽 <source> 의 고친 값도 다시 넣어야 한다
    foreach ($ids as $id) {
        if (isset($idx['ids'][$id]['children'])) {
            foreach ($idx['ids'][$id]['children'] as $c) {
                if (!in_array($c, $ids, true)) {
                    $ids[] = $c;
                }
            }
        }
    }
    $custom = function_exists('cms_custom_page_files') ? cms_custom_page_files() : array();
    foreach ($ids as $id) {
        if (!isset($idx['ids'][$id])) {
            continue;
        }
        $files = $idx['ids'][$id]['files'];
        if (strpos($id, 'g-') === 0) {
            $files = array_merge($files, $custom); // 메뉴·바닥글은 새 페이지에도
        }
        foreach ($files as $rel) {
            $byfile[$rel][] = $id;
        }
    }
    $total = 0;
    foreach ($byfile as $rel => $list) {
        $path = CMS_ROOT . '/' . $rel;
        if (strpos($rel, '..') !== false || !file_exists($path)) {
            continue;
        }
        $doc = file_get_contents($path);
        // 교체 자리를 먼저 (안정 정렬: PHP 5.5 usort 는 안정적이지 않아 번호를 같이 쓴다)
        $order = array();
        foreach ($list as $i => $id) {
            $order[] = array(isset($idx['ids'][$id]['swap']) ? 0 : 1, $i, $id);
        }
        sort($order);
        foreach ($order as $o) {
            $id = $o[2];
            $n = 0;
            $doc = cms_apply_one($doc, $id, cms_effective($idx, $content, $id), $n, $idx['ids'][$id]);
            $total += $n;
        }
        if (!cms_write_file($path, $doc)) {
            cms_fail('페이지 파일을 쓰지 못했습니다: ' . $rel, 500);
        }
    }
    return $total;
}

// ── 값 검사 ─────────────────────────────────────────

function cms_valid_media_url($url, $base)
{
    if ($url === $base) {
        return true;
    }
    return is_string($url) && preg_match('#^/cms-data/uploads/[A-Za-z0-9._-]+$#', $url);
}

// 브라우저에서 온 값 하나를 검사해 저장할 형태로 만든다. 문제가 있으면 오류 문구(string)를 돌려준다.
function cms_clean_item($id, $item)
{
    $idx = cms_load_index();
    if (!isset($idx['ids'][$id])) {
        return '없는 항목입니다: ' . $id;
    }
    $meta = $idx['ids'][$id];
    $base = $meta['base'];
    if (!is_array($item)) {
        return '형식이 잘못됐습니다: ' . $id;
    }
    if ($meta['kind'] === 'logos') {
        $rows = cms_get($item, 'rows');
        if (!is_array($rows) || count($rows) !== 2) {
            return '로고 목록 형식이 잘못됐습니다';
        }
        // 쓸 수 있는 그림: 원래 로고들 + 관리자에서 올린 파일
        $known = array();
        foreach ($base['rows'] as $brow) {
            foreach ($brow as $bx) {
                $known[$bx['src']] = true;
            }
        }
        $out = array('rows' => array());
        foreach (array_values($rows) as $row) {
            if (!is_array($row) || count($row) > 40) {
                return '로고는 한 줄에 40개까지 넣을 수 있습니다';
            }
            $clean = array();
            foreach (array_values($row) as $x) {
                $src = is_array($x) ? cms_get($x, 'src') : null;
                $alt = is_array($x) ? cms_get($x, 'alt', '') : '';
                if (!is_string($src) || !(isset($known[$src]) || preg_match('#^/cms-data/uploads/[A-Za-z0-9._-]+$#', $src))) {
                    return '로고 그림 주소가 올바르지 않습니다';
                }
                if (!is_string($alt) || strlen($alt) > 200) {
                    return '로고 이름이 너무 깁니다';
                }
                $clean[] = array('src' => $src, 'alt' => cms_norm($alt));
            }
            $out['rows'][] = $clean;
        }
        return $out;
    }
    if ($meta['kind'] === 'text') {
        $lines = cms_get($item, 'lines');
        $breaks = cms_get($item, 'breaks', array());
        if (!is_array($lines) || count($lines) < 1 || count($lines) > 60 || !is_array($breaks)) {
            return '글 형식이 잘못됐습니다: ' . $id;
        }
        $out = array('lines' => array(), 'breaks' => array());
        foreach (array_values($lines) as $l) {
            if (!is_string($l) || strlen($l) > 3000) {
                return '글이 너무 깁니다: ' . $id;
            }
            $out['lines'][] = cms_norm($l);
        }
        foreach (array_values($breaks) as $i => $b) {
            if ($i >= count($out['lines']) - 1) {
                break;
            }
            $out['breaks'][] = (is_string($b) && preg_match('/^[a-z0-9 -]*$/', $b)) ? $b : '';
        }
        while (count($out['breaks']) < count($out['lines']) - 1) {
            $out['breaks'][] = 'br-mo br-pc';
        }
        $href = cms_get($item, 'href');
        if ($href !== null && isset($base['href'])) {
            if (!is_string($href) || !preg_match('#^https?://[^\s"<>]+$#', $href) || strlen($href) > 500) {
                return '링크 주소가 올바르지 않습니다 (http:// 또는 https:// 로 시작)';
            }
            if ($href !== $base['href']) {
                $out['href'] = $href;
            }
        }
        return $out;
    }
    // 크기 설정 (높이 비율 맞춤 · 크기 단계) — 허용된 자리만
    $size = array();
    $fit = cms_get($item, 'fit');
    if ($fit !== null) {
        if (!cms_get($meta, 'fit') || !is_array($fit)) {
            return '이 자리는 높이를 파일 비율에 맞출 수 없습니다';
        }
        $f = array();
        foreach (array('w', 'h', 'mw', 'mh') as $k) {
            $v = cms_get($fit, $k);
            if ($v === null) {
                continue;
            }
            if (!is_int($v) || $v < 1 || $v > 20000) {
                return '파일 크기 값이 올바르지 않습니다';
            }
            $f[$k] = $v;
        }
        if (!isset($f['w']) || !isset($f['h'])) {
            return '파일 크기 값이 올바르지 않습니다';
        }
        $size['fit'] = $f;
    }
    $sc = cms_get($item, 'scale');
    if ($sc !== null) {
        if (!cms_get($meta, 'scale') || !cms_scale_ok($sc)) {
            return '이 자리는 크기를 바꿀 수 없습니다';
        }
        $size['scale'] = $sc;
    }
    $as = cms_get($item, 'as');
    if ($as !== null) {
        $sw = cms_get($meta, 'swap');
        if (!$sw || !in_array($as, array('img', 'video'), true) || $as === $sw['tag']) {
            return '이 자리는 이미지와 영상을 서로 바꿀 수 없습니다';
        }
        $up = '#^/cms-data/uploads/[A-Za-z0-9._-]+$#';
        $src = cms_get($item, 'src');
        if (!is_string($src) || !preg_match($up, $src)) {
            return '파일 주소가 올바르지 않습니다: ' . $id;
        }
        if ($as === 'img') {
            return array_merge(array('as' => 'img', 'src' => $src), $size);
        }
        $poster = cms_get($item, 'poster');
        if (!is_string($poster) || !preg_match($up, $poster)) {
            return '영상 포스터 주소가 올바르지 않습니다: ' . $id;
        }
        $out = array('as' => 'video', 'src' => $src, 'poster' => $poster);
        $msrc = cms_get($item, 'msrc');
        if ($msrc !== null) {
            if (!cms_get($sw, 'wrap') || !is_string($msrc) || !preg_match($up, $msrc)) {
                return '모바일 영상 주소가 올바르지 않습니다: ' . $id;
            }
            $out['msrc'] = $msrc;
        }
        return array_merge($out, $size);
    }
    $out = array();
    foreach ($base as $k => $v) {
        if (!array_key_exists($k, $item)) {
            continue;
        }
        $val = $item[$k];
        if ($k === 'data-vimeo') {
            if (!is_string($val) || !preg_match('/^[0-9]{5,12}$/', $val)) {
                return '비메오 영상 번호가 올바르지 않습니다';
            }
        } elseif (!cms_valid_media_url($val, $v)) {
            return '파일 주소가 올바르지 않습니다: ' . $id;
        }
        if ($val !== $v) {
            $out[$k] = $val;
        }
    }
    return array_merge($out, $size);
}

// 값이 원래 값과 같은가 (같으면 content.json 에서 뺀다)
function cms_is_base($id, $item)
{
    $idx = cms_load_index();
    $base = $idx['ids'][$id]['base'];
    if ($idx['ids'][$id]['kind'] === 'logos') {
        return $item['rows'] === $base['rows'];
    }
    if ($idx['ids'][$id]['kind'] === 'text') {
        return $item['lines'] === array_map('cms_norm', $base['lines'])
            && $item['breaks'] === $base['breaks'] && !isset($item['href']);
    }
    return count($item) === 0;
}

function cms_save_history($content)
{
    cms_ensure_dirs();
    $name = date('Ymd-His') . '-' . cms_random_hex(2);
    cms_write_private('history/' . $name, $content);
    $files = glob(CMS_HISTORY . '/*.php');
    sort($files);
    while (count($files) > CMS_HISTORY_KEEP) {
        @unlink(array_shift($files));
    }
}

function cms_write_content(&$content)
{
    if (!$content['items']) {
        $content['items'] = new stdClass(); // 비었을 때 [] 가 아니라 {} 로
    }
    if (!cms_write_file(CMS_CONTENT, cms_json_text($content))) {
        cms_fail('content.json 을 쓰지 못했습니다 (서버 폴더 권한 확인)', 500);
    }
}
