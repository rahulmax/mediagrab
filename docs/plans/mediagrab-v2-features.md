# mediagrab v2 — Feature Plan

> Features borrowed from cococut extension. Ordered by impact.

**Node binary:** `/usr/local/bin/node` (v22.6.0)
**Working dir:** `/Users/rahul/Videos/cococut-extension/mediagrab`

---

## HIGH VALUE

### 1. DASH/MPD Support

**What:** Parse DASH MPD manifests and download fragmented MP4 streams, mirroring what cococut's `mpd.js` does.

**Why:** Doubles site coverage. Many streaming sites use DASH instead of HLS (YouTube, Netflix CDNs, etc). Currently mediagrab only handles M3U8.

**Implementation:**

- New file: `src/mpd.js`
  - Parse MPD XML using Node's built-in XML parser or a lightweight dep (fast-xml-parser)
  - Extract `<Period>` → `<AdaptationSet>` → `<Representation>` hierarchy
  - Support SegmentTemplate (number-based and time-based), SegmentList, and SegmentBase
  - Resolve BaseURL for relative segment paths
  - Quality selection: pick Representation by bandwidth/resolution (reuse same `--quality` flag)
  - Return normalized segment list (same shape as M3U8 parser output: `{ url, duration, key }`)

- New file: `test/mpd.test.js`
  - Parse a SegmentTemplate MPD with `$Number$` substitution
  - Parse a SegmentTemplate MPD with `$Time$` substitution
  - Parse a SegmentList MPD
  - Quality selection (best/worst/resolution)
  - BaseURL resolution

- Modify: `src/scraper.js`
  - Add `.mpd` URL detection alongside `.m3u8`
  - Regex patterns for MPD URLs in scripts and data attributes
  - Return `{ type: 'mpd' | 'm3u8', url }` instead of just URL strings

- Modify: `src/index.js`
  - Route to M3U8 parser or MPD parser based on detected type
  - Both parsers output same segment format → downloader unchanged

- Modify: `bin/mediagrab.js`
  - Update description to mention DASH/MPD

**New dependency:** `fast-xml-parser` (lightweight, no native deps)

**Tests to write first:**
```
test/mpd.test.js:
  - parseMPD() with SegmentTemplate $Number$ → correct segment URLs
  - parseMPD() with SegmentTemplate $Time$ → correct segment URLs
  - parseMPD() with SegmentList → correct segment URLs
  - selectRepresentation('best') → highest bandwidth
  - selectRepresentation('720p') → matching resolution
  - BaseURL resolution (absolute, relative, nested)
  - initSegment extraction from Representation@initialization
```

---

### 2. Vimeo Playlist.json Parser

**What:** Parse Vimeo's proprietary JSON playlist format and reconstruct downloadable segment URLs.

**Why:** Vimeo uses a custom JSON format instead of standard M3U8. Cococut's deepsearch.js has specific handling for this. Common request since Vimeo embeds are everywhere.

**Implementation:**

- New file: `src/vimeo.js`
  - Detect Vimeo player pages (regex for `player.vimeo.com/video/`)
  - Fetch Vimeo's config JSON endpoint (`/video/{id}/config`)
  - Parse the `request.files.hls.cdns` or `request.files.progressive` from config
  - Extract CDN URLs and quality variants
  - For HLS: extract the master playlist URL and hand off to existing M3U8 parser
  - For progressive: return direct MP4 download URLs with quality metadata

- Modify: `src/scraper.js`
  - Detect Vimeo embed iframes and player URLs
  - Call vimeo-specific extraction before generic scraping

- New file: `test/vimeo.test.js`
  - Parse sample Vimeo config JSON → extract HLS URL
  - Parse sample Vimeo config JSON → extract progressive URLs
  - Quality selection from progressive files

---

### 3. Structured Player Config Parsing

**What:** Parse JWPlayer and Video.js configurations structurally, not just regex.

