/**
 * Diagnostic Script for Cloned Website Issues
 * This will analyze the downloaded index.html and identify problems
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔍 CLONED WEBSITE DIAGNOSTIC TOOL\n');
console.log('This will help identify why your cloned site is blank.\n');

rl.question('Enter the path to your downloaded index.html file: ', (filePath) => {
  if (!fs.existsSync(filePath)) {
    console.log('❌ File not found! Please check the path.');
    rl.close();
    return;
  }

  console.log('\n📖 Reading file...\n');
  const content = fs.readFileSync(filePath, 'utf8');

  console.log('='.repeat(60));
  console.log('DIAGNOSTIC RESULTS');
  console.log('='.repeat(60) + '\n');

  // Check 1: Crash Report
  const hasCrashReport = content.includes('<!-- CRASH REPORT:');
  if (hasCrashReport) {
    const crashMatch = content.match(/<!-- CRASH REPORT: (.+?) -->/);
    console.log('❌ CRASH REPORT FOUND!');
    console.log('   Error: ' + (crashMatch ? crashMatch[1] : 'Unknown'));
    console.log('   → The captureScript failed during execution\n');
  } else {
    console.log('✅ No crash report found\n');
  }

  // Check 2: GSAP Scripts
  const hasGSAP = content.includes('gsap.min.js');
  const hasScrollTrigger = content.includes('ScrollTrigger.min.js');
  console.log('GSAP Phantom Engine:');
  console.log(`   ${hasGSAP ? '✅' : '❌'} GSAP library: ${hasGSAP ? 'Found' : 'MISSING'}`);
  console.log(`   ${hasScrollTrigger ? '✅' : '❌'} ScrollTrigger: ${hasScrollTrigger ? 'Found' : 'MISSING'}`);
  if (!hasGSAP || !hasScrollTrigger) {
    console.log('   → Animations will NOT work without GSAP!\n');
  } else {
    console.log('');
  }

  // Check 3: Animation Classes
  const hasAnimateClass = content.includes('cstudio-animate-me');
  console.log(`Animation Setup:`);
  console.log(`   ${hasAnimateClass ? '✅' : '❌'} Animation class: ${hasAnimateClass ? 'Found' : 'MISSING'}`);
  if (hasAnimateClass) {
    const animateCount = (content.match(/cstudio-animate-me/g) || []).length;
    console.log(`   📊 Elements to animate: ${animateCount}`);
  }
  console.log('');

  // Check 4: Preloader Tags
  const hasPreloaderTags = content.includes('data-cstudio-preloader');
  console.log(`Preloader Detection:`);
  console.log(`   ${hasPreloaderTags ? '⚠️' : '✅'} Preloader tags: ${hasPreloaderTags ? 'STILL PRESENT (BAD!)' : 'Removed (Good)'}`);
  if (hasPreloaderTags) {
    console.log('   → Preloaders should be removed, not tagged!\n');
  } else {
    console.log('');
  }

  // Check 5: Hidden Element Tags
  const hasHiddenTags = content.includes('data-cstudio-hidden');
  console.log(`Hidden Elements:`);
  console.log(`   ${hasHiddenTags ? '⚠️' : '✅'} Hidden tags: ${hasHiddenTags ? 'STILL PRESENT (BAD!)' : 'Removed (Good)'}`);
  if (hasHiddenTags) {
    console.log('   → Hidden tags should be removed after processing!\n');
  } else {
    console.log('');
  }

  // Check 6: React/Next.js Scripts
  const hasReactScripts = content.match(/<script[^>]*src=["'][^"']*\/_next\//gi) || 
                          content.match(/<script[^>]*src=["'][^"']*\/static\/chunks\//gi);
  console.log(`React/Next.js Scripts:`);
  if (hasReactScripts && hasReactScripts.length > 0) {
    console.log(`   ❌ Found ${hasReactScripts.length} React/Next.js scripts (SHOULD BE REMOVED!)`);
    console.log('   → These cause SSR errors and blank screens\n');
  } else {
    console.log('   ✅ No React/Next.js scripts found (Good)\n');
  }

  // Check 7: CSP Meta Tag
  const hasCSP = content.includes('Content-Security-Policy');
  console.log(`Security Headers:`);
  console.log(`   ${hasCSP ? '❌' : '✅'} CSP Meta Tag: ${hasCSP ? 'PRESENT (BAD!)' : 'Removed (Good)'}`);
  if (hasCSP) {
    console.log('   → CSP blocks external scripts like GSAP!\n');
  } else {
    console.log('');
  }

  // Check 8: Body Content
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const bodyContent = bodyMatch[1];
    const bodyLength = bodyContent.trim().length;
    console.log(`Body Content:`);
    console.log(`   📏 Size: ${bodyLength} characters`);
    if (bodyLength < 100) {
      console.log('   ❌ Body is almost EMPTY! This is why the page is blank.\n');
    } else {
      console.log('   ✅ Body has content\n');
    }
  }

  // Check 9: Inline Styles (opacity/visibility)
  const hasOpacityZero = content.match(/opacity:\s*0/gi);
  const hasVisibilityHidden = content.match(/visibility:\s*hidden/gi);
  console.log(`Element Visibility:`);
  if (hasOpacityZero) {
    console.log(`   ⚠️  Found ${hasOpacityZero.length} elements with opacity: 0`);
  }
  if (hasVisibilityHidden) {
    console.log(`   ⚠️  Found ${hasVisibilityHidden.length} elements with visibility: hidden`);
  }
  if (!hasOpacityZero && !hasVisibilityHidden) {
    console.log('   ✅ No hidden elements found');
  }
  console.log('');

  // Check 10: Scroll Lock
  const hasScrollLock = content.match(/overflow:\s*hidden/gi);
  console.log(`Scroll Lock:`);
  if (hasScrollLock && hasScrollLock.length > 0) {
    console.log(`   ⚠️  Found ${hasScrollLock.length} elements with overflow: hidden`);
    console.log('   → Page might not be scrollable\n');
  } else {
    console.log('   ✅ No scroll lock detected\n');
  }

  console.log('='.repeat(60));
  console.log('DIAGNOSIS SUMMARY');
  console.log('='.repeat(60) + '\n');

  // Determine the main issue
  if (hasCrashReport) {
    console.log('🔴 PRIMARY ISSUE: CaptureScript crashed during execution');
    console.log('   The extension fell back to saving the original broken code.\n');
    console.log('   ACTION: Share the crash report message with developer.\n');
  } else if (hasReactScripts && hasReactScripts.length > 0) {
    console.log('🔴 PRIMARY ISSUE: React/Next.js scripts not removed');
    console.log('   These scripts cause SSR errors and blank screens.\n');
    console.log('   ACTION: The script removal logic is not working.\n');
  } else if (!hasGSAP || !hasScrollTrigger) {
    console.log('🔴 PRIMARY ISSUE: GSAP Phantom Engine not injected');
    console.log('   Without GSAP, animations cannot work.\n');
    console.log('   ACTION: The engine injection logic failed.\n');
  } else if (bodyMatch && bodyMatch[1].trim().length < 100) {
    console.log('🔴 PRIMARY ISSUE: Body content is empty');
    console.log('   The DOM clone is not capturing page content.\n');
    console.log('   ACTION: The cloning logic is failing.\n');
  } else {
    console.log('🟡 POSSIBLE ISSUES:');
    if (hasPreloaderTags || hasHiddenTags) {
      console.log('   - Tags not being removed properly');
    }
    if (hasCSP) {
      console.log('   - CSP blocking external scripts');
    }
    if (hasOpacityZero || hasVisibilityHidden) {
      console.log('   - Elements still hidden');
    }
    console.log('\n   ACTION: Manual inspection needed.\n');
  }

  console.log('='.repeat(60));
  rl.close();
});
