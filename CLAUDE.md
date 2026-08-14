# Working notes — dom6inspector fork

Notes for whoever (or whatever) picks this up next. This is a fork of
[larzm42/dom6inspector](https://github.com/larzm42/dom6inspector) — a static,
client-side reference for Illwinter's *Dominions 6* — published from
`cactusowl/acashicrecord` on GitHub Pages.

The fork's purpose is **mobile usability**. The original is a desktop
SlickGrid app: dense tables, hover-driven detail panes, draggable popups. None
of that works on a touchscreen. The main addition so far is a **Nation view**
(`scripts/DMI/MNationView.js`) that answers "show me everything nation X can
field" as a scrollable list of game-style unit cards.

---

## 1. Running it

There is no build step. It is static files.

```bash
cd dom6inspector
python3 -m http.server 4000     # then http://localhost:4000/
```

`file://` **cannot** work: the app pulls ~40 `gamedata/*.csv` files by XHR at
startup and browsers give `file://` pages a null origin, so the data never
arrives and you get an empty shell.

`python3 -m http.server` binds `0.0.0.0`, so a phone on the same network can
reach it at `http://<host-ip>:4000/` if the firewall allows the port.

### Cache-busting gotcha

`index.html` sets `var versionCode='?v=30'` and ~26 script/style tags carry
`?v=30`. **Change the contents of a JS/CSS file without bumping that number and
returning visitors get the cached old copy.** Bump it on every deploy.

---

## 2. Architecture

Everything hangs off one global `DMI` namespace; each file is an IIFE taking
`(DMI, $)`. `index.html` hard-codes the load order of the script tags — **that
ordering is the dependency graph**. No modules, no bundler.

The pipeline is linear, driven by a string state machine in
`scripts/loaddata.js` (`DMI.continueLoading`):

```
select mods → download ~40 TSVs (+ any .dm mod files)
  → parseTextToTable  → modctx.<x>data + modctx.<x>lookup
  → M*.prepareData_PreMod()    normalise the raw dumps
  → modctx.parseMod()          apply mod commands, in order
  → M*.prepareData_PostMod()   derive stats, cross-link, backlink
  → DMI.initGrids()            main.js builds the pages
```

Per-domain modules — `MUnit`, `MSpell`, `MItem`, `MSite`, `MWpn`, `MArmor`,
`MNation`, `MMerc`, `MEvent`, `MAffliction` — each provide
`prepareData_Pre/PostMod`, a `CGrid` subclass (grid config), and a
`renderOverlay` that builds a detail pane by string-concatenating HTML.

`scripts/parsemod.js` (~3000 lines) is the real asset: a dispatch table of
every Dominions mod command, per context, with argument coercers and per-line
error recovery. Treat it as load-bearing.

### The page registry

`main.js` used to have eight near-identical page handlers. It now has a table:

```js
DMI.pages = [
  { name:'nation', module:'MNationView', ctor:'View' },
  { name:'item',   module:'MItem' },   // ctor defaults to 'CGrid'
  ...
];
DMI.showPage(name)   // hides the others, lazily constructs, shows
```

A page object only has to implement `show / hide / showIds /
detachShowingDetails`. That is how the card-based Nation view sits beside the
SlickGrid pages without either knowing about the other.

**Trap:** the shared header (`#primary-details` — page tabs, permalink, mod
status) is *physically moved into whichever page is active* by `CGrid.show()`.
A new page must do the same or the tab bar vanishes and the user is stranded.
`MNationView` parks it in `.nv-shared` and hides `#primary-details div.panel`
(the grid filter panels, which belong to the grid pages).

---

## 3. The unit data model — read this before touching the Nation view

### Units are cloned per origin

When a nation can obtain the same unit two ways, the data layer **duplicates
the unit object with a fractional id**: `1085`, `1085.01`, `1085.02`. Each
clone carries a different `typechar` saying *how* it is obtained. This is why
`Math.round(unit.id)` / `Math.floor(unit.id)` appear all over the codebase.

- `u.nations[nationId]` — set on every unit a nation can field. This single
  test is what the Nation view (and the Unit tab's nation filter) uses. It
  covers recruits **and** national summons.
- `u.typechar` — ~30 strings: `unit`, `commander`, `unit (cap only)`,
  `cmdr (forest)`, `unit (Summon)`, `hero (unique)`, `Pretender`,
  `Unit (Magic site)`, … See the `iterations` table in `MNation.js` for the
  authoritative list.
- `u.sorttype` — the data layer's own classification, e.g. `aba.cmdr`,
  `acc.cmdr-mage`. **More reliable than re-parsing `typechar`** for deciding
  commander vs mage vs unit.

Several genuinely different units share a name (Ulm fields five "Infantry of
Ulm", one per weapon; Pangaea two "Satyr"). Duplicate-looking cards are usually
*not* a bug — check the weapon loadout and the base id before assuming.

### Nation tables are static

`attributes_by_nation`, `*_types_by_nation`, `realms`, `attributes_by_spell`
are read-only gamedata; no mod command writes to them. That is what makes the
indexes in `MNation.js` / `MSpell.js` safe.

### Sentinels and broken values

| value | meaning |
|---|---|
| `gcost` > 9000 | autocalculated cost, not a price. Shown as "basecost"; suppressed on cards. |
| `rpcost` ≥ 9999 | not normally recruitable (summons, heroes) |
| `rpcost` anything | **Recruitment points are broken.** A Dom6 mechanic (training capacity — an unarmoured expert swordsman is cheap in resources, dear in rec points; an armoured slave the reverse). The game autocalculates it and the inspector has no working implementation, so stored figures are wrong (6996 on a Moose Rider). **Deliberately omitted from cards.** Restore only when it can be computed. |
| `nratt` < 0 | a **reload interval**, not a multiplier. Only on crossbows/arbalests. `×-2` is nonsense; render "reload 2". |
| `eyes` = 1 | a one-eyed unit. Beware: any numeric property whose value is legitimately `1` renders bare if you treat `1` as boolean-true. |

### 64-bit bitfields

`modifiers_mask` and friends exceed 2⁵³ and arrive as **strings**. JavaScript's
`&` truncates to 32 bits *after* a lossy conversion to double. 83 rows in the
shipped gamedata are corrupted in bits 0–8 this way.

- Use `Utils.maskTest(mask, bits)` (exact, BigInt) or the Closure `Long`
  implementation in `scripts/DMI/bitfields.js`.
- A hand-rolled `MSpell.BitwiseAndLarge` used to exist. It is gone. Don't
  reinvent it.

### Random magic

`u.randompaths` is `[{ paths:'FAWE', levels:'1', chance:'100' }, …]` —
`levels` picks that many times, `chance` is the probability of the draw
happening at all.

The card renders each distinct path-set once as `(N% PATHS)` where
**N = Σ(levels × chance)** over its draws, omitting N when exactly 100:

- `{FES, levels 3, chance 100}` → `(300% FES)` — one draw, not three
- `{FAWE,1,100}` + `{FAWE,1,50}` → `(150% FAWE)`

150% is not mechanically identical to "100% then 50%", but it is how players
write it. Path letters render as a **two-row grid** (`ceil(n/2)` columns), which
fits because the icons are half the line height.

---

## 4. The Nation view

`scripts/DMI/MNationView.js` + `scripts/nationview.css`. Mobile-first: base
rules target a phone, and the **card's own width** (a CSS container query)
drives its internals — not the viewport, because a card in a 3-column desktop
grid is no wider than one on a phone.

### Sections (`GROUPS`)

`Recruitable`, `Magic site`, `Heroes`, `Summons`, `Pretenders` (off by
default — it is 60–70% of the list and a different mode of play), `Other`.

### Recruitment descriptors

Where a nation raises a unit is **not** a section — it is a descriptor in the
title line: `forts`, `capital`, a terrain (`forest`, `underwater`, …),
`foreign`. Clones are **merged back into one card** keyed on
`Math.floor(id) + '|' + group`, and every descriptor that applies is listed:
`forts · forest`.

Merging is per-section, so a unit both recruitable *and* summoned still gets an
entry in each — those are genuinely different things.

A second chip row filters by descriptor. **Semantics that matter:** a recruit
is hidden only when *every* place it can be raised is switched off. Turning off
`forest` must not hide a troop you can also build in forts.

### Unit class colours (`classOf`)

Replaces the old CMDR/MAGE badges. Title bar takes the saturated tone, the stat
panel a dark desaturated one of the same hue; both come from `--title-bg` /
`--panel-bg` so the mount tabs stay in step automatically.

| class | colour | test |
|---|---|---|
| `unit` | grey | not a commander |
| `cmdr` | light blue | commander, no magic at all |
| `holy` | yellow | commander, holy paths only |
| `mage` | magenta | commander, any other path |

Paths are read from the unit's own path properties (`F`,`A`,…,`H`), **not** by
parsing `mpath` — `mpath` also carries research (`R10`) and the random summary
(`U3`). Philosopher has `mpath = "R10"` and no magic: correctly blue. Random
draws count toward `mage`.

This is a **different axis** from the coloured stripe down the card's left
edge, which encodes the *section* (where you get it).

### Mounts and co-riders

A rider stores `mountmnr` (mount id), `coridermnr` (the other rider, when two
share a beast), `nofriders` / `nofmounts` (counts). `mount.riders[]` is the
backlink.

The card carries one **face** per body — rider, co-riders, mount — each with
its own full stat panel and tables. A **tab strip** in the title switches
between them at any width; on touch the card can also be swiped sideways
(horizontal, >45px, and more horizontal than vertical, so list scrolling is
unaffected; the swipe suppresses the tap that would open the detail sheet).

Canonical example: **LA Vaettiheim Moose Rider** (#3415) — mount Moose (#3551),
co-rider Vaetti Archer (#4012).

The card takes its colour from the **rider** and keeps it across tabs.

### Weapon modifiers

The modifier mask decodes to up to a dozen long phrases; burying the two that
matter is the failure mode. They are split four ways:

- **damage types → glyphs** beside the damage number (never in the tag list)
- **beside the weapon name:** `2H`, `+Str/2`, `+Str/3`
- **beside the damage value:** `AP`, `AN`
- **folded / dropped:** `Made of Iron` and `Intrinsic Weapon` are dropped;
  `Damage Bonus on 1st Attack` → `lance`; all four of
  *Intrinsic Weapon + Damage Bonus on 1st Attack + Higher charge bonus cap +
  Cannot be used for repelling* → **`heavy-lance`**; `lance` supersedes
  `no-repel`
- **everything else** shortened to fit one line: `MRN`, `MRNH`, `MR/half`,
  `no Str`, `no shield`, `UW ok`, `no vs mindless`, …

The heavy-lance rule requires **all four** tags. Every weapon carrying "Higher
charge bonus cap" has all four (Lance ×2, Fay Lance), but Light Lance #596 and
Phantasmal Lance #769 have three of four and correctly stay as `lance`.

Two distinct modifiers are easy to confuse: **"Cannot be used for repelling"**
(→ `no-repel`, the weapon can't repel) and **"Cannot be repelled"**
(→ `unrepel`, after the `#unrepel` mod command). `unrepel` is a placeholder
name pending something better.

### Stat block

Laid out after the game's own unit card — three columns, in the game's order.
**Fatigue and XP are deliberately absent**: they describe an individual unit in
a game, not a unit type.

Values go through `MUnit.display` — the display tables exposed from `MUnit.js`
(`aliases`, `formats`, `main/main2/main3`, `cmdr`, `other`, `flags`,
`ignorekeys`). **Use them rather than re-deriving formatting**, so a stat reads
the same on a card as in the detail overlay.

**The `{'0':'0 '}` trick:** the overlay hides a stat whose *formatted* value is
exactly `"0"`. Stats that should show their zero (protection, morale,
leadership) are formatted through a `{'0':'0 '}` table so they come back as
`"0 "` — with a trailing space — and survive the test. Trim the value before
that comparison and every legitimate zero silently disappears.

---

## 5. Ability icons

`images/abilities/` (172 PNGs, ~700 KB) + `scripts/DMI/abilityicons.js`
(key → `[icon stem, proper name]`, 181 entries). Provenance and regeneration
recipe are in `images/abilities/README-abilities.txt`.

Scraped from <https://illwiki.com/dom5/unit-abilities>; filenames match the
wiki so any icon can be traced back. Coverage is ~82% of ability slots by
occurrence; anything unmatched renders as a text chip, which is fine.

**The game has no hover on a touchscreen**, so an ability's number is painted
into the corner of its icon, with the name kept as `title` + `aria-label`.

Damage types reuse the wiki's `resist_*` files — they are pictures of the
damage *type* (a spear, a sword, a mace, a flame), not shields, so they read
correctly. `acid` comes from the wiki's `unknown/0140.png`.

---

## 6. Layout traps that cost real time

Each of these produced a confident wrong diagnosis at least once.

**Grid item + `overflow:hidden` = automatic minimum size 0.** A card that is a
grid item and hides its overflow will be *squashed by its row* and clip its own
content instead of growing. Symptom: cards clipped to ~45px. Fix: no
`overflow:hidden` on `.nv-card` (rounded corners live on the first/last strips
instead) plus `align-self:start`.

**`<button>` does not reliably grow to fit flex/grid content in Blink.** The
cards are `<div role="button" tabindex="0">` with an explicit keydown handler
for Enter/Space. Don't "fix" that back to a `<button>`.

**`.pathicon` uses `position:relative` with per-path `top` nudges** (`Path_F` is
`-1px`, `Path_H` `+1px`). Measuring grid rows by counting distinct `top` values
reports phantom rows — cluster positions within ~4px.

**Lazy `<img>` with no reserved size reflows the card as it loads**, which
makes the list jump under your finger *and* corrupts element screenshots taken
mid-load. Ability icons and sprites have explicit width/height.

**`isUserUsingMobile()` in `CGrid.js` misfires** — it treats anything under
768px as mobile (it fires in headless Chromium at 800×600), and its only effect
is to *suppress* the detail popup, so a phone user gets a grid they can't drill
into. The Nation view does not use it. It should be deleted, not tuned.

---

## 7. Verifying changes

There are no tests in the repo. What worked well was driving real headless
Chromium with `puppeteer-core` against `/usr/bin/chromium-browser` from a
scratch directory (`npm i puppeteer-core`), and checking claims rather than
eyeballing screenshots.

Wait for the app to finish booting:

```js
await page.waitForFunction(() => {
  const s = document.querySelector('#page-status');
  return s && !/loading|downloading/i.test(s.textContent);
}, { polling: 50, timeout: 120000 });
```

Useful checks:

- **A/B against a pristine copy.** `git worktree add /tmp/orig HEAD`, serve
  both, render N detail panes from each and diff. This is what proved the
  escaping and perf work changed nothing visible. Normalise the random `c0…`
  container ids and HTML entities before comparing.
- **Sweep all 103 nations** by clicking every `.nv-nation-row` and asserting
  counts, absence of `[object Object]`, no 4xx on `images/abilities/`, and
  `pageerror` count zero.
- **Card overflow**: for every card, assert no descendant's rect escapes it —
  but **skip `offsetParent === null`** (hidden mount faces return zero rects
  and read as false positives; the giveaway is *negative* overflow numbers).
- **Force lazy images** (`img.loading='eager'`) and wait for `.complete` before
  measuring or screenshotting anything.

Known-benign noise: ~146 console errors on a full run, almost all 404s for
speculative optional spell descriptions (`portentX.txt`, `cureX.txt`,
`detailsX.txt`). The app asks for four description files per spell and most
don't exist.

Baselines: load ~420ms, 3.61MB over 209 files, ~3355 cards across all nations.

---

## 8. Performance work already done

Data prep went from ~900ms to ~186ms (total ready 1322ms → ~420ms) by replacing
"rescan a flat table from the top for every row of another table" with
build-an-index-once:

| phase | before | after |
|---|---|---|
| `MNation` post | 498ms | 35ms |
| `MSite` post | 161ms | 24ms |
| `MSpell` post | 147ms | 42ms |

`?profile=1` logs each data-prep phase — use it before optimising anything, the
hot spots were not where they looked.

`events.csv` (700KB) is now only downloaded with `?loadEvents=1`; the old guard
was a no-op (`Array.concat` returns a new array).

---

## 9. Security posture

Mod files (`.dm`) are **untrusted input** — a permalink can carry `?mod=`, and
mods persist in `localStorage`, so a crafted mod would be persistent script
execution in the page origin. All mod-derived text goes through
`Utils.escapeHtml` / `Utils.renderDescr`; `Utils.error` escapes at the
chokepoint (pass it plain text, not HTML); sprite paths go into data attributes
rather than inline JS.

When testing this, use a mod containing real payloads
(`<script>`, `<img onerror=…>`) in `#modname`, `#name` and `#descr` — that is
how the `#modname` hole was found, after the obvious ones were already fixed.

---

## 10. Deployment (GitHub Pages)

Verified working from a subdirectory (`/dom6inspector/`), which is how a
project page is served. No absolute paths, `.nojekyll` present, no
underscore-prefixed files, no external subresources. 73MB published, well
under the 1GB limit.

- **Bump `versionCode`** (see §1).
- **The "load mods" server list will always be empty on Pages** — it scrapes an
  Apache-style directory autoindex out of `mods/`, which Pages doesn't
  generate. Local `.dm` upload still works. Pre-existing.
- Browser floor is higher than the original's: CSS container queries
  (Chrome 105 / Safari 16 / Firefox 110) and `BigInt`.

---

## 11. Open threads

- `unrepel` wants a better name.
- 16 natural-ranged attacks still wrap their tag line to two rows (seven
  modifiers each).
- Chip filter state resets when switching nations. Sections do too, so it's
  consistent — but sticky filters would help nation-to-nation comparison.
- Mounted cards take the rider's colour on every tab; per-face colouring is
  possible.
- Stat labels have no icons — the wiki's ability page doesn't carry them, and
  the game's own stat icons weren't located.
- The legacy SlickGrid pages are still desktop-only. `isUserUsingMobile`
  should go; the grids need their own responsive pass.
- jQuery is **1.7.0** (loaded from `slickgrid/lib/`), with an unused 1.12.0
  copy in `scripts/jQuery-1.12.0/`. Upgrading requires upgrading jQuery UI too
  — jQuery UI 1.8 depends on `$.attrFn`, removed in jQuery 1.9 — so it would
  break every popup drag and animation. Do it together or not at all.