**Why:** Current scraper does dumb regex for `.m3u8` in quotes. Misses cases where the URL is assembled from parts, or where the config uses different property names. Cococut does `jwplayer().getConfig()` inspection and `videojs.getAllPlayers()`.

**Implementation:**

- Modify: `src/scraper.js` — add new extraction functions:

  `extractJWPlayerUrls(html, pageUrl)`:
  - Regex for `jwplayer\(.*?\)\.setup\(\s*(\{[\s\S]*?\})\s*\)`
  - Also match `.load({...})` calls
  - Parse the JSON-like config object (use relaxed JSON parsing)
  - Extract `file`, `sources[].file`, `playlist[].sources[].file`
  - Handle both HLS and MP4 sources

  `extractVideoJSUrls(html, pageUrl)`:
  - Find `<video-js>` and `<video class="video-js">` elements
  - Extract `data-setup` attribute JSON
  - Parse `sources` array from config
  - Also scan for `videojs(...)` init calls in scripts

  `extractGenericPlayerUrls(html, pageUrl)`:
  - Flowplayer: `flowplayer(...)` config → `clip.sources`
  - Plyr: `new Plyr(...)` config
  - MediaElement.js: `new MediaElement(...)` config
  - Clappr: `new Clappr.Player({source: ...})`

- New file: `test/player-configs.test.js`
  - JWPlayer setup() with file property
  - JWPlayer setup() with sources array
  - JWPlayer load() call
  - Video.js data-setup attribute
  - Video.js programmatic init
  - Flowplayer config extraction

---

### 4. Robust fMP4 Merging

**What:** Handle fMP4 (fragmented MP4) streams properly — binary concat init + segments without ffmpeg.

**Why:** Already partially implemented but cococut's advance-dlm.js handles edge cases better. Some streams produce broken output when piped through ffmpeg concat demuxer but work fine with direct binary concatenation.

**Implementation:**

- Modify: `src/downloader.js`
  - Detect fMP4 vs MPEG-TS based on init segment presence (EXT-X-MAP or MPD initialization)
  - fMP4 path: binary concatenate init segment + media segments (no ffmpeg needed)
  - MPEG-TS path: keep existing ffmpeg concat demuxer
  - Already partially done — verify edge cases:
    - Multiple init segments (period changes in DASH)
    - Missing init segment recovery
    - Byte range requests for init segments

**No new deps. Already mostly implemented — this is a hardening task.**

---

## MEDIUM VALUE

### 5. Deep Scraping with Playwright (`--deep` flag)

**What:** Use a headless browser to execute page JS and intercept network requests for manifest URLs.

**Why:** Many sites load streams dynamically via JS — the HTML source contains no M3U8/MPD URLs. Cococut intercepts `XMLHttpRequest.open`, `fetch()`, and `JSON.parse()` at runtime. A CLI equivalent needs a real browser.

**Implementation:**

