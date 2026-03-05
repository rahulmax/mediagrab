import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U8, resolveUrl } from '../src/m3u8.js';

describe('resolveUrl', () => {
  it('resolves relative path against base', () => {
    assert.equal(
      resolveUrl('seg001.ts', 'https://cdn.example.com/video/master.m3u8'),
      'https://cdn.example.com/video/seg001.ts'
    );
  });

  it('resolves root-relative path', () => {
    assert.equal(
      resolveUrl('/video/seg001.ts', 'https://cdn.example.com/other/master.m3u8'),
      'https://cdn.example.com/video/seg001.ts'
    );
  });

  it('returns absolute URLs unchanged', () => {
    assert.equal(
      resolveUrl('https://other.com/seg.ts', 'https://cdn.example.com/master.m3u8'),
      'https://other.com/seg.ts'
    );
  });
});

describe('parseM3U8', () => {
  it('parses a media playlist into segments', () => {
    const manifest = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:9.009,
seg001.ts
#EXTINF:9.009,
seg002.ts
#EXTINF:3.003,
seg003.ts
#EXT-X-ENDLIST`;

    const result = parseM3U8(manifest, 'https://cdn.example.com/video/playlist.m3u8');
    assert.equal(result.type, 'media');
    assert.equal(result.segments.length, 3);
    assert.equal(result.segments[0].url, 'https://cdn.example.com/video/seg001.ts');
    assert.equal(result.segments[0].duration, 9.009);
    assert.equal(result.segments[2].url, 'https://cdn.example.com/video/seg003.ts');
  });

  it('parses a master playlist into variants', () => {
    const manifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=720x480
low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1280x720
mid.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=7680000,RESOLUTION=1920x1080
high.m3u8`;

    const result = parseM3U8(manifest, 'https://cdn.example.com/master.m3u8');
    assert.equal(result.type, 'master');
    assert.equal(result.variants.length, 3);
    assert.equal(result.variants[0].bandwidth, 1280000);
    assert.equal(result.variants[0].resolution, '720x480');
    assert.equal(result.variants[0].url, 'https://cdn.example.com/low.m3u8');
    assert.equal(result.variants[2].bandwidth, 7680000);
  });

  it('parses encryption key', () => {
    const manifest = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/key.bin",IV=0x00000000000000000000000000000001
#EXTINF:10,
seg001.ts
#EXT-X-ENDLIST`;

    const result = parseM3U8(manifest, 'https://cdn.example.com/playlist.m3u8');
    assert.equal(result.type, 'media');
    assert.equal(result.segments[0].key.method, 'AES-128');
    assert.equal(result.segments[0].key.uri, 'https://keys.example.com/key.bin');
    assert.equal(result.segments[0].key.iv, '0x00000000000000000000000000000001');
  });

  it('parses EXT-X-MAP for fMP4 init segment', () => {
    const manifest = `#EXTM3U
#EXT-X-TARGETDURATION:4
#EXT-X-MAP:URI="init.mp4"
#EXTINF:4.000,
seg000.m4s
#EXTINF:4.000,
seg001.m4s
#EXT-X-ENDLIST`;

    const result = parseM3U8(manifest, 'https://cdn.example.com/video/playlist.m3u8');
    assert.equal(result.type, 'media');
    assert.equal(result.segments.length, 2);
    assert.ok(result.initSegment);
    assert.equal(result.initSegment.url, 'https://cdn.example.com/video/init.mp4');
  });

  it('returns null initSegment for TS playlists', () => {
    const manifest = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:9.009,
seg001.ts
#EXT-X-ENDLIST`;

    const result = parseM3U8(manifest, 'https://cdn.example.com/playlist.m3u8');
    assert.equal(result.initSegment, null);
  });

  it('selects best quality variant', () => {
    const manifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=720x480
low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=7680000,RESOLUTION=1920x1080
high.m3u8`;

    const result = parseM3U8(manifest, 'https://cdn.example.com/master.m3u8');
    const best = result.selectVariant('best');
    assert.equal(best.bandwidth, 7680000);

    const worst = result.selectVariant('worst');
    assert.equal(worst.bandwidth, 1280000);

    const by480 = result.selectVariant('480p');
    assert.equal(by480.resolution, '720x480');
  });
});
