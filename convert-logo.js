#!/usr/bin/env node
/**
 * Convert SVG logo to PNG for Electron Builder
 * Usage: node convert-logo.js
 */

const fs = require('fs');
const path = require('path');

console.log('🎨 Converting logo.svg to icon.png...\n');

const svgPath = path.join(__dirname, 'build', 'logo-flame.svg');
const pngPath = path.join(__dirname, 'build', 'icon.png');

// Check if SVG exists
if (!fs.existsSync(svgPath)) {
    console.error('❌ Error: build/logo.svg not found!');
    process.exit(1);
}

// Read SVG content
const svgContent = fs.readFileSync(svgPath, 'utf8');

// Use puppeteer or sharp if available, otherwise provide instructions
try {
    // Try to use sharp (fast, recommended)
    const sharp = require('sharp');
    
    sharp(Buffer.from(svgContent))
        .resize(1024, 1024)
        .png()
        .toFile(pngPath)
        .then(() => {
            console.log('✅ Successfully created build/icon.png (1024x1024)');
            console.log('📋 Now rebuild your app: npm run build:mac');
        })
        .catch(err => {
            console.error('❌ Error converting with sharp:', err.message);
            console.log('\n💡 Alternative: Install ImageMagick and run:');
            console.log('   brew install imagemagick');
            console.log('   convert -background none -resize 1024x1024 build/logo.svg build/icon.png');
        });
} catch (e) {
    console.log('📦 sharp not installed. Installing...\n');
    
    // Install sharp
    const { execSync } = require('child_process');
    try {
        execSync('npm install --save-dev sharp', { stdio: 'inherit', cwd: __dirname });
        console.log('\n✅ sharp installed. Please run this script again:');
        console.log('   node convert-logo.js\n');
    } catch (installError) {
        console.error('❌ Could not install sharp automatically.');
        console.log('\n💡 Please install manually:');
        console.log('   npm install --save-dev sharp');
        console.log('   node convert-logo.js');
        console.log('\nOR use ImageMagick:');
        console.log('   brew install imagemagick');
        console.log('   convert -background none -resize 1024x1024 build/logo.svg build/icon.png');
    }
}
