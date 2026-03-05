import { scrape, isM3U8Url } from './scraper.js';
import { parseM3U8 } from './m3u8.js';
import { download } from './downloader.js';
import { createInterface } from 'node:readline/promises';

export async function run(url, options) {
  // Step 1: Find M3U8 URLs
  if (options.verbose) console.log(`Scanning: ${url}`);

  const { m3u8Urls, source } = await scrape(url, options);

  if (m3u8Urls.length === 0) {
    console.error('No M3U8 URLs found on this page.');
    process.exit(1);
  }

  console.log(`Found ${m3u8Urls.length} M3U8 URL(s)${source === 'direct' ? ' (direct)' : ''}:`);
  m3u8Urls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));

  if (options.list) return;

  // Step 2: Select URL
  let selectedUrl;
  if (m3u8Urls.length === 1) {
    selectedUrl = m3u8Urls[0];
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('\nSelect URL number (default 1): ');
    rl.close();
    const idx = parseInt(answer) || 1;
    selectedUrl = m3u8Urls[idx - 1] || m3u8Urls[0];
  }

  console.log(`\nFetching manifest: ${selectedUrl}`);

  // Step 3: Parse M3U8
  const headers = {
    'User-Agent': options.userAgent,
  };
  if (options.referer) headers['Referer'] = options.referer;
  if (options.cookie) headers['Cookie'] = options.cookie;

  const manifestRes = await fetch(selectedUrl, { headers });
  if (!manifestRes.ok) {
    console.error(`Failed to fetch manifest: HTTP ${manifestRes.status}`);
    process.exit(1);
  }
  const manifestText = await manifestRes.text();
  let parsed = parseM3U8(manifestText, selectedUrl);

  // Handle master playlist — select variant and re-fetch
  if (parsed.type === 'master') {
    const variant = parsed.selectVariant(options.quality || 'best');
    console.log(`Selected quality: ${variant.resolution || 'unknown'} (${Math.round(variant.bandwidth / 1000)}kbps)`);
    console.log(`Fetching variant playlist: ${variant.url}`);

    const variantRes = await fetch(variant.url, { headers });
    if (!variantRes.ok) {
      console.error(`Failed to fetch variant: HTTP ${variantRes.status}`);
      process.exit(1);
    }
    const variantText = await variantRes.text();
    parsed = parseM3U8(variantText, variant.url);
  }

  if (parsed.type !== 'media' || parsed.segments.length === 0) {
    console.error('No segments found in playlist.');
    process.exit(1);
  }

  console.log(`Found ${parsed.segments.length} segments.`);

  // Step 4: Download
  await download(parsed.segments, {
    m3u8Url: selectedUrl,
    output: options.output,
    concurrency: options.concurrency,
    merge: options.merge,
    userAgent: options.userAgent,
    referer: options.referer || url,
    cookie: options.cookie,
    verbose: options.verbose,
    initSegment: parsed.initSegment || null,
  });
}
