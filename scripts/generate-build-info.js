const fs = require('fs');
const path = require('path');

const buildInfoPath = path.join(__dirname, '..', 'build-info.json');
const now = new Date();
const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

const packageJsonPath = path.join(__dirname, '..', 'package.json');
let version = '0.0.0';
try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    version = packageJson.version || version;
} catch (error) {
    console.warn('[generate-build-info] Unable to read package.json:', error.message);
}

const buildInfo = {
    timestamp: now.toISOString(),
    formatted: formattedTime,
    version
};

fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
console.log(`✅ Updated build-info.json (${formattedTime})`);
