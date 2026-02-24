/**
 * Automatic Diagnostic - Finds and analyzes the most recent index.html
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔍 AUTO-DIAGNOSTIC: Searching for downloaded index.html...\n');

// Common download locations
const searchPaths = [
  path.join(os.homedir(), 'Downloads'),
  path.join(os.homedir(), 'Desktop'),
  path.join(process.cwd())
];

function findIndexFiles(dir, depth = 0) {
  if (depth > 2) return []; // Don't go too deep
  
  try {
    const files = fs.readdirSync(dir);
    let indexFiles = [];
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && depth < 2) {
          indexFiles = indexFiles.concat(findIndexFiles(fullPath, depth + 1));
        } else if (file === 'index.html') {
          indexFiles.push({
            path: fullPath,
            mtime: stat.mtime
          });
        }
      } catch (e) {
        // Skip files we can't access
      }
    }
    
    return indexFiles;
  } catch (e) {
    return [];
  }
}

// Find all index.html files
let allIndexFiles = [];
for (const searchPath of searchPaths) {
  if (fs.existsSync(searchPath)) {
    console.log(`📂 Searching in: ${searchPath}`);
    allIndexFiles = allIndexFiles.concat(findIndexFiles(searchPath));
  }
}

if (allIndexFiles.length === 0) {
  console.log('\n❌ No index.html files found in common locations.');
  console.log('\n💡 Run this instead:');
  console.log('   node diagnose-cloned-site.js');
  console.log('   Then enter the full path to your index.html\n');
  process.exit(1);
}

// Sort by modification time (most recent first)
allIndexFiles.sort((a, b) => b.mtime - a.mtime);

console.log(`\n✅ Found ${allIndexFiles.length} index.html file(s)\n`);

// Show top 5 most recent
console.log('Most recent files:');
allIndexFiles.slice(0, 5).forEach((file, i) => {
  console.log(`${i + 1}. ${file.path}`);
  console.log(`   Modified: ${file.mtime.toLocaleString()}\n`);
});

// Analyze the most recent one
const targetFile = allIndexFiles[0].path;
console.log('='.repeat(70));
console.log(`ANALYZING: ${targetFile}`);
console.log('='.repeat(70) + '\n');

const content = fs.readFileSync(targetFile, 'utf8');

// Run diagnostics
const issues = [];
const warnings = [];
const successes = [];

// 1. Crash Report
if (content.includes('<!-- CRASH REPORT:')) {
  const crashMatch = content.match(/<!-- CRASH REPORT: (.+?) -->/);
  issues.push(`🔴 CRASH REPORT: ${crashMatch ? crashMatch[1] : 'Unknown error'}`);
} else {
  successes.push('✅ No crash report');
}

// 2. GSAP
const hasGSAP = content.includes('gsap.min.js');
const hasScrollTrigger = content.includes('ScrollTrigger.min.js');
if (!hasGSAP || !hasScrollTrigger) {
  issues.push('🔴 GSAP Phantom Engine MISSING');
} else {
  successes.push('✅ GSAP Phantom Engine injected');
}

// 3. React Scripts
const reactScripts = content.match(/<script[^>]*src=["'][^"']*(\/_next\/|\/static\/chunks\/)/gi);
if (reactScripts && reactScripts.length > 0) {
  issues.push(`🔴 Found ${reactScripts.length} React/Next.js scripts (should be removed)`);
} else {
  successes.push('✅ No React scripts found');
}

// 4. CSP
if (content.includes('Content-Security-Policy')) {
  issues.push('🔴 CSP Meta Tag present (blocks external scripts)');
} else {
  successes.push('✅ CSP removed');
}

// 5. Body Content
const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (bodyMatch) {
  const bodyLength = bodyMatch[1].trim().length;
  if (bodyLength < 100) {
    issues.push('🔴 Body is EMPTY or too small');
  } else {
    successes.push(`✅ Body has content (${bodyLength} chars)`);
  }
}

// 6. Animation Classes
const animateCount = (content.match(/cstudio-animate-me/g) || []).length;
if (animateCount === 0) {
  warnings.push('⚠️  No animation classes found');
} else {
  successes.push(`✅ ${animateCount} elements marked for animation`);
}

// 7. Tags Not Removed
if (content.includes('data-cstudio-hidden') || content.includes('data-cstudio-preloader')) {
  warnings.push('⚠️  Processing tags still present (should be removed)');
} else {
  successes.push('✅ Processing tags removed');
}

// 8. Hidden Elements
const opacityZero = (content.match(/opacity:\s*0/gi) || []).length;
const visibilityHidden = (content.match(/visibility:\s*hidden/gi) || []).length;
if (opacityZero > 10 || visibilityHidden > 10) {
  warnings.push(`⚠️  Many hidden elements (opacity:0: ${opacityZero}, visibility:hidden: ${visibilityHidden})`);
}

// Print Results
console.log('SUCCESSES:');
successes.forEach(s => console.log('  ' + s));
console.log('');

if (warnings.length > 0) {
  console.log('WARNINGS:');
  warnings.forEach(w => console.log('  ' + w));
  console.log('');
}

if (issues.length > 0) {
  console.log('CRITICAL ISSUES:');
  issues.forEach(i => console.log('  ' + i));
  console.log('');
}

console.log('='.repeat(70));
console.log('VERDICT:');
console.log('='.repeat(70));

if (issues.length === 0 && warnings.length === 0) {
  console.log('✅ File looks HEALTHY! If page is still blank, check browser console.\n');
} else if (issues.length > 0) {
  console.log('❌ CRITICAL ISSUES FOUND!\n');
  console.log('The page is blank because:\n');
  
  if (content.includes('<!-- CRASH REPORT:')) {
    console.log('→ The captureScript CRASHED during execution');
    console.log('→ Extension fell back to saving original broken code');
    console.log('→ ACTION: Share the crash report with developer\n');
  } else if (reactScripts && reactScripts.length > 0) {
    console.log('→ React/Next.js scripts were NOT removed');
    console.log('→ These cause SSR errors and blank screens');
    console.log('→ ACTION: Script removal logic is broken\n');
  } else if (!hasGSAP) {
    console.log('→ GSAP Phantom Engine was NOT injected');
    console.log('→ Animations cannot work without GSAP');
    console.log('→ ACTION: Engine injection logic failed\n');
  } else if (bodyMatch && bodyMatch[1].trim().length < 100) {
    console.log('→ Body content is EMPTY');
    console.log('→ DOM cloning failed');
    console.log('→ ACTION: Cloning logic is broken\n');
  }
} else {
  console.log('⚠️  Some warnings found, but file might work.\n');
  console.log('If page is still blank:');
  console.log('1. Open in Chrome and check Console (F12)');
  console.log('2. Check Network tab for failed requests');
  console.log('3. Share console errors with developer\n');
}

console.log('='.repeat(70));
console.log('\n📋 Full diagnostic report saved to: diagnostic-report.txt\n');

// Save detailed report
const report = `
DIAGNOSTIC REPORT
Generated: ${new Date().toLocaleString()}
File: ${targetFile}

SUCCESSES:
${successes.map(s => '  ' + s).join('\n')}

WARNINGS:
${warnings.length > 0 ? warnings.map(w => '  ' + w).join('\n') : '  None'}

CRITICAL ISSUES:
${issues.length > 0 ? issues.map(i => '  ' + i).join('\n') : '  None'}

FILE STATS:
- Total size: ${content.length} characters
- Body size: ${bodyMatch ? bodyMatch[1].trim().length : 0} characters
- Animation elements: ${animateCount}
- Hidden elements: opacity:0 (${opacityZero}), visibility:hidden (${visibilityHidden})

FIRST 50 LINES OF FILE:
${content.split('\n').slice(0, 50).join('\n')}
`;

fs.writeFileSync('diagnostic-report.txt', report);
console.log('✅ Done!\n');
