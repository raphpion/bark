import { execSync } from 'node:child_process';
import { existsSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const distDir = resolve(root, 'dist');
const zipFile = resolve(root, 'bark-extension.zip');

if (!existsSync(resolve(distDir, 'manifest.json'))) {
  console.log('Building extension before packaging...');
  execSync('npm run build', { stdio: 'inherit' });
}

if (existsSync(zipFile)) {
  rmSync(zipFile);
}

console.log('Packaging dist/ into bark-extension.zip...');

if (process.platform === 'win32') {
  // Use PowerShell Compress-Archive on Windows
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipFile}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  // Use zip utility on Linux / macOS
  execSync(`cd "${distDir}" && zip -q -r "${zipFile}" .`, { stdio: 'inherit' });
}

if (!existsSync(zipFile)) {
  console.error('❌ Failed to produce bark-extension.zip');
  process.exit(1);
}

const stats = statSync(zipFile);
const sizeKb = (stats.size / 1024).toFixed(1);
console.log(`✅ bark-extension.zip created successfully (${sizeKb} KB).`);
