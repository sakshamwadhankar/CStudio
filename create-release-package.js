/**
 * Create Release Package for Upload
 * Creates a ZIP file of the extension ready for distribution
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 Creating Release Package...\n');

const sourceDir = 'ResourcesSaverExt-master/unpacked2x';
const outputZip = 'CStudio-Edit-Clone-v2.0.6.zip';

// Check if source directory exists
if (!fs.existsSync(sourceDir)) {
  console.error('❌ Error: unpacked2x directory not found!');
  console.log('   Run: npm run build first\n');
  process.exit(1);
}

console.log('✅ Source directory found');
console.log(`📂 Source: ${sourceDir}`);
console.log(`📦 Output: ${outputZip}\n`);

// Create ZIP using PowerShell (Windows)
try {
  console.log('🔄 Creating ZIP file...');
  
  const command = `Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${outputZip}" -Force`;
  execSync(command, { shell: 'powershell.exe', stdio: 'inherit' });
  
  console.log('\n✅ ZIP file created successfully!');
  
  // Get file size
  const stats = fs.statSync(outputZip);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log(`\n📊 Package Details:`);
  console.log(`   File: ${outputZip}`);
  console.log(`   Size: ${fileSizeMB} MB`);
  console.log(`   Location: ${path.resolve(outputZip)}`);
  
  console.log('\n🎉 Release package ready for upload!');
  console.log('\n📤 Upload Instructions:');
  console.log('   1. Go to Chrome Web Store Developer Dashboard');
  console.log('   2. Click "New Item" or update existing');
  console.log('   3. Upload: ' + outputZip);
  console.log('   4. Fill in store listing details');
  console.log('   5. Submit for review\n');
  
  console.log('📝 Or share directly:');
  console.log('   - Upload to GitHub Releases');
  console.log('   - Share ZIP file with users');
  console.log('   - Users can load unpacked in chrome://extensions\n');
  
} catch (error) {
  console.error('❌ Error creating ZIP:', error.message);
  process.exit(1);
}
