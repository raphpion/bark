import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
let failed = false;

function fail(msg) {
  console.error(`❌ Hardening check failed: ${msg}`);
  failed = true;
}

function collectFiles(dir, extFilter) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectFiles(full, extFilter));
    } else if (extFilter(full)) {
      results.push(full);
    }
  }
  return results;
}

// 1. Manifest Least-Privilege & Privacy Checks
const manifestPath = resolve(root, 'public/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (Array.isArray(manifest.permissions) && manifest.permissions.includes('scripting')) {
  fail('public/manifest.json must not include unused "scripting" permission.');
}

if (Array.isArray(manifest.web_accessible_resources)) {
  for (const entry of manifest.web_accessible_resources) {
    if (entry.resources?.some((r) => r.includes('_favicon'))) {
      fail(
        'public/manifest.json must not expose "_favicon/*" in web_accessible_resources (history fingerprinting risk).'
      );
    }
  }
}

// 2. Content Script Isolation Check
const contentScript = readFileSync(resolve(root, 'src/content/main.ts'), 'utf8');
if (contentScript.includes('GET_STATE')) {
  fail(
    'src/content/main.ts must not request full BarkState via GET_STATE in untrusted web pages.'
  );
}

// 3. Background Sender Verification Check
const bgScript = readFileSync(resolve(root, 'src/background/main.ts'), 'utf8');
if (!bgScript.includes('isExtensionOrigin') || !bgScript.includes('sender.url?.startsWith')) {
  fail(
    'src/background/main.ts must verify message sender origin before executing privileged actions.'
  );
}

if (bgScript.includes('currentWindow: true')) {
  fail(
    'src/background/main.ts must not use { currentWindow: true } (which can target popup windows); use getNormalWindowTabs().'
  );
}

// 4. Preact JSX XSS Guardrails (No .innerHTML or dangerouslySetInnerHTML in UI code)
const srcFiles = collectFiles(
  resolve(root, 'src'),
  (f) => f.endsWith('.ts') || f.endsWith('.tsx')
);

for (const file of srcFiles) {
  const code = readFileSync(file, 'utf8');
  if (code.includes('.innerHTML')) {
    fail(`${file} uses .innerHTML; use Preact JSX components instead.`);
  }
  if (code.includes('dangerouslySetInnerHTML')) {
    fail(`${file} uses dangerouslySetInnerHTML; use safe Preact JSX elements instead.`);
  }
}

if (!failed) {
  console.log('✅ All security & architecture hardening checks passed.');
} else {
  process.exit(1);
}
