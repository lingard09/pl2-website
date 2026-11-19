<?php
/* PL2 CMS — 관리자 화면이 부르는 API (2026-11-19)
 *   POST ?a=login     {password}
 *   POST ?a=logout
 *   GET  ?a=state                     → 목록(cms-index) + 고친 값(content)
 *   POST ?a=save      {changes: {id: 값 | null(원래대로)}}
 *   POST ?a=upload    (multipart: file, kind=image|video, maxw)
 *   GET  ?a=history                   → 이전 판 목록
 *   POST ?a=restore   {name}          → 그 판으로 되돌리기
 *   GET  ?a=pages                     → 새 페이지 목록 (pages.php)
 *   POST ?a=page_preview {id, page}   → 미리보기 html
 *   POST ?a=page_save    {id, page}   → 저장 (공개면 /works/<slug>/ 와 Works 카드까지)
 *   POST ?a=page_delete  {id}
 */
require __DIR__ . '/lib.php';
require __DIR__ . '/pages.php';

$a = cms_get($_GET, 'a', '');
$method = cms_get($_SERVER, 'REQUEST_METHOD', 'GET');

function cms_body()
{
    $b = json_decode(file_get_contents('php://input'), true);
    return is_array($b) ? $b : array();
}

if ($a === 'login') {
    if ($method !== 'POST') {
        cms_fail('POST 만', 405);
    }
    cms_session();
    $r = cms_login(cms_get(cms_body(), 'password', ''));
    if ($r === 'ok') {
        cms_json_out(array('ok' => true, 'csrf' => $_SESSION['cms_csrf']));
    }
    if ($r === 'locked') {
        cms_fail('여러 번 틀려서 잠시 잠겼습니다. ' . ceil(cms_locked_for() / 60) . '분 뒤에 다시 시도해 주세요.', 429);
    }
    if ($r === 'setup') {
        cms_fail('관리자 비밀번호가 아직 설정되지 않았습니다. 개발자에게 문의해 주세요.', 503);
    }
    cms_fail('비밀번호가 맞지 않습니다', 401);
}

if ($a === 'logout') {
    cms_session();
    $_SESSION = array();
    session_destroy();
    cms_json_out(array('ok' => true));
}

cms_require_login();

if ($a === 'state') {
    cms_json_out(array('ok' => true, 'index' => cms_load_index(), 'content' => cms_load_content()));
}

if ($method !== 'POST' && $a !== 'history' && $a !== 'pages') {
    cms_fail('POST 만', 405);
}

if (in_array($a, array('pages', 'page_preview', 'page_save', 'page_delete'), true)) {
    cms_pages_api($a, cms_body());
}

if ($a === 'save') {
    $changes = cms_get(cms_body(), 'changes');
    if (!is_array($changes) || !$changes) {
        cms_fail('바뀐 내용이 없습니다');
    }
    if (count($changes) > 2000) {
        cms_fail('한 번에 너무 많이 바꿨습니다');
    }
    $clean = array();
    foreach ($changes as $id => $item) {
        $id = (string)$id;
        if ($item === null) {
            $clean[$id] = null;
            continue;
        }
        $c = cms_clean_item($id, $item);
        if (is_string($c)) {
            cms_fail($c);
        }
        $clean[$id] = cms_is_base($id, $c) ? null : $c;
    }
    $lock = cms_lock();
    $content = cms_load_content();
    cms_save_history($content);
    foreach ($clean as $id => $item) {
        if ($item === null) {
            unset($content['items'][$id]);
        } else {
            $content['items'][$id] = $item;
        }
    }
    $content['version'] = (int)cms_get($content, 'version', 0) + 1;
    $content['updated'] = date('c');
    cms_write_content($content);
    $n = cms_apply_ids(array_keys($clean), $content);
    flock($lock, LOCK_UN);
    cms_json_out(array('ok' => true, 'applied' => $n, 'content' => $content));
}

if ($a === 'upload') {
    require __DIR__ . '/upload.php';
    cms_json_out(cms_handle_upload());
}

if ($a === 'history') {
    $out = array();
    $files = glob(CMS_HISTORY . '/*.php');
    rsort($files);
    foreach ($files as $f) {
        $name = basename($f, '.php');
        $c = cms_read_private('history/' . $name, array());
        $out[] = array('name' => $name, 'updated' => cms_get($c, 'updated'), 'count' => count((array)cms_get($c, 'items', array())));
    }
    cms_json_out(array('ok' => true, 'history' => $out));
}

if ($a === 'restore') {
    $name = (string)cms_get(cms_body(), 'name', '');
    if (!preg_match('/^[0-9]{8}-[0-9]{6}-[0-9a-f]{4}$/', $name) || !file_exists(CMS_HISTORY . '/' . $name . '.php')) {
        cms_fail('없는 기록입니다');
    }
    $old = cms_read_private('history/' . $name, null);
    if (!is_array($old) || !isset($old['items']) || !is_array($old['items'])) {
        cms_fail('기록 파일이 깨져 있습니다');
    }
    $lock = cms_lock();
    $content = cms_load_content();
    cms_save_history($content);
    // 지금 값과 되돌릴 값이 다른 id 만 다시 적용한다 (없어진 것은 원래 값으로)
    $ids = array_unique(array_merge(array_keys($content['items']), array_keys($old['items'])));
    $changed = array();
    foreach ($ids as $id) {
        if (cms_get($content['items'], $id) !== cms_get($old['items'], $id)) {
            $changed[] = $id;
        }
    }
    $new = array('version' => (int)cms_get($content, 'version', 0) + 1, 'updated' => date('c'), 'items' => $old['items']);
    cms_write_content($new);
    $n = cms_apply_ids($changed, $new);
    flock($lock, LOCK_UN);
    cms_json_out(array('ok' => true, 'applied' => $n, 'content' => $new));
}

cms_fail('모르는 요청입니다', 404);
