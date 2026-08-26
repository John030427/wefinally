param(
    [Parameter(Mandatory=$true)][string]$HtmlPath,
    [Parameter(Mandatory=$true)][string]$OutPng,
    [int]$Width = 390,
    [int]$Height = 2600,
    [double]$Scale = 2,
    [string]$UrlBase = "http://127.0.0.1:4311"
)
# Capture one HTML file via headless Chrome over local HTTP server.
# Headless Chrome clamps window width to ~512 minimum, so we render at 512 and
# crop the centered $Width logical px band (page canvas is centered via margin:auto).
$ErrorActionPreference = "Stop"
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$renderW = 512   # safe >= chrome headless min width
$full = (Resolve-Path $HtmlPath).ProviderPath
$repoRoot = "D:\wefinal\.worktrees\ui-research-2026-v1"
$rel = $full.Substring($repoRoot.Length).Replace("\", "/").TrimStart("/")
$url = "$UrlBase/$rel"
$tmp = "$env:TEMP\_cap_$([IO.Path]::GetFileNameWithoutExtension($OutPng)).png"

$ws = "--window-size=$renderW,$Height"
$dsf = "--force-device-scale-factor=$Scale"
# Pass 1: probe natural content height at this viewport (pages may use min-height:100vh)
$probeFile = Join-Path $env:TEMP ("_h_" + [IO.Path]::GetFileNameWithoutExtension($OutPng) + ".html")
$srcHtml = [System.IO.File]::ReadAllText($full, [System.Text.Encoding]::UTF8)
$inject = "<script>window.addEventListener('load',function(){setTimeout(function(){document.title='H='+Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);var d=document.createElement('div');d.id='hprobe';d.textContent='H='+Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);document.body.appendChild(d);},250);});</script>"
if ($srcHtml -match '</body>') { $srcHtml = $srcHtml -replace '</body>', ($inject + '</body>') } else { $srcHtml += $inject }
$probeRel = "designs/ui-research-2026/_hprobe_tmp.html"
[System.IO.File]::WriteAllText("D:\wefinal\.worktrees\ui-research-2026-v1\designs\ui-research-2026\_hprobe_tmp.html", $srcHtml, [System.Text.Encoding]::UTF8)
$dom = & $chrome --headless=new --disable-gpu --no-sandbox "--window-size=$renderW,900" --virtual-time-budget=4000 --dump-dom "$UrlBase/$probeRel" 2>$null | Out-String
Remove-Item "D:\wefinal\.worktrees\ui-research-2026-v1\designs\ui-research-2026\_hprobe_tmp.html" -ErrorAction SilentlyContinue
if ($dom -match 'H=(\d+)') {
    $natural = [int]$matches[1]
    if ($natural -gt 900 -and $natural -lt 6000) { $Height = $natural + 40 }
}
$ws = "--window-size=$renderW,$Height"
& $chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars `
    $dsf $ws `
    --virtual-time-budget=4000 --screenshot="$tmp" $url 2>$null | Out-Null

if (-not (Test-Path $tmp)) { Write-Output "CAPTURE_FAIL $url"; exit 1 }

Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile($tmp)
try {
    $h = $img.Height; $w = $img.Width
    # crop centered band of logical $Width px (physical = *Scale)
    $bandW = [int]($Width * $Scale)
    $bandX = [int](($w - $bandW) / 2)
    if ($bandX -lt 0) { $bandX = 0; $bandW = $w }
    $rect = New-Object System.Drawing.Rectangle($bandX, 0, $bandW, $h)
    $band = $img.Clone($rect, $img.PixelFormat)

    # trim bottom uniform rows
    $bh = $band.Height; $bw = $band.Width
    $c1 = $band.GetPixel(3, $bh - 3); $c2 = $band.GetPixel([int]($bw/2), $bh - 3); $c3 = $band.GetPixel($bw - 4, $bh - 3)
    $br = [int](($c1.R + $c2.R + $c3.R) / 3); $bg_ = [int](($c1.G + $c2.G + $c3.G) / 3); $bb = [int](($c1.B + $c2.B + $c3.B) / 3)
    function RowIsBg([System.Drawing.Bitmap]$im, [int]$y, [int]$wr, [int]$gr, [int]$br_, [int]$tol) {
        for ($x = 0; $x -lt $im.Width; $x += 4) {
            $p = $im.GetPixel($x, $y)
            if ([Math]::Abs($p.R - $wr) -gt $tol -or [Math]::Abs($p.G - $gr) -gt $tol -or [Math]::Abs($p.B - $br_) -gt $tol) { return $false }
        }
        return $true
    }
    $cutFrom = $bh
    for ($y = $bh - 1; $y -gt 100; $y--) {
        if (-not (RowIsBg $band $y $br $bg_ $bb 10)) { $cutFrom = [Math]::Min($bh, $y + 24); break }
    }
    if ($cutFrom -lt 200) { $cutFrom = $bh }
    $outH = $cutFrom
    $rect2 = New-Object System.Drawing.Rectangle(0, 0, $bw, $outH)
    $cropped = $band.Clone($rect2, $band.PixelFormat)
    $outDir = Split-Path $OutPng -Parent
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
    $cropped.Save($OutPng, [System.Drawing.Imaging.ImageFormat]::Png)
    $cropped.Dispose(); $band.Dispose()
    Write-Output ("OK {0} -> {1} ({2}x{3})" -f (Split-Path $HtmlPath -Leaf), $OutPng, $bw, $outH)
} finally {
    $img.Dispose()
    Remove-Item $tmp -ErrorAction SilentlyContinue
}
