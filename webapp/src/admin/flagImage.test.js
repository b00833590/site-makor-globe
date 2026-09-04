// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { isFlagSequence, flagImageUrl, buildFlagImageEl, appendJoinedParts } from './flagImage.js';

describe('isFlagSequence', () => {
  it('returns true for a real 2-codepoint regional-indicator flag emoji', () => {
    expect(isFlagSequence('🇫🇷')).toBe(true);
    expect(isFlagSequence('🇩🇪')).toBe(true);
    expect(isFlagSequence('🇸🇪')).toBe(true);
  });

  it('returns false for plain text, even if it looks like a country code', () => {
    expect(isFlagSequence('FR')).toBe(false);
  });

  it('returns false for empty/nullish input', () => {
    expect(isFlagSequence('')).toBe(false);
    expect(isFlagSequence(undefined)).toBe(false);
    expect(isFlagSequence(null)).toBe(false);
  });

  it('returns false for a single emoji that is not a flag', () => {
    expect(isFlagSequence('🏳️')).toBe(false);
  });
});

describe('flagImageUrl', () => {
  it('builds a URL from the flag emoji codepoints, lowercase hex joined by a hyphen', () => {
    expect(flagImageUrl('🇫🇷')).toBe('https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/1f1eb-1f1f7.png');
    expect(flagImageUrl('🇩🇪')).toBe('https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/1f1e9-1f1ea.png');
  });

  it('returns null for a non-flag value', () => {
    expect(flagImageUrl('FR')).toBeNull();
    expect(flagImageUrl('')).toBeNull();
  });
});

describe('buildFlagImageEl', () => {
  it('builds an <img> with the flag image URL as src and the raw flag as alt text', () => {
    const img = buildFlagImageEl('🇮🇹');
    expect(img.tagName).toBe('IMG');
    expect(img.className).toBe('flag-emoji');
    expect(img.alt).toBe('🇮🇹');
    expect(img.src).toBe('https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72/1f1ee-1f1f9.png');
  });

  it('returns null when the value is not a real flag', () => {
    expect(buildFlagImageEl('FR')).toBeNull();
    expect(buildFlagImageEl('')).toBeNull();
  });
});

describe('appendJoinedParts', () => {
  it('joins string parts with the separator, skipping empty ones', () => {
    const parent = document.createElement('div');
    appendJoinedParts(parent, ['ARM', '', 'UK'], ' · ');
    expect(parent.textContent).toBe('ARM · UK');
  });

  it('interleaves a DOM node part (e.g. a flag image) correctly', () => {
    const parent = document.createElement('div');
    const img = document.createElement('img');
    img.alt = '🇬🇧';
    appendJoinedParts(parent, ['ARM', img, 'UK'], ' · ');
    expect(parent.childNodes.length).toBe(5); // text, sep, img, sep, text
    expect(parent.querySelector('img')).toBe(img);
    expect(parent.textContent).toBe('ARM ·  · UK');
  });

  it('produces no separators when only one part survives', () => {
    const parent = document.createElement('div');
    appendJoinedParts(parent, ['', 'UK', ''], ' · ');
    expect(parent.textContent).toBe('UK');
  });
});
