# mediagrab

CLI tool that scrapes webpages to find hidden M3U8/HLS stream URLs, downloads segments concurrently, handles AES-128 decryption, and merges into MP4 via ffmpeg.

Built for sites where yt-dlp fails due to obfuscated or auth-protected stream URLs.

## Installation

Requires Node.js 18+ and ffmpeg.

```bash
# Install ffmpeg (if not already installed)
brew install ffmpeg        # macOS
sudo apt install ffmpeg    # Ubuntu/Debian

# Install mediagrab globally
npm install -g mediagrab
```

Or run directly from the repo:

```bash
git clone https://github.com/rahulmax/mediagrab.git
cd mediagrab
npm install
node bin/mediagrab.js <url>
```

## Usage

```bash
# Download from a webpage (auto-finds M3U8 streams)
mediagrab https://example.com/video-page

# Download a direct M3U8 URL
mediagrab https://cdn.example.com/stream/master.m3u8

# Pick quality and set output filename
mediagrab https://example.com/video -q 720p -o video.mp4

# Just list found M3U8 URLs without downloading
mediagrab https://example.com/video --list

# Pass cookies and referer for auth-protected streams
mediagrab https://example.com/video --cookie "session=abc123" --referer https://example.com

# Download segments only, skip merging
mediagrab https://example.com/video --no-merge

# Faster downloads with more concurrent connections
mediagrab https://example.com/video -c 20
```

## Options

| Option | Description | Default |
|---|---|---|
| `-o, --output <file>` | Output filename | Auto from URL |
| `-q, --quality <level>` | `best`, `worst`, or resolution like `720p` | `best` |
| `-c, --concurrency <n>` | Parallel segment downloads | `5` |
| `-H, --header <header>` | Custom HTTP header (repeatable) | |
| `--referer <url>` | Set Referer header | |
| `--cookie <string>` | Set Cookie header | |
| `--user-agent <string>` | Set User-Agent | Chrome UA |
| `--no-merge` | Download segments without merging | |
| `--list` | List found M3U8 URLs, don't download | |
| `-v, --verbose` | Verbose output | |

## How it works

1. **Scrape** — Fetches the webpage, parses HTML with cheerio, follows iframes (up to 3 levels deep), and regex-scans scripts for `.m3u8` URLs including JWPlayer and Video.js configs
2. **Parse** — Fetches the M3U8 manifest, handles master playlists (quality selection) and media playlists (segment list, encryption keys)
3. **Download** — Downloads segments concurrently with retries and AES-128 decryption when needed
4. **Merge** — Concatenates segments into MP4 using ffmpeg

## License

MIT
