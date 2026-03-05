import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateOutputFilename, buildFfmpegArgs } from '../src/downloader.js';

describe('generateOutputFilename', () => {
  it('extracts name from M3U8 URL', () => {
    const name = generateOutputFilename('https://cdn.example.com/video/stream.m3u8');
    assert.equal(name, 'stream.mp4');
  });

  it('uses fallback for unnameable URLs', () => {
    const name = generateOutputFilename('https://cdn.example.com/api/playlist');
    assert.equal(name, 'mediagrab-output.mp4');
  });

  it('respects user-provided output name', () => {
    const name = generateOutputFilename('https://cdn.example.com/stream.m3u8', 'my-video.mp4');
    assert.equal(name, 'my-video.mp4');
  });
});

describe('buildFfmpegArgs', () => {
  it('builds concat args for segment files', () => {
    const args = buildFfmpegArgs(['/tmp/s1.ts', '/tmp/s2.ts'], 'out.mp4');
    assert.ok(args.includes('-i'));
    assert.ok(args.includes('out.mp4'));
    assert.ok(args.includes('-c'));
    assert.ok(args.includes('copy'));
  });
});
