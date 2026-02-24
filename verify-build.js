/**
 * Quick verification that the captureScript is properly formatted
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying captureScript implementation...\n');

const filePath = path.join(__dirname, 'ResourcesSaverExt-master/src/devtoolApp/hooks/useAppSaveAllResource.js');
const content = fs.readFileSync(filePath, 'utf8');

const checks = {
  'IIFE wrapper': content.includes('(function() {'),
  'Try-catch block': content.includes('try {') && content.includes('} catch (err) {'),
  'Crash report': content.includes('CRASH REPORT:'),
  'GSAP injection': content.includes('gsap.min.js') && content.includes('ScrollTrigger.min.js'),
  'Smart Clone tags': content.includes('data-cstudio-hidden') && content.includes('data-cstudio-preloader'),
  'Preloader detection (z-index > 40)': content.includes('parseInt(style.zIndex) > 40'),
  'Black background detection': content.includes("backgroundColor === 'rgb(0, 0, 0)'"),
  'Image self-healing': content.includes('data-original-src'),
  'Scroll unlock': content.includes("overflow', 'auto', 'important'"),
  'Animation threshold': content.includes('window.innerHeight * 0.3'),
  'GSAP duration 1.2s': content.includes('duration: 1.2')
};

let allPassed = true;
for (const [check, passed] of Object.entries(checks)) {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${check}`);
  if (!passed) allPassed = false;
}

console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('✅ ALL CHECKS PASSED!');
  console.log('\n📦 Next steps:');
  console.log('1. Go to chrome://extensions');
  console.log('2. Click reload on your extension');
  console.log('3. Test "Save All Resources" on a website');
  console.log('4. Check the downloaded index.html for crash reports');
} else {
  console.log('❌ SOME CHECKS FAILED!');
  console.log('Please review the implementation.');
}
console.log('='.repeat(50));