- New file: `src/deepsearch.js`
  - Launch Playwright (chromium) in headless mode
  - Navigate to URL, wait for network idle
  - Intercept all network requests, filter for:
    - `.m3u8` and `.mpd` URLs
    - MIME types: `application/vnd.apple.mpegurl`, `application/dash+xml`
    - Response bodies containing `#EXTM3U` or `<MPD`
  - Inject JS to hook `XMLHttpRequest.prototype.open` and `window.fetch` (like cococut's deepsearch.js)
  - Capture URLs from hooked calls
  - Kill browser after timeout (default 15s) or when streams found
  - Return found URLs to main pipeline

- Modify: `bin/mediagrab.js`
  - Add `--deep` flag: `'use Playwright for JS-heavy sites'`
  - Add `--deep-timeout <seconds>`: `'time to wait for streams in deep mode (default 15)'`

- Modify: `src/index.js`
  - When `--deep` flag set, use deepsearch instead of static scraper
  - Fall through to static scraper if Playwright not installed (graceful degradation)

- Modify: `package.json`
  - Add `playwright` as optional peer dependency (not bundled — user installs separately)

- New file: `test/deepsearch.test.js`
  - Test request interception captures m3u8 URLs
  - Test XHR hook injection captures dynamic URLs
  - Test timeout behavior

**New dependency:** `playwright` (optional/peer dep — `npm install playwright` separately)

---

### 6. Resumable Downloads

**What:** Save download state so interrupted downloads can be resumed.

**Why:** Large videos (1000+ segments) take time. If the process is killed, you start over. Cococut's MyGet supports range requests and progress tracking.

**Implementation:**

- Modify: `src/downloader.js`
  - On start, create a `.mediagrab-state.json` in output directory:
    ```json
    {
      "m3u8Url": "...",
      "outputFile": "video.mp4",
      "totalSegments": 500,
      "completedSegments": [0, 1, 2, ...],
      "tempDir": "/tmp/mediagrab-xxx"
    }
    ```
  - Before downloading each segment, check if file already exists in temp dir (skip if size > 0)
  - On completion, delete state file
  - On startup, check for existing state file → offer to resume

- Modify: `bin/mediagrab.js`
  - Add `--resume` flag to explicitly resume a previous download
  - Without `--resume`, prompt user if state file found

- New file: `test/resume.test.js`
  - State file creation and reading
  - Skip already-downloaded segments
  - State cleanup on completion

**No new deps.**

---

### 7. Encryption Key Detection

**What:** Detect AES-128 keys from non-standard sources beyond `#EXT-X-KEY` manifest entries.

**Why:** Some sites serve encryption keys via JS, embed them in page source as base64, or use custom API endpoints. Cococut's deepsearch.js does binary pattern matching for 16-byte values and base64 key detection.

**Implementation:**

- Modify: `src/scraper.js` — add `extractEncryptionKeys(html, pageUrl)`:
  - Regex for base64 strings that decode to exactly 16 bytes (AES-128 key size)
  - Look for common key variable names: `key`, `decryptionKey`, `aesKey`, `encryption_key`
  - Scan for hex strings of exactly 32 chars (16 bytes as hex)
  - Check `<meta>` tags and data attributes for key material

- Modify: `src/index.js`
  - If M3U8 segments have encryption but key URI fails, try scraped keys as fallback
  - Pass discovered keys to downloader

- New file: `test/key-detection.test.js`
  - Detect base64-encoded 16-byte key in script tag
  - Detect hex-encoded key in JS variable assignment
  - Ignore false positives (random 16-byte strings that aren't keys)

**No new deps.**

---

## Implementation Order

Execute in this order for maximum incremental value:

1. **DASH/MPD Support** — biggest coverage gain, independent module
2. **Player Config Parsing** — improves scraper, no new deps
3. **fMP4 Merging hardening** — quick win, mostly testing
4. **Vimeo Parser** — standalone module, common use case
5. **Resumable Downloads** — quality of life, no deps
6. **Encryption Key Detection** — niche but valuable for protected streams
7. **Deep Scraping (Playwright)** — biggest effort, optional dep, save for last

Each task is independent enough to be a single PR.

---

## CLI After All Features

```
mediagrab <url> [options]

Options:
  -o, --output <file>       Output filename (default: auto from URL)
  -q, --quality <level>     best, worst, or resolution like 720p
  -c, --concurrency <n>     Parallel segment downloads (default: 5)
  -H, --header <header>     Custom header (repeatable)
  --referer <url>           Set Referer header
  --cookie <string>         Set Cookie header
  --user-agent <string>     Set User-Agent (default: Chrome UA)
  --no-merge                Download segments without merging
  --list                    Just list found stream URLs, don't download
  --deep                    Use Playwright for JS-heavy sites
  --deep-timeout <seconds>  Deep mode timeout (default: 15)
  --resume                  Resume interrupted download
  -v, --verbose             Verbose output
```
