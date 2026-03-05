export function resolveUrl(url, baseUrl) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = new URL(baseUrl);
  if (url.startsWith('/')) {
    return `${base.protocol}//${base.host}${url}`;
  }
  const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
  return basePath + url;
}

export function parseM3U8(text, baseUrl) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const isMaster = lines.some(l => l.startsWith('#EXT-X-STREAM-INF'));
  if (isMaster) return parseMaster(lines, baseUrl);
  return parseMedia(lines, baseUrl);
}

function parseMaster(lines, baseUrl) {
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const attrs = parseAttributes(line.substring('#EXT-X-STREAM-INF:'.length));
    const url = lines[i + 1];
    if (!url || url.startsWith('#')) continue;
    variants.push({
      bandwidth: parseInt(attrs.BANDWIDTH) || 0,
      resolution: attrs.RESOLUTION || null,
      url: resolveUrl(url, baseUrl),
    });
  }

  return {
    type: 'master',
    variants,
    selectVariant(quality) {
      if (quality === 'best') {
        return variants.reduce((a, b) => a.bandwidth > b.bandwidth ? a : b);
      }
      if (quality === 'worst') {
        return variants.reduce((a, b) => a.bandwidth < b.bandwidth ? a : b);
      }
      const height = parseInt(quality);
      if (height) {
        const match = variants.find(v => v.resolution && v.resolution.includes(`x${height}`));
        if (match) return match;
        const matchAlt = variants.find(v => v.resolution && v.resolution.startsWith(`${height}x`));
        if (matchAlt) return matchAlt;
      }
      return variants[0];
    }
  };
}

function parseMedia(lines, baseUrl) {
  const segments = [];
  let currentKey = null;
  let duration = 0;
  let initSegment = null;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-MAP:')) {
      const attrs = parseAttributes(line.substring('#EXT-X-MAP:'.length));
      if (attrs.URI) {
        initSegment = { url: resolveUrl(attrs.URI, baseUrl) };
      }
      continue;
    }
    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributes(line.substring('#EXT-X-KEY:'.length));
      currentKey = {
        method: attrs.METHOD,
        uri: attrs.URI ? resolveUrl(attrs.URI, baseUrl) : null,
        iv: attrs.IV || null,
      };
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      duration = parseFloat(line.substring('#EXTINF:'.length));
      continue;
    }
    if (!line.startsWith('#')) {
      segments.push({
        url: resolveUrl(line, baseUrl),
        duration,
        key: currentKey ? { ...currentKey } : null,
      });
      duration = 0;
    }
  }

  return { type: 'media', segments, initSegment };
}

function parseAttributes(str) {
  const attrs = {};
  const regex = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/g;
  let match;
  while ((match = regex.exec(str))) {
    attrs[match[1]] = match[2] !== undefined ? match[2] : match[3];
  }
  return attrs;
}
