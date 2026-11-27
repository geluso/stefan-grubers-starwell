import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import index from '../index.html'
import { PIECE_COLORS } from './color-map'

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = process.env.STARWELL_CHROME ?? Bun.which('google-chrome') ?? Bun.which('chromium') ??
  (existsSync(macChrome) ? macChrome : null)

const checkPage = String.raw`<!doctype html>
<body>
  <iframe src="/" width="900" height="700"></iframe>
  <script>
    window.addEventListener('load', () => {
      const frame = document.querySelector('iframe').contentWindow;
      const board = frame.document;
      const armies = ${JSON.stringify(PIECE_COLORS)};
      try {
        const palettes = ['alternate', 'original', 'alternate'];
        const results = palettes.map(palette => {
          const button = board.querySelector('[data-palette-for="pieces"] [data-palette="' + palette + '"]');
          button.click();
          const gradient = frame.getComputedStyle(button, '::before').backgroundImage;
          const swatch = [...new Set(gradient.match(/rgb\([^)]*\)/g) ?? [])];
          const headers = [...board.querySelectorAll('.move-player-color')]
            .map(square => frame.getComputedStyle(square).backgroundColor);
          const pieces = armies.map(army => frame.getComputedStyle(
            board.querySelector('.hex-piece[data-army="' + army + '"]')).fill);
          if (swatch.length !== 3 || String(swatch) !== String(headers) || String(swatch) !== String(pieces)) {
            throw new Error(palette + ' palette differs across the swatch, move headers, and board');
          }
          return String(swatch);
        });
        if (results[0] === results[1]) throw new Error('Switching palettes did not change the colors');
        document.body.dataset.paletteCheck = 'passed';
      } catch (error) {
        document.body.dataset.paletteCheck = error.message;
      }
    });
  </script>
</body>`

test.skipIf(!chrome)('piece swatches, move headers, and board colors match in player order', async () => {
  if (!chrome) return
  const profile = await mkdtemp(join(tmpdir(), 'starwell-palette-'))
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/': index,
      '/check': new Response(checkPage, { headers: { 'Content-Type': 'text/html' } }),
    },
  })
  try {
    const browser = Bun.spawn([
      chrome, '--headless', '--dump-dom', '--no-first-run', '--disable-background-networking',
      `--user-data-dir=${profile}`, new URL('/check', server.url).href,
    ], { stdout: 'pipe', stderr: 'ignore' })
    const timeout = setTimeout(() => browser.kill(), 10_000)
    try {
      const [output, exitCode] = await Promise.all([new Response(browser.stdout).text(), browser.exited])
      expect(exitCode).toBe(0)
      expect(output).toContain('data-palette-check="passed"')
    } finally {
      clearTimeout(timeout)
    }
  } finally {
    server.stop(true)
    await rm(profile, { recursive: true, force: true })
  }
}, 15_000)
