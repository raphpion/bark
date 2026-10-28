import { readFileSync } from 'node:fs';

export const CATEGORY_MAP = {
  // Breaking (Major: 1.0.0)
  breaking: 'breaking',
  'type: breaking': 'breaking',
  'type:breaking': 'breaking',
  'breaking-change': 'breaking',
  'type: breaking-change': 'breaking',

  // Feature (Minor: 0.1.0 -> 0.2.0)
  feature: 'feature',
  'type: feature': 'feature',
  'type:feature': 'feature',
  enhancement: 'feature',
  'type: enhancement': 'feature',

  // Fix (Patch: 0.1.0 -> 0.1.1)
  fix: 'fix',
  'type: fix': 'fix',
  'type:fix': 'fix',
  bug: 'fix',
  'type: bug': 'fix',

  // Chore / Internal (No release)
  chore: 'chore',
  'type: chore': 'chore',
  'type:chore': 'chore',
  internal: 'chore',
  'skip-release': 'chore',
  'type: skip-release': 'chore',
  documentation: 'chore',
  docs: 'chore',
  dependencies: 'chore',
  refactor: 'chore',
};

/**
 * Extracts the user-facing patch notes section from a PR body.
 * Strips HTML comments (<!-- ... -->) and trims whitespace.
 */
export function extractPatchNotes(body) {
  if (!body) return null;

  // Look for "## Patch Notes" or "## Release Notes" (case-insensitive, optional suffix like "(User-Facing)")
  const headerMatch = body.match(/^##\s+(?:Patch|Release)\s+Notes.*$/im);
  if (!headerMatch || headerMatch.index === undefined) {
    return null;
  }

  const afterHeader = body.slice(headerMatch.index + headerMatch[0].length);
  const nextHeaderMatch = afterHeader.match(/^##\s+/m);
  const rawSection =
    nextHeaderMatch && nextHeaderMatch.index !== undefined
      ? afterHeader.slice(0, nextHeaderMatch.index)
      : afterHeader;

  const stripped = rawSection.replace(/<!--[\s\S]*?-->/g, '').trim();
  return stripped.length > 0 ? stripped : null;
}

/**
 * Validates PR labels and description:
 * 1. Exactly one release category label must be present (breaking, feature, fix, chore).
 *    Fails if missing or conflicting.
 * 2. If category is breaking, feature, or fix, a non-empty `## Patch Notes` section is required.
 */
export function validatePrMetadata(input) {
  const labels = input?.labels || [];
  const matchedCategories = new Map();

  for (const rawLabel of labels) {
    const normalized = String(rawLabel).trim().toLowerCase();
    const cat = CATEGORY_MAP[normalized];
    if (cat) {
      const existing = matchedCategories.get(cat) || [];
      existing.push(rawLabel);
      matchedCategories.set(cat, existing);
    }
  }

  const distinctCategories = [...matchedCategories.keys()];
  const allMatchedLabels = [...matchedCategories.values()].flat();

  // 1. Missing category label
  if (distinctCategories.length === 0) {
    return {
      ok: false,
      matchedLabels: [],
      error:
        'Missing required type label. Please apply exactly one type label to this PR:\n' +
        '  - "feature" (minor version bump: 0.1.0 -> 0.2.0)\n' +
        '  - "fix" (patch version bump: 0.1.0 -> 0.1.1)\n' +
        '  - "breaking" (major version bump: 0.1.0 -> 1.0.0)\n' +
        '  - "chore" (internal/maintenance; no store release created)',
    };
  }

  // 2. Conflicting category labels
  if (distinctCategories.length > 1) {
    return {
      ok: false,
      matchedLabels: allMatchedLabels,
      error:
        `Conflicting type labels found: [${allMatchedLabels.join(', ')}].\n` +
        `This PR matches multiple categories: [${distinctCategories.join(', ')}].\n` +
        'Please keep only ONE type label (e.g. either "feature" OR "fix", not both).',
    };
  }

  const category = distinctCategories[0];
  const patchNotes = extractPatchNotes(input.body);

  // 3. User-facing categories (feature, fix, breaking) require patch notes
  if (category !== 'chore') {
    if (!patchNotes) {
      return {
        ok: false,
        category,
        matchedLabels: allMatchedLabels,
        error:
          `PR is labeled "${category}" but is missing user-facing patch notes.\n` +
          'Please fill out the "## Patch Notes" section in the PR description with bullet points ' +
          'describing what changed for Bark users.',
      };
    }
  }

  return {
    ok: true,
    category,
    matchedLabels: allMatchedLabels,
    patchNotes: patchNotes || undefined,
  };
}

// Direct CLI Execution
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    console.log('ℹ️ GITHUB_EVENT_PATH not set; skipping PR validation (not running in GitHub Action PR event).');
    process.exit(0);
  }

  let event;
  try {
    event = JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch (err) {
    console.error('❌ Failed to read GITHUB_EVENT_PATH:', err);
    process.exit(1);
  }

  const pr = event.pull_request;
  if (!pr) {
    console.log('ℹ️ Event is not a pull_request; skipping validation.');
    process.exit(0);
  }

  console.log(`🔍 Validating labels and patch notes for PR #${pr.number}: "${pr.title}"...`);

  const labels = (pr.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const result = validatePrMetadata({
    labels,
    body: pr.body,
  });

  if (!result.ok) {
    console.error('\n❌ PR Metadata Validation Failed:\n');
    console.error(result.error);
    console.error(
      '\nTip: Update the labels or edit the PR description. CI will automatically re-run and verify.'
    );
    // Write GitHub Actions notice/error annotation
    console.log(`::error title=Invalid PR Labels/Description::${result.error.replace(/\n/g, '%0A')}`);
    process.exit(1);
  }

  console.log(`\n✅ PR validation passed!`);
  console.log(`   Category : ${result.category.toUpperCase()}`);
  console.log(`   Labels   : [${result.matchedLabels.join(', ')}]`);
  if (result.patchNotes) {
    console.log(`   Notes    :\n${result.patchNotes.split('\n').map((l) => '     ' + l).join('\n')}`);
  }
}
