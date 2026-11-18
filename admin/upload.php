<?php
/* PL2 CMS — 이미지·영상 올리기 (2026-11-19, api.php ?a=upload 가 부른다)
 *
 * 이미지: jpg · png · webp. 원래 자리 크기(maxw, 브라우저가 원래 이미지의 실제 폭을 보낸다)보다 크면 줄인다.
 *         서버 GD 가 webp 를 쓸 수 있으면 webp 로, 아니면 jpg(투명 png 는 png)로 저장한다.
 *         줄일 필요가 없고 이미 webp 면 원본 그대로 둔다 (화질 손실 없음).
 * 영상:   mp4 만. 서버에서 다시 압축하지 않는다 (ffmpeg 가 없다) — 올리기 전에 줄여 와야 한다.
 * 파일 이름은 날짜 + 무작위 글자로 새로 짓는다 (원래 이름은 쓰지 않는다).
 */

define('CMS_MAX_IMAGE_BYTES', 30 * 1024 * 1024);
define('CMS_MAX_VIDEO_BYTES', 100 * 1024 * 1024);
define('CMS_MAX_PIXELS', 40000000); // 메모리 128MB 안에서 다룰 수 있는 크기

function cms_upload_error_text($code)
{
    switch ($code) {
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            return '파일이 서버 한도(' . ini_get('upload_max_filesize') . ')보다 큽니다';
        case UPLOAD_ERR_PARTIAL:
            return '파일이 끝까지 올라가지 않았습니다. 다시 시도해 주세요.';
        case UPLOAD_ERR_NO_FILE:
            return '파일이 없습니다';
        default:
            return '파일을 올리지 못했습니다 (코드 ' . $code . ')';
    }
}

function cms_new_name($ext)
{
    return date('Ymd-His') . '-' . cms_random_hex(4) . '.' . $ext;
}

function cms_handle_upload()
{
    cms_ensure_dirs();
    if (empty($_FILES['file'])) {
        // post_max_size 를 넘으면 PHP 가 $_FILES 를 통째로 비운다
        cms_fail('파일이 서버 한도(' . ini_get('post_max_size') . ')보다 크거나 비어 있습니다');
    }
    $f = $_FILES['file'];
    if ($f['error'] !== UPLOAD_ERR_OK) {
        cms_fail(cms_upload_error_text($f['error']));
    }
    if (!is_uploaded_file($f['tmp_name'])) {
        cms_fail('올린 파일을 찾지 못했습니다');
    }
    $kind = cms_get($_POST, 'kind', 'image');
    $mime = '';
    if (function_exists('finfo_open')) {
        $fi = finfo_open(FILEINFO_MIME_TYPE);
        $mime = (string)finfo_file($fi, $f['tmp_name']);
        finfo_close($fi);
    }

    if ($kind === 'video') {
        $head = file_get_contents($f['tmp_name'], false, null, 0, 12);
        $isMp4 = strlen($head) >= 12 && substr($head, 4, 4) === 'ftyp';
        if (!$isMp4) {
            cms_fail('mp4 영상만 올릴 수 있습니다');
        }
        if ($f['size'] > CMS_MAX_VIDEO_BYTES) {
            cms_fail('영상이 100MB 보다 큽니다. 줄여서 올려 주세요.');
        }
        $name = cms_new_name('mp4');
        if (!move_uploaded_file($f['tmp_name'], CMS_UPLOADS . '/' . $name)) {
            cms_fail('영상을 저장하지 못했습니다', 500);
        }
        @chmod(CMS_UPLOADS . '/' . $name, 0644);
        return array('ok' => true, 'url' => CMS_UPLOAD_URL . $name, 'bytes' => $f['size']);
    }

    // 이미지
    if ($f['size'] > CMS_MAX_IMAGE_BYTES) {
        cms_fail('이미지가 30MB 보다 큽니다');
    }
    $info = @getimagesize($f['tmp_name']);
    if (!$info) {
        cms_fail('이미지 파일이 아닙니다 (jpg · png · webp)');
    }
    $type = $info[2];
    $w = $info[0];
    $h = $info[1];
    $isWebp = defined('IMAGETYPE_WEBP') ? $type === IMAGETYPE_WEBP : ($mime === 'image/webp');
    if ($type !== IMAGETYPE_JPEG && $type !== IMAGETYPE_PNG && !$isWebp) {
        cms_fail('jpg · png · webp 이미지만 올릴 수 있습니다');
    }
    if ($w * $h > CMS_MAX_PIXELS) {
        cms_fail('이미지가 너무 큽니다 (' . $w . '×' . $h . '). 가로 4000px 정도로 줄여서 올려 주세요.');
    }
    $maxw = (int)cms_get($_POST, 'maxw', 0);
    if ($maxw < 200 || $maxw > 4000) {
        $maxw = 2400;
    }
    $needResize = $w > $maxw;

    if ($isWebp && !$needResize) {
        $name = cms_new_name('webp');
        if (!move_uploaded_file($f['tmp_name'], CMS_UPLOADS . '/' . $name)) {
            cms_fail('이미지를 저장하지 못했습니다', 500);
        }
        @chmod(CMS_UPLOADS . '/' . $name, 0644);
        return array('ok' => true, 'url' => CMS_UPLOAD_URL . $name, 'w' => $w, 'h' => $h, 'bytes' => $f['size']);
    }

    if (!function_exists('imagecreatetruecolor')) {
        cms_fail('서버에서 이미지를 처리할 수 없습니다 (GD 없음)', 500);
    }
    if ($type === IMAGETYPE_JPEG) {
        $src = @imagecreatefromjpeg($f['tmp_name']);
    } elseif ($type === IMAGETYPE_PNG) {
        $src = @imagecreatefrompng($f['tmp_name']);
    } else {
        $src = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($f['tmp_name']) : false;
    }
    if (!$src) {
        cms_fail('이미지를 읽지 못했습니다');
    }
    $alpha = $type === IMAGETYPE_PNG || $isWebp;
    $nw = $needResize ? $maxw : $w;
    $nh = $needResize ? max(1, (int)round($h * $maxw / $w)) : $h;
    $dst = imagecreatetruecolor($nw, $nh);
    if ($alpha) {
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
    }
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    imagedestroy($src);

    $canWebp = function_exists('imagewebp');
    if ($canWebp) {
        $ext = 'webp';
    } elseif ($alpha) {
        $ext = 'png';
    } else {
        $ext = 'jpg';
    }
    $name = cms_new_name($ext);
    $path = CMS_UPLOADS . '/' . $name;
    if ($ext === 'webp') {
        $ok = imagewebp($dst, $path, 84);
    } elseif ($ext === 'png') {
        $ok = imagepng($dst, $path, 6);
    } else {
        imageinterlace($dst, 1);
        $ok = imagejpeg($dst, $path, 86);
    }
    imagedestroy($dst);
    if (!$ok || !file_exists($path) || filesize($path) === 0) {
        @unlink($path);
        cms_fail('이미지를 저장하지 못했습니다', 500);
    }
    @chmod($path, 0644);
    return array('ok' => true, 'url' => CMS_UPLOAD_URL . $name, 'w' => $nw, 'h' => $nh, 'bytes' => filesize($path));
}
