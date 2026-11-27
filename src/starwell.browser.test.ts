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
        document.body.dataset.starwellCheck = 'passed';
      } catch (error) {
        document.body.dataset.starwellCheck = error.message;
      }
    });
  </script>
</body>`

async function runBrowserCheck(page: string, browserOptions: string[] = []) {
  if (!chrome) return
  const profile = await mkdtemp(join(tmpdir(), 'starwell-palette-'))
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/': index,
      '/check': new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    },
  })
  try {
    const browser = Bun.spawn([
      chrome, '--headless', '--dump-dom', '--no-first-run', '--disable-background-networking',
      ...browserOptions, `--user-data-dir=${profile}`, new URL('/check', server.url).href,
    ], { stdout: 'pipe', stderr: 'ignore' })
    const timeout = setTimeout(() => browser.kill(), 10_000)
    try {
      const [output, exitCode] = await Promise.all([new Response(browser.stdout).text(), browser.exited])
      expect(exitCode).toBe(0)
      expect(output).toContain('data-starwell-check="passed"')
    } finally {
      clearTimeout(timeout)
    }
  } finally {
    server.stop(true)
    await rm(profile, { recursive: true, force: true })
  }
}

test.skipIf(!chrome)('piece swatches, move headers, and board colors match in player order', () =>
  runBrowserCheck(checkPage), 15_000)

const preferencesPage = `<!doctype html>
<body>
  <iframe src="/" width="900" height="700"></iframe>
  <script>
    window.addEventListener('load', () => {
      const iframe = document.querySelector('iframe');
      const frame = iframe.contentWindow;
      const key = 'starwell.preferences';
      const preferred = { pieces: 'original', hexes: 'metallic' };
      const defaults = { pieces: 'alternate', hexes: 'wooden' };
      const readControls = board => ({
        pieces: board.querySelector('[data-palette-for="pieces"] [aria-pressed="true"]').dataset.palette,
        hexes: board.querySelector('[data-palette-for="hexes"] [aria-pressed="true"]').dataset.palette,
      });
      const pieceOn = (board, name) => [...board.querySelectorAll('.hex-coordinates')]
        .find(label => label.textContent === name).parentElement;
      try {
        const board = frame.document;
        const background = frame.getComputedStyle(board.documentElement).backgroundImage;
        if (board.querySelector('[data-palette-for="sky"]') || background === 'none') {
          throw new Error('The background should be visible without a picker');
        }
        board.querySelector('.original-pieces').click();
        board.querySelector('.metallic-hexes').click();
        if (JSON.stringify(JSON.parse(frame.localStorage.getItem(key))) !== JSON.stringify(preferred)) {
          throw new Error('The two choices were not saved');
        }
        for (const name of ['E2', 'H3']) {
          pieceOn(board, name).querySelector('.hex-tile').dispatchEvent(new frame.MouseEvent('click', { bubbles: true }));
        }
        if (!pieceOn(board, 'H3').querySelector('.hex-piece').textContent) throw new Error('The knight did not move');
        frame.localStorage.setItem(key, JSON.stringify({ ...preferred, enforceTurns: false, outlines: false, background: 'space-needles' }));

        iframe.addEventListener('load', () => {
          try {
            const newBoard = frame.document;
            const svg = newBoard.querySelector('.starwell-board');
            if (JSON.stringify(readControls(newBoard)) !== JSON.stringify(preferred) ||
                svg.dataset.hexesPalette !== 'metallic' ||
                newBoard.documentElement.dataset.piecesPalette !== 'original' ||
                frame.getComputedStyle(newBoard.documentElement).backgroundImage !== background ||
                !newBoard.querySelector('.move-history th:first-child[aria-current="true"]')) {
              throw new Error('The new game did not apply the saved preferences');
            }
            const startingKnight = pieceOn(newBoard, 'E2').querySelector('.hex-piece');
            if (newBoard.querySelector('#piece-outlines') || frame.getComputedStyle(startingKnight).stroke !== 'rgb(0, 0, 0)') {
              throw new Error('Default piece outlines should apply without a checkbox');
            }
            if (pieceOn(newBoard, 'H3').querySelector('.hex-piece').textContent) throw new Error('The board did not reset');
            for (const name of ['E7', 'F7']) {
              pieceOn(newBoard, name).querySelector('.hex-tile').dispatchEvent(new frame.MouseEvent('click', { bubbles: true }));
            }
            if (pieceOn(newBoard, 'F7').querySelector('.hex-piece').textContent) throw new Error('A legacy preference disabled turn enforcement');

            iframe.addEventListener('load', () => {
              try {
                if (JSON.stringify(readControls(frame.document)) !== JSON.stringify(defaults)) {
                  throw new Error('Invalid storage did not fall back to the defaults');
                }
                document.body.dataset.starwellCheck = 'passed';
              } catch (error) {
                document.body.dataset.starwellCheck = error.message;
              }
            }, { once: true });
            frame.localStorage.setItem(key, '{broken');
            frame.location.reload();
          } catch (error) {
            document.body.dataset.starwellCheck = error.message;
          }
        }, { once: true });
        board.querySelector('.game-home').click();
      } catch (error) {
        document.body.dataset.starwellCheck = error.message;
      }
    });
  </script>
