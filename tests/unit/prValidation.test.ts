import { describe, expect, it } from 'vitest';
import {
  extractPatchNotes,
  validatePrMetadata,
} from '../../scripts/verify-pr.mjs';

describe('extractPatchNotes', () => {
  it('extracts patch notes and strips HTML comments', () => {
    const body = `
## Summary
Fixes issue with tab groups.

## Patch Notes
<!-- Describe what changed for users -->
- Fixed tab duplication when switching spaces.
- Improved sidebar performance.

## Reviewers
@raphp
    `;
    const notes = extractPatchNotes(body);
    expect(notes).toBe(
      '- Fixed tab duplication when switching spaces.\n- Improved sidebar performance.'
    );
  });

  it('handles "## Release Notes" heading variation', () => {
    const body = `
## Release Notes
- New shortcut Alt+C to copy clean links.
    `;
    expect(extractPatchNotes(body)).toBe(
      '- New shortcut Alt+C to copy clean links.'
    );
  });

  it('handles "## Patch Notes (User-Facing)" heading variation', () => {
    const body = `
## Patch Notes (User-Facing)
- New shortcut Alt+C to copy clean links.
    `;
    expect(extractPatchNotes(body)).toBe(
      '- New shortcut Alt+C to copy clean links.'
    );
  });

  it('returns null if section is empty or contains only comments', () => {
    const body = `
## Patch Notes
<!-- Just a comment with no actual notes -->

## Other
content
    `;
    expect(extractPatchNotes(body)).toBeNull();
    expect(extractPatchNotes('')).toBeNull();
    expect(extractPatchNotes(null)).toBeNull();
  });
});

describe('validatePrMetadata', () => {
  it('fails when no type label is present', () => {
    const res = validatePrMetadata({
      labels: ['ui', 'needs-review'],
      body: '## Patch Notes\n- Fixed bug',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Missing required type label');
  });

  it('fails when conflicting type labels are present', () => {
    const res = validatePrMetadata({
      labels: ['type: feature', 'type: fix'],
      body: '## Patch Notes\n- Added feature and fixed bug',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Conflicting type labels found');
    expect(res.error).toContain('type: feature, type: fix');
  });

  it('fails when "feature" label is applied without patch notes', () => {
    const res = validatePrMetadata({
      labels: ['feature'],
      body: 'No patch notes here',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('missing user-facing patch notes');
  });

  it('succeeds for "feature" with valid patch notes', () => {
    const res = validatePrMetadata({
      labels: ['feature', 'sidepanel'],
      body: '## Patch Notes\n- Added new quick tab switcher.',
    });
    expect(res.ok).toBe(true);
    expect(res.category).toBe('feature');
    expect(res.patchNotes).toBe('- Added new quick tab switcher.');
  });

  it('succeeds for "fix" with valid patch notes', () => {
    const res = validatePrMetadata({
      labels: ['type: fix'],
      body: '## Patch Notes\n- Fixed URL scheme validation for favorites.',
    });
    expect(res.ok).toBe(true);
    expect(res.category).toBe('fix');
    expect(res.patchNotes).toBe(
      '- Fixed URL scheme validation for favorites.'
    );
  });

  it('succeeds for "chore" even without patch notes', () => {
    const res = validatePrMetadata({
      labels: ['chore', 'dependencies'],
      body: 'Internal maintenance only.',
    });
    expect(res.ok).toBe(true);
    expect(res.category).toBe('chore');
  });

  it('succeeds for automated Release Please PRs by label, title, or branch', () => {
    const byLabel = validatePrMetadata({
      labels: ['autorelease: pending'],
      body: ':robot: Release Please',
    });
    expect(byLabel.ok).toBe(true);
    expect(byLabel.category).toBe('chore');

    const byTitle = validatePrMetadata({
      title: 'chore(main): release 0.2.0',
      labels: [],
      body: ':robot: Release Please',
    });
    expect(byTitle.ok).toBe(true);
    expect(byTitle.category).toBe('chore');

    const byBranch = validatePrMetadata({
      headRef: 'release-please--branches--main--components--bark-extension',
      labels: [],
      body: ':robot: Release Please',
    });
    expect(byBranch.ok).toBe(true);
    expect(byBranch.category).toBe('chore');
  });
});
