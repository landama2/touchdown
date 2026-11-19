# Touchline Phase 11: interface

Status: in progress. Order-of-work steps 1–4 done 2026-11-19 (tokens, sortable tables, profiles, save slots). Base: main @ d4da319.
No save bump planned: this phase changes screens and storage access, not the shape of the career state. If a view needs a new field, that field goes through a migration in `src/save.js` as in earlier phases.

## Goal

Make Touchline look and feel like its own game and fit for long play: a visual identity of its own, profile screens for players and clubs, a 2D pitch for matches, tables people can sort and filter, several save slots with export and import, and keyboard and screen-reader support.

Engine stays untouched. Everything here lives in `src/ui/` plus small read-only helpers the UI needs. The engine rule from the roadmap holds: no DOM, `Date` or `Math.random` outside `src/ui/`.

## Decisions (accepted 2026-11-19: the proposals below are the plan)

1. **Visual identity.** Proposal: a dark green-and-chalk palette, a single display face from Google Fonts (one stylesheet, allowed by the artifact rules; the game itself may ship it as a local file instead), and the existing club-colour badges kept as they are. Say yes, or name a different direction.
2. **Save slots.** Proposal: three slots plus the current autosave. Slot names are the club and season, read from the save itself.
3. **Pitch view.** Proposal: a schematic SVG pitch (no canvas, no sprites) with player dots placed by the formation, moving between positions as the match feed advances. Simple and readable at phone width.
4. **Scope cut if time runs short.** Order below is the priority. Keyboard support and the pitch view are the first things to drop; save slots and export/import stay.

## 1. Visual identity

- Colours and type become tokens on `:root` (`--pitch`, `--chalk`, `--ink`, `--muted`, `--danger`), with a dark-mode override. Every colour in `index.html` and `src/ui/app.js` inline styles moves to a token.
- One display face for headings and the scoreboard; the body text stays system UI.
- Replace the generic buttons with one button style: primary, plain, and link.
- Badges, kits and `src/ui/art.js` are kept. They already carry the club identity.
- No text from any other product: wording stays Touchline's own.

Files: `index.html` (tokens, font link), `src/ui/app.js` (remove inline colours).
Tests: `tests/art.test.js` unchanged; a smoke check that the tokens exist in the stylesheet.

## 2. Player and club profile screens

Today `profile()` in `src/ui/app.js` is one long panel shown above every tab. Split it into two views reached from any name:

- **Player profile**: attributes with the estimate range for players in the fog (uses `estCells()` and the scouting ranges already in place), contract and wage, injury and suspension, season and career stats, form, shortlist star, and the transfer actions the player's state allows.
- **Club profile**: badge, division, squad by position, finances summary (income and wage bill from `finance.js`), recent results from `s.deals` and the fixture list, honours from the records already kept in Phase 4.

Both are read-only views over existing state. Actions stay on the existing buttons; the profile only links to them.

Files: `src/ui/app.js` (two view functions, one router entry each).
Tests: none new in the engine. A UI smoke test in `tests/` that renders each view for a seeded world and checks the name and key numbers appear.

## 3. 2D pitch match view

