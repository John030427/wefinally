param([string]$HtmlPath)
# Build a probe copy that reports elements overflowing the 390px canvas, run it, print report.
$ErrorActionPreference = "Stop"
$src = (Resolve-Path $HtmlPath).ProviderPath
$html = Get-Content $src -Raw -Encoding UTF8
$probe = @"
<script>
window.addEventListener('load', function(){
  setTimeout(function(){
    var W = 390, rep = [];
    var de = document.documentElement;
    rep.push('DOC scrollWidth=' + de.scrollWidth + ' clientWidth=' + de.clientWidth + ' bodySW=' + document.body.scrollWidth);
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > W + 1 || r.left < -1)) {
        var tag = el.tagName.toLowerCase();
        var cls = (typeof el.className === 'string' && el.className) ? ('.' + el.className.trim().split(/\s+/).join('.')) : '';
        var id = el.id ? ('#' + el.id) : '';
        rep.push('OVF ' + tag + id + cls + ' left=' + Math.round(r.left) + ' right=' + Math.round(r.right) + ' w=' + Math.round(r.width));
      }
    }
    var pre = document.createElement('pre');
    pre.id = 'overflow-report';
    pre.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:#fff;color:#000;font:11px monospace;padding:4px;max-width:390px;white-space:pre-wrap;';
    pre.textContent = 'REPORT_BEGIN\n' + rep.slice(0, 40).join('\n') + '\nREPORT_END';
    document.body.appendChild(pre);
  }, 300);
});
</script>
"@
$probeFile = Join-Path $env:TEMP ("_probe_" + [IO.Path]::GetFileName($src))
if ($html -match '</body>') { $html = $html -replace '</body>', ($probe + '</body>') } else { $html += $probe }
[System.IO.File]::WriteAllText($probeFile, $html, [System.Text.Encoding]::UTF8)
$rel = "designs/ui-research-2026/_probe_tmp.html"
Copy-Item $probeFile "D:\wefinal\.worktrees\ui-research-2026-v1\designs\ui-research-2026\_probe_tmp.html" -Force
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$dom = & $chrome --headless=new --disable-gpu --no-sandbox "--window-size=390,2600" --virtual-time-budget=5000 --dump-dom "http://127.0.0.1:4311/designs/ui-research-2026/_probe_tmp.html" 2>$null | Out-String
if ($dom -match '(?s)REPORT_BEGIN(.*)REPORT_END') { $matches[1].Trim() } else { Write-Output "PROBE_FAIL: no report found"; Write-Output $dom.Substring(0, [Math]::Min(500, $dom.Length)) }
Remove-Item "D:\wefinal\.worktrees\ui-research-2026-v1\designs\ui-research-2026\_probe_tmp.html" -ErrorAction SilentlyContinue