</body>`

test.skipIf(!chrome)('palette preferences persist while removed settings are ignored', () =>
  runBrowserCheck(preferencesPage, ['--virtual-time-budget=4000']), 15_000)

const historyPage = `<!doctype html>
<body>
  <iframe src="/" width="900" height="700"></iframe>
  <script>
    window.addEventListener('load', () => {
      const frame = document.querySelector('iframe').contentWindow;
      const board = frame.document;
      const tiles = [...board.querySelectorAll('.hex-coordinates')];
      const hex = name => tiles.find(label => label.textContent === name).parentElement;
      const occupant = name => hex(name).querySelector('.hex-piece').textContent;
      const click = name => hex(name).querySelector('.hex-tile').dispatchEvent(new frame.MouseEvent('click', { bubbles: true }));
      const arrow = key => board.dispatchEvent(new frame.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      const position = () => board.querySelector('#history-position').textContent;
      const verify = (condition, message) => { if (!condition) throw new Error(message); };
      const exportedMoves = () => {
        board.querySelector('#export-game-state').click();
        const game = JSON.parse(board.querySelector('#game-state-json').value);
        const moveExport = JSON.parse(board.querySelector('#game-state-moves').value);
        board.querySelector('#game-state-dialog').close();
        verify(game.rules.knightJump === 'long' && moveExport.rules.knightJump === game.rules.knightJump,
          'Board and moves should export the same rules');
        return JSON.stringify(moveExport.moves);
      };

      try {
        verify(!position() && board.querySelector('#history-position').hidden, 'The history label should be hidden before the first turn');
        verify(!board.querySelector('.online-controls button:not([hidden])'), 'The Moves panel should start without an online button');
        verify(exportedMoves() === '[]', 'A new game should have no exported moves');
        for (const name of ['E2', 'H3', 'E7', 'F7', 'K10', 'E10']) click(name);
        verify(position() === 'Turn 3 of 3 · Live', 'Three turns should be recorded');
        verify(exportedMoves() === '[["E2-H3","E7-F7","K10xE10 P2+"]]', 'Exports should group the three players in one row');
        arrow('ArrowLeft');
        verify(position() === 'Reviewing turn 2 of 3' && occupant('K10') === '♜', 'Left should reverse the capture');
        verify(exportedMoves() === '[["E2-H3","E7-F7",null]]', 'Exported moves should stop at the reviewed turn');
        click('H3');
        click('F4');
        verify(occupant('H3') === '♞' && !occupant('F4'), 'Review should be read-only');
        arrow('ArrowUp');
        verify(position() === 'Reviewing turn 0 of 3' && occupant('E2') === '♞', 'Up should restore the starting board');
        arrow('ArrowRight');
        verify(position() === 'Reviewing turn 1 of 3' && occupant('H3') === '♞', 'Right should advance one turn');
        arrow('ArrowDown');
        verify(position() === 'Turn 3 of 3 · Live' && !occupant('K10'), 'Down should return to the live board');

        click('H3');
        click('F4');
        arrow('ArrowLeft');
        arrow('ArrowDown');
        verify(hex('C3').dataset.knightJump === 'second', 'The live optional jump should still be available');
        click('C3');
        verify(position() === 'Turn 4 of 4 · Live' && occupant('C3') === '♞', 'Both jumps should count as one turn');
        verify(exportedMoves().endsWith('["H3-F4-C3",null,null]]'), 'A double jump should export as one move');
        arrow('ArrowLeft');
        verify(occupant('H3') === '♞' && !occupant('F4'), 'A completed power should step back as a whole');
        document.body.dataset.starwellCheck = 'passed';
      } catch (error) {
        document.body.dataset.starwellCheck = error.message;
      }
    });
  </script>
</body>`

test.skipIf(!chrome)('history navigation and export count complete turns and knight powers', () =>
  runBrowserCheck(historyPage), 15_000)