- A pure function `pitchLayout(formation, lineup, sides)` in `src/ui/pitch.js` returns `{ id, x, y }` per player from the formation table in `src/tactics.js`. No DOM, so it is testable.
- The live view draws the layout as SVG and moves dots to the position of the player currently in possession (taken from the match event feed that `src/match.js` already emits). Commentary stays as the text feed beside it.
- Substitutions and red cards remove or add dots. A formation change in the live view re-lays the dots (fun surprise #5 keeps working).
- Speed control and the existing in-match changes are unchanged.

Files: `src/ui/pitch.js` (new, the only new module), `src/ui/app.js` (live view). `src/ui/commentary.js` untouched.
Tests: `tests/pitch.test.js`: 11 positions per side, all inside the pitch box, a 4-3-3 and a 5-3-2 differ, a sent-off player is left out.

Ponytail note: no animation library; a CSS transition on `transform` is enough.

## 4. Sortable and filterable tables

- One helper `sortable(rows, cols, key, dir)` in `src/ui/table.js`, used by every table in `app.js` that lists players or clubs: squad, transfers, contracts, scouting, youth, league table.
- Click or Enter on a column header sorts; the state (`key`, `dir`) is per table and lives in the UI module, not in the career.
- The Transfers filters from Phase 8 use the same helper, so there is one filter model.
- Numbers sort numerically; `n` columns keep their right alignment.

Files: `src/ui/table.js` (new), `src/ui/app.js` (use it in the list views).
Tests: `tests/table.test.js`: sort by number vs string, direction flip, a stable sort on ties, filters combine with AND.

## 5. Save slots with export and import

- `src/save.js` keeps `KEY` as the autosave. Slots add `KEY + ':slot:' + n` (n = 1..3). No change to the save format.
- Slot list shows name (club and season), date saved, and size. Load, save here, delete (with a confirm), and rename.
- Export downloads the current save as `touchline-<club>-<season>.json` with a Blob link. Import reads a file with `<input type="file">`, runs it through `deserialize()` (so migrations apply), and refuses anything that fails `valid()` with a plain message.
- Storage failure (quota, private mode) shows a message. The existing `try/catch` around `localStorage` stays.
- Ceiling note from the roadmap: if slots push past about 3 MB total, the storage change in the roadmap's architecture section applies. Not needed yet; measure first.
- Measured 2026-11-19: a save is ~0.95 MB of JSON at the start and ~1.1 MB after a season, so three slots and the autosave reached ~3.9 MB. Stored saves are now gzipped in `src/ui/app.js` (base64 behind a `gz:` mark, ~0.14–0.2 MB each); plain older saves still load, and exports stay plain JSON. The storage change is still not needed.

Files: `src/save.js` (slot key helper, nothing else), `src/ui/app.js` (the panel and buttons).
Tests: `tests/save.test.js`: slot keys are distinct; an exported file re-imports to the same state; a corrupt file is refused and does not overwrite the slot.

## 6. Keyboard and screen-reader support

- Every control is a real `<button>`, `<select>` or `<a>`. The `data-act` click handler already covers clicks; check that Enter and Space work on any element that is not a native control (the sort headers, the pitch dots).
- Visible focus ring on every interactive element.
- Tab order follows reading order; the nav strip is reachable by arrow keys.
- `aria-live="polite"` on the message line and the commentary feed (already on the feed); the scoreboard gets a label.
- Tables get `<caption>` text from their heading. Icons-only buttons (★ ☆, 💼) keep their `aria-label` and `title`.
- Colour is never the only signal: the zone keys in the league table and the injury marks get a text label as well.
- Shortcut keys, if any: the match keys (speed, pause) only, documented in the Match help. No global shortcuts that clash with the browser.

Files: `src/ui/app.js`, `index.html`, token CSS.
Checks: a manual pass with keyboard only and with a screen reader on the desktop build, recorded in the step's notes. Automated: `tests/ui-a11y.test.js` is out of scope (no DOM test dependency; the project has none). Say so in the summary rather than adding a framework.

## Order of work

1. Visual tokens and button style (section 1). Small, touches everything, do first so later screens use the tokens.
2. Sortable tables (section 4), so the list views get it before the profiles link into them.
3. Profile screens (section 2).
4. Save slots and export/import (section 5).
5. Pitch view (section 3).
6. Keyboard and screen-reader pass (section 6), last, across the whole UI.
7. Phase summary to the owner: what changed, what was checked by hand, and any fun surprise touched (update `docs/fun-surprises.md` if a quirk is moved or retired).

Each step ends with `npm test` green and the game playable in the browser.

## Done when

- `npm test` passes, with the new test files above.
- A new career can be started, played through one match in the pitch view, and saved to a slot, exported, and re-imported with the same club and season.
- Every list screen sorts; every profile opens from a name.
- Keyboard-only play works through a full season day loop (play day, read the inbox, make one transfer bid).
- No colour literals remain outside the token block.
- No save-version bump, or a bump with its migration in `src/save.js` and a test.

## Notes and risks

- Phone width: every new table sits in `.wrap` (horizontal scroll inside the box, not the page). The pitch scales to the container width.
- The fog rule still applies: profiles show estimate ranges for players the human club has not scouted, never the true values (Phase 8).
- Fun surprises: none are expected to change. Check #5 (re-slotting) and #1 (the formation edge) still work in the pitch view.
- Phase 12 (balance and soak) does not depend on this phase's screens, so it can run in parallel if the owner wants.
