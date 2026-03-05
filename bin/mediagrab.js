#!/usr/bin/env node
import { program } from 'commander';
import { run } from '../src/index.js';

const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

program
  .name('mediagrab')
  .description('Find and download M3U8/HLS streams from webpages')
  .version('0.1.0')
  .argument('<url>', 'URL to scrape or direct M3U8 URL')
  .option('-o, --output <file>', 'output filename')
  .option('-q, --quality <level>', 'quality: best, worst, or resolution like 720p', 'best')
  .option('-c, --concurrency <n>', 'parallel segment downloads', parseInt, 5)
  .option('-H, --header <header...>', 'custom headers (repeatable)')
  .option('--referer <url>', 'set Referer header')
  .option('--cookie <string>', 'set Cookie header')
  .option('--user-agent <string>', 'set User-Agent', DEFAULT_UA)
  .option('--no-merge', 'download segments without merging')
  .option('--list', 'just list found M3U8 URLs')
  .option('-v, --verbose', 'verbose output')
  .action(run);

program.parse();
