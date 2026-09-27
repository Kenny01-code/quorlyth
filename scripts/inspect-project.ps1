# Run this inside ANY existing project folder. It writes project-report.txt (secrets are masked).
# Usage:  powershell -ExecutionPolicy Bypass -File .\inspect-project.ps1
$root = (Get-Location).Path
$out  = Join-Path $root 'project-report.txt'
$skip = '\\(node_modules|\.git|dist|build|\.next|\.vercel|\.turbo|coverage)(\\|$)'

"PROJECT REPORT  $(Get-Date)"            | Set-Content $out
"Folder: $root"                          | Add-Content $out
"Node: $(node -v 2>$null)   npm: $(npm -v 2>$null)" | Add-Content $out

"`n== FILE TREE (without node_modules) ==" | Add-Content $out
Get-ChildItem -Recurse -File -Force | Where-Object { $_.FullName -notmatch $skip } |
  ForEach-Object { '{0,8} KB  {1}' -f [math]::Round($_.Length/1KB,1), $_.FullName.Substring($root.Length+1) } | Add-Content $out

if (Test-Path package.json) {
  "`n== package.json ==" | Add-Content $out
  Get-Content package.json | Add-Content $out
}

"`n== ROUTES / PAGES FOUND ==" | Add-Content $out
Get-ChildItem -Recurse -Include *.tsx,*.jsx,*.ts,*.js,*.vue,*.html -File | Where-Object { $_.FullName -notmatch $skip } |
  Select-String -Pattern 'path\s*[=:]\s*["''`]/|<Route|createBrowserRouter|href="/|app\.(get|post)\(' |
  ForEach-Object { '{0}:{1}  {2}' -f $_.Path.Substring($root.Length+1), $_.LineNumber, $_.Line.Trim() } | Select-Object -First 200 | Add-Content $out

"`n== ENV FILES (values hidden) ==" | Add-Content $out
Get-ChildItem -Force -Filter '.env*' -File | ForEach-Object {
  "-- $($_.Name)" | Add-Content $out
  Get-Content $_.FullName | ForEach-Object { if ($_ -match '^\s*([A-Za-z0-9_]+)\s*=') { "$($Matches[1]) = ****" } } | Add-Content $out
}

"`n== FIRST 60 LINES OF KEY FILES ==" | Add-Content $out
foreach ($f in 'index.html','src\main.tsx','src\main.jsx','src\App.tsx','src\App.jsx','vite.config.ts','vite.config.js','tailwind.config.js') {
  if (Test-Path $f) { "`n-- $f" | Add-Content $out; Get-Content $f -TotalCount 60 | Add-Content $out }
}
Write-Host "Done. Report saved to $out" -ForegroundColor Green
