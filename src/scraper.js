import * as cheerio from 'cheerio';
import { resolveUrl } from './m3u8.js';

export function isM3U8Url(url) {
  return /\.m3u8(\?|$)/i.test(url);
}

export function extractM3U8Urls(html, pageUrl) {
  const $ = cheerio.load(html);
  const found = new Set();

  // 1. <video src> and <source src>
  $('video[src], source[src], audio[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src && isM3U8Url(src)) {
      found.add(resolveUrl(src, pageUrl));
    }
  });

  // 2. Regex scan all text content (scripts, inline JS, etc.)
  const fullText = $.html();
  const patterns = [
    /["'](https?:\/\/[^\s"']+\.m3u8[^\s"']*?)["']/gi,
    /["']([^\s"']*\.m3u8[^\s"']*?)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(fullText))) {
      const url = match[1];
      if (url.startsWith('http')) {
        found.add(url);
      } else {
        found.add(resolveUrl(url, pageUrl));
      }
    }
  }

  return [...found];
}

export function extractIframeSrcs(html, pageUrl) {
  const $ = cheerio.load(html);
  const iframes = [];
  $('iframe[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src && src.startsWith('http')) {
      iframes.push(src);
    } else if (src && !src.startsWith('about:') && !src.startsWith('javascript:')) {
      iframes.push(resolveUrl(src, pageUrl));
    }
  });
  return iframes;
}

export async function scrape(url, options = {}) {
  const headers = buildHeaders(options);

  if (isM3U8Url(url)) {
    return { m3u8Urls: [url], source: 'direct' };
  }

  const allUrls = new Set();

  async function scanPage(pageUrl, depth = 0) {
    if (depth > 3) return;
    try {
      const res = await fetch(pageUrl, { headers });
      if (!res.ok) return;
      const html = await res.text();

      for (const u of extractM3U8Urls(html, pageUrl)) {
        allUrls.add(u);
      }

      if (depth < 3) {
        const iframes = extractIframeSrcs(html, pageUrl);
        for (const iframeSrc of iframes) {
          await scanPage(iframeSrc, depth + 1);
        }
      }
    } catch (e) {
      if (options.verbose) console.error(`Failed to fetch ${pageUrl}: ${e.message}`);
    }
  }

  await scanPage(url);
  return { m3u8Urls: [...allUrls], source: 'scraped' };
}

function buildHeaders(options) {
  const headers = {
    'User-Agent': options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };
  if (options.referer) headers['Referer'] = options.referer;
  if (options.cookie) headers['Cookie'] = options.cookie;
  if (options.header) {
    for (const h of Array.isArray(options.header) ? options.header : [options.header]) {
      const idx = h.indexOf(':');
      if (idx > 0) {
        headers[h.substring(0, idx).trim()] = h.substring(idx + 1).trim();
      }
    }
  }
  return headers;
}
