<?php
/* PL2 CMS — 관리자 화면 (2026-11-19). 화면은 editor.js 가 그린다. */
require __DIR__ . '/lib.php';
$logged = cms_logged_in();
$csrf = $logged ? $_SESSION['cms_csrf'] : '';
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex, nofollow');
$v = @filemtime(__DIR__ . '/editor.js') . '-' . @filemtime(__DIR__ . '/editor.css');
?><!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>PL2 사이트 관리</title>
  <script>if (location.protocol === "http:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") location.replace("https:" + location.href.slice(5));</script>
  <link rel="stylesheet" href="editor.css?v=<?php echo htmlspecialchars($v); ?>" />
</head>
<body>
  <div id="app" data-csrf="<?php echo htmlspecialchars($csrf); ?>"></div>
  <script src="editor.js?v=<?php echo htmlspecialchars($v); ?>"></script>
</body>
</html>
