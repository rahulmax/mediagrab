import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractM3U8Urls, isM3U8Url } from '../src/scraper.js';

describe('isM3U8Url', () => {
  it('detects .m3u8 URLs', () => {
    assert.equal(isM3U8Url('https://cdn.example.com/stream.m3u8'), true);
    assert.equal(isM3U8Url('https://cdn.example.com/stream.m3u8?token=abc'), true);
    assert.equal(isM3U8Url('https://example.com/page.html'), false);
  });
});

describe('extractM3U8Urls', () => {
  it('extracts m3u8 URLs from HTML with video tags', () => {
    const html = '<html><body><video src="https://cdn.example.com/video.m3u8"></video></body></html>';
    const urls = extractM3U8Urls(html, 'https://example.com');
    assert.ok(urls.includes('https://cdn.example.com/video.m3u8'));
  });

  it('extracts m3u8 URLs from source tags', () => {
    const html = '<html><body><video><source src="stream.m3u8" type="application/x-mpegURL"></video></body></html>';
    const urls = extractM3U8Urls(html, 'https://example.com/page');
    assert.ok(urls.includes('https://example.com/stream.m3u8'));
  });

  it('extracts m3u8 URLs from script content', () => {
    const html = '<html><body><script>var config = { file: "https://cdn.example.com/hls/master.m3u8" };</script></body></html>';
    const urls = extractM3U8Urls(html, 'https://example.com');
    assert.ok(urls.includes('https://cdn.example.com/hls/master.m3u8'));
  });

  it('extracts m3u8 URLs from JWPlayer config', () => {
    const html = '<html><body><script>jwplayer().setup({ file: "https://cdn.example.com/jw.m3u8?token=x" });</script></body></html>';
    const urls = extractM3U8Urls(html, 'https://example.com');
    assert.ok(urls.some(u => u.includes('jw.m3u8')));
  });

  it('deduplicates URLs', () => {
    const html = '<html><body><video src="https://cdn.example.com/v.m3u8"></video><script>src = "https://cdn.example.com/v.m3u8"</script></body></html>';
    const urls = extractM3U8Urls(html, 'https://example.com');
    assert.equal(urls.filter(u => u.includes('v.m3u8')).length, 1);
  });
});
