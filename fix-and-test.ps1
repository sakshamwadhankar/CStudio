Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "🔧 ULTIMATE FIX - Kiro + Saksham" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

# Phase 1: Clean Build
Write-Host "📦 Phase 1: Clean Build" -ForegroundColor Yellow
Write-Host "   Cleaning old files..." -ForegroundColor Gray

Set-Location ResourcesSaverExt-master

if (Test-Path .parcel-cache) {
    Remove-Item -Recurse -Force .parcel-cache
    Write-Host "   ✓ Removed .parcel-cache" -ForegroundColor Green
}

if (Test-Path unpacked2x) {
    Remove-Item -Recurse -Force unpacked2x
    Write-Host "   ✓ Removed unpacked2x" -ForegroundColor Green
}

Write-Host "   Copying static files..." -ForegroundColor Gray
New-Item -ItemType Directory -Force -Path unpacked2x | Out-Null
Copy-Item -Recurse -Force "src/static/*" unpacked2x/
Write-Host "   ✓ Static files copied" -ForegroundColor Green

Write-Host "   Building with Parcel..." -ForegroundColor Gray
npx parcel build ./src/*.html --dist-dir unpacked2x

Write-Host "`n✅ Phase 1 Complete!`n" -ForegroundColor Green

# Phase 2: Verify Build
Write-Host "📊 Phase 2: Verify Build" -ForegroundColor Yellow

$buildFiles = Get-ChildItem unpacked2x/devtool.app.*.js -ErrorAction SilentlyContinue
if ($buildFiles) {
    Write-Host "   ✓ Build files created:" -ForegroundColor Green
    $buildFiles | ForEach-Object {
        Write-Host "     • $($_.Name) - $($_.LastWriteTime)" -ForegroundColor White
    }
} else {
    Write-Host "   ❌ No build files found!" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Phase 2 Complete!`n" -ForegroundColor Green

# Phase 3: Check GSAP in Build
Write-Host "🔍 Phase 3: Check GSAP in Build" -ForegroundColor Yellow

$gsapCheck = Select-String -Path "unpacked2x/devtool.app.*.js" -Pattern "gsap\.min\.js" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($gsapCheck) {
    Write-Host "   ✅ GSAP found in build!" -ForegroundColor Green
    Write-Host "   File: $($gsapCheck.Filename)" -ForegroundColor Gray
} else {
    Write-Host "   ❌ GSAP NOT found in build!" -ForegroundColor Red
    Write-Host "   This means the build didn't include the fix!" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Phase 3 Complete!`n" -ForegroundColor Green

# Phase 4: Check textContent in Build
Write-Host "🔍 Phase 4: Check textContent in Build" -ForegroundColor Yellow

$textContentCheck = Select-String -Path "unpacked2x/devtool.app.*.js" -Pattern "textContent" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($textContentCheck) {
    Write-Host "   ✅ textContent found in build!" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  textContent not found (might be minified)" -ForegroundColor Yellow
}

Write-Host "`n✅ Phase 4 Complete!`n" -ForegroundColor Green

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "📋 Build Summary:" -ForegroundColor Cyan
Write-Host "   • Build files: $($buildFiles.Count)" -ForegroundColor White
Write-Host "   • GSAP injection: ✅ Present" -ForegroundColor Green
Write-Host "   • Location: $(Get-Location)\unpacked2x`n" -ForegroundColor White

Write-Host "🎯 NEXT STEPS (CRITICAL!):" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  Open Chrome" -ForegroundColor White
Write-Host "   → Go to: chrome://extensions`n" -ForegroundColor Gray

Write-Host "2️⃣  REMOVE Old Extension" -ForegroundColor White
Write-Host "   → Find 'CStudio - Edit & Clone'" -ForegroundColor Gray
Write-Host "   → Click 'Remove' button" -ForegroundColor Gray
Write-Host "   → Confirm removal`n" -ForegroundColor Gray

Write-Host "3️⃣  Load Fresh Extension" -ForegroundColor White
Write-Host "   → Click 'Load unpacked'" -ForegroundColor Gray
Write-Host "   → Select folder: $(Get-Location)\unpacked2x" -ForegroundColor Gray
Write-Host "   → Extension installed!`n" -ForegroundColor Gray

Write-Host "4️⃣  Download Website" -ForegroundColor White
Write-Host "   → Open any website" -ForegroundColor Gray
Write-Host "   → Press F12 (DevTools)" -ForegroundColor Gray
Write-Host "   → Go to 'CStudio' tab" -ForegroundColor Gray
Write-Host "   → Click 'Save All Resources'" -ForegroundColor Gray
Write-Host "   → Wait for download`n" -ForegroundColor Gray

Write-Host "5️⃣  Test Downloaded Site" -ForegroundColor White
Write-Host "   → Extract ZIP to NEW folder" -ForegroundColor Gray
Write-Host "   → Open index.html in VS Code" -ForegroundColor Gray
Write-Host "   → Search for: gsap.min.js" -ForegroundColor Gray
Write-Host "   → Should find GSAP injection code!`n" -ForegroundColor Gray

Write-Host "6️⃣  Run Diagnostic" -ForegroundColor White
Write-Host "   → cd .." -ForegroundColor Gray
Write-Host "   → node auto-diagnose.js" -ForegroundColor Gray
Write-Host "   → Should show: ✅ GSAP Phantom Engine injected`n" -ForegroundColor Gray

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Ready to test! 🚀" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Set-Location ..
