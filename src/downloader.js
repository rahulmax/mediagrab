import { mkdirSync, rmSync, writeFileSync, readFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { SingleBar, Presets } from 'cli-progress';

export function generateOutputFilename(m3u8Url, userOutput) {
  if (userOutput) return userOutput;
  try {
    const pathname = new URL(m3u8Url).pathname;
    const base = pathname.split('/').pop();
    if (base && base.includes('.')) {
      return base.replace(/\.m3u8$/i, '.mp4');
    }
  } catch {}
  return 'mediagrab-output.mp4';
}

export function buildFfmpegArgs(segmentFiles, outputFile) {
  return [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', 'FILELIST_PLACEHOLDER',
    '-c', 'copy',
    outputFile,
  ];
}

export async function download(segments, options = {}) {
  const concurrency = options.concurrency || 5;
  const outputFile = generateOutputFilename(options.m3u8Url, options.output);
  const tempDir = join(tmpdir(), `mediagrab-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });

  const headers = {};
  if (options.userAgent) headers['User-Agent'] = options.userAgent;
  if (options.referer) headers['Referer'] = options.referer;
  if (options.cookie) headers['Cookie'] = options.cookie;

  const keyCache = new Map();

  // Download init segment for fMP4 streams (EXT-X-MAP)
  let initData = null;
  if (options.initSegment && options.initSegment.url) {
    console.log('Downloading initialization segment...');
    const res = await fetch(options.initSegment.url, { headers });
    if (!res.ok) throw new Error(`Failed to download init segment: HTTP ${res.status}`);
    initData = Buffer.from(await res.arrayBuffer());
  }

  const bar = new SingleBar({
    format: ' {bar} {percentage}% | {value}/{total} segments | {speed}',
    hideCursor: true,
  }, Presets.shades_classic);

  bar.start(segments.length, 0, { speed: '' });
  let completed = 0;
  const startTime = Date.now();

  const segmentFiles = [];

  let index = 0;
  const downloadSegment = async () => {
    while (index < segments.length) {
      const i = index++;
      const seg = segments[i];
      const segPath = join(tempDir, `seg${String(i).padStart(6, '0')}.ts`);
      segmentFiles[i] = segPath;

      let retries = 3;
      while (retries > 0) {
        try {
          const res = await fetch(seg.url, { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          let data = Buffer.from(await res.arrayBuffer());

          if (seg.key && seg.key.method === 'AES-128' && seg.key.uri) {
            const key = await getKey(seg.key.uri, keyCache, headers);
            const iv = seg.key.iv
              ? Buffer.from(seg.key.iv.replace(/^0x/, ''), 'hex')
              : Buffer.alloc(16);
            const decipher = createDecipheriv('aes-128-cbc', key, iv);
            data = Buffer.concat([decipher.update(data), decipher.final()]);
          }

          writeFileSync(segPath, data);
          completed++;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = `${(completed / elapsed).toFixed(1)} seg/s`;
          bar.update(completed, { speed });
          break;
        } catch (e) {
          retries--;
          if (retries === 0) {
            bar.stop();
            throw new Error(`Failed to download segment ${i}: ${e.message}`);
          }
          await new Promise(r => setTimeout(r, 1000 * (4 - retries)));
        }
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => downloadSegment());
  await Promise.all(workers);
  bar.stop();

  console.log(`\nDownloaded ${segments.length} segments.`);

  if (options.merge === false) {
    console.log(`Segments saved in: ${tempDir}`);
    return { tempDir, outputFile: null };
  }

  console.log(`Merging into ${outputFile}...`);

  try {
    if (initData) {
      // fMP4 stream: binary concatenate init segment + all media segments
      const out = createWriteStream(outputFile);
      out.write(initData);
      for (const segFile of segmentFiles) {
        out.write(readFileSync(segFile));
      }
      out.end();
      await new Promise((resolve, reject) => {
        out.on('finish', resolve);
        out.on('error', reject);
      });
    } else {
      // MPEG-TS stream: use ffmpeg concat demuxer
      const fileListPath = join(tempDir, 'filelist.txt');
      const fileListContent = segmentFiles.map(f => `file '${f}'`).join('\n');
      writeFileSync(fileListPath, fileListContent);

      execFileSync('ffmpeg', [
        '-y', '-f', 'concat', '-safe', '0',
        '-i', fileListPath,
        '-c', 'copy',
        outputFile,
      ], { stdio: options.verbose ? 'inherit' : 'pipe' });
    }
  } catch (e) {
    console.error(`ffmpeg merge failed: ${e.message}`);
    console.log(`Segments preserved in: ${tempDir}`);
    return { tempDir, outputFile: null };
  }

  rmSync(tempDir, { recursive: true, force: true });
  console.log(`Saved: ${outputFile}`);
  return { tempDir: null, outputFile };
}

async function getKey(uri, cache, headers) {
  if (cache.has(uri)) return cache.get(uri);
  const res = await fetch(uri, { headers });
  if (!res.ok) throw new Error(`Failed to fetch key: HTTP ${res.status}`);
  const key = Buffer.from(await res.arrayBuffer());
  cache.set(uri, key);
  return key;
}
