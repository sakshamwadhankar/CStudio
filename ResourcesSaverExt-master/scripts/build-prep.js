const fs = require('fs');
const path = require('path');

const srcStaticDir = path.join(__dirname, '../src/static');
const distDir = path.join(__dirname, '../unpacked2x');
const parcelCacheDir = path.join(__dirname, '../.parcel-cache');

function deleteFolderRecursive(directoryPath) {
    if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file, index) => {
            const curPath = path.join(directoryPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(directoryPath);
    }
}

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest);
        }
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

console.log('🧹 Cleaning old build files...');
deleteFolderRecursive(parcelCacheDir);
deleteFolderRecursive(distDir);

console.log('📁 Creating build directory...');
fs.mkdirSync(distDir, { recursive: true });

console.log('📂 Copying static assets...');
if (fs.existsSync(srcStaticDir)) {
    copyRecursiveSync(srcStaticDir, distDir);
} else {
    console.error('❌ Source static directory not found:', srcStaticDir);
    process.exit(1);
}

console.log('✅ Preparation complete!');
