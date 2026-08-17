# Working notes — dom6inspector fork

Notes for whoever (or whatever) picks this up next. This is a fork of
[larzm42/dom6inspector](https://github.com/larzm42/dom6inspector) — a static,
client-side reference for Illwinter's *Dominions 6* — published from
`cactusowl/acashicrecord` on GitHub Pages.

The fork's purpose is **mobile usability**. The original is a desktop
SlickGrid app: dense tables, hover-driven detail panes, draggable popups. None
of that works on a touchscreen. The fork replaces that with **card views**:
scrollable lists of game-style cards. The **Nation view** answers "show me
everything nation X can field"; the **Unit, Item and Spell tabs** answer "what
is there", which is the only way to reach a unit no nation fields.

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

### One-click mods

Two mods ship in `mods/` and have a checkbox each in the shared header:

| file | `#modname` |
|---|---|
| `WH_6_5_dom-clockwork_v6.51.dm` | Worthy_Heroes 6.51 |
| `DomEnhanced-clockwork_v2.16.dm` | Dominions Enhanced v2.16 (Latest) |

Their sprite art ships too, converted — see `mods/README-mods.txt` for the
reasoning and `mods/convert-mod-sprites.py` for the recipe. The short version:
the inspector asks for `mods/<path>` with `.tga` rewritten to `.png`, and the
conversion has to flood-fill the black background in **from the border** rather
than colour-key it, because black is also used inside the art as outline; strip
the magenta baseline marker (which is not one fixed colour); and crop to
content, as the shipped vanilla sprites are.

Ticking a box rewrites the `?mod=` parameters and **reloads**: mods are applied
during the load pipeline, so there is no way to add one to a running page. Every
other query parameter is preserved, and any mod chosen through the mod-selection
screen stays chosen. The wiring is in `main.js`, next to `#advanced-options`.

**These work on GitHub Pages and the [load mods] list does not.** That list is
scraped from an Apache-style directory autoindex, which a static host does not
generate; loading by filename needs no index.

Cost: Worthy Heroes adds ~170 units and takes load from 390ms to 420ms.
Dominions Enhanced is 5.7MB and takes it to ~1.2s — 160 nations, 8050 units,
3527 spells, 809 items. Both together: ~1.3s. The sprites are lazy-loaded and
cost nothing at startup; `mods/` is 19MB on disk.

A mod can name art it does not ship (28 files across these two). The card hides
an image that fails to load rather than showing the browser's placeholder —
`onerror` on the sprite tags. **Do not test that by assigning `img.onerror` in
the page**: doing so replaces the inline handler and the image stays visible,
which looks exactly like the fix not working.

### Cache-busting gotcha

`index.html` sets `var versionCode='?v=38'` and ~26 script/style tags carry
`?v=38`. **Change the contents of a JS/CSS file without bumping that number and
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
detachShowingDetails`. That is how the card views sit beside the SlickGrid
pages without either knowing about the other.

**A tab and a page are not the same thing.** The Unit / Item / Spell tabs open
the *card* pages (`unitcards`, `itemcards`, `spellcards`); the grids keep the
names `unit` / `item` / `spell`, because the grid code and every filter element
id is built on them. So the registry entries carry `button` (the tab that opens
this page) and `nobutton` (no tab opens it — reached from the card view's
**[table]** button, or by permalink).

**Only the page a tab OPENS may disable it.** Disabling the tab of a grid you
arrived at from [table] fires no clicks and strands the user with no way back.

`deSerializeState` asks `DMI.showPage(name)` first and only falls back to
clicking a tab, since half the page names no longer have one. The default
landing page is `itemcards`.

**Trap:** the shared header (`#primary-details` — page tabs, permalink, mod
status) is *physically moved into whichever page is active* by `CGrid.show()`.
A new page must do the same or the tab bar vanishes and the user is stranded.
`MNationView` parks it in `.nv-shared` and hides `#primary-details div.panel`
(the grid filter panels, which belong to the grid pages).

---

## 3. The unit data model — read this before touching the card views

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
*not* a bug — the card views now say which is which, see
"Telling apart units that share a name".

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
| `school` = -1 | **unresearchable**. Not castable: either debris, or a link in a nextspell chain. Kept out of the Nation view's spell list. |

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

## 4. The card views

`scripts/DMI/MNationView.js`, `scripts/DMI/MCardPages.js` and
`scripts/nationview.css`. Mobile-first: base rules target a phone, and the
**card's own width** (a CSS container query) drives its internals — not the
viewport, because a card in a 3-column desktop grid is no wider than one on a
phone.

Four pages show cards: the **Nation view** (what one nation has) and three
**browse pages** for Unit, Item and Spell (what there is). They share
everything except which objects they pick.

### CardList — the shared half

`MNationView.CardList($page, $list)` owns what every list of cards does once
painted: the face tabs and the swipe between them, the detail sheet a tap
opens, and fetching the description files. The page above it decides only
*which* cards, then calls `cardList.paint(html)`.

The CSS is scoped to **`.nv-page`**, a class on all four page divs — not to
`#nation-page`, which is what it used to be.

### The browse pages (`MCardPages.js`)

These are the only way to reach a unit no nation fields: an independent, a
horror, a monster a generic spell summons.

Filtering is deliberately the minimum — a name search and a type select,
mirroring the two controls the legacy tabs put first. The unit type classes are
derived from `typechar` rather than copied from that select's very long
comma-separated option values, and they **overlap as the legacy ones do**: a
summoned commander answers to both Commanders and Summoned.

**A card is not cheap** — stats, weapons, abilities, a description fetch — and
there are 4348 units before any mod. The list stops at `LIMIT` (250) and says
so; the search box is how you get at the rest.

### Sections (`GROUPS`)

`Recruitable`, `Magic site`, `Heroes`, `Summons`, `Spells`, `Items`,
`Pretenders` (off by default — it is 60–70% of the list and a different mode of
play), `Other`.

The first four and the last two hold units; `Spells` and `Items` hold the
nation's own spells and its restricted or discounted items. An entry is
`{ kind:'unit'|'spell'|'item', obj, group, descriptors[] }` and `renderEntry`
dispatches on `kind`. Everything downstream — chips, counts, the name filter,
the detail sheet — is kind-agnostic.

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

### Default and advanced

The default card shows what is neither obvious nor minor, and says as much of
it as it can in icons. Advanced shows everything the detail overlay would.

This rides on **the app's existing "advanced" checkbox** (`#showids`, which also
turns on ids and modder detail) rather than adding a second switch that could
disagree with it. `isAdvanced()` reads `DMI.Options['Show ids']`; the view binds
the checkbox and re-renders, deferred by a `setTimeout(0)` so `main.js` has
updated the option first.

Three lists in `MNationView` do the work:

- `ADVANCED_ONLY` — true of most units, or never decisive: `female`, `bird`,
  `wolf`, `aboleth`, `adventurers`, guardian spirit, `indepspells`,
  `pathboost`, and the two `ai*rec` keys, which say how the AI plays a unit
  rather than how it works.
- `TAG_ELSEWHERE` — said elsewhere on the card, so never a chip in either mode:
  `unique` (title bar), the two sailing figures (their own icon).
- `tagHidden()` — the conditional cases. A **negative** `appetite` is an
  appetite smaller than usual, which is unremarkable; a positive one earns the
  gluttony icon.

**Beware of several keys sharing one label.** "guardian spirit" is
`guardspiritbonus`, `guardspirit` *and* `guardianspiritmodifier`; a rule keyed
on two of them silently does nothing on units carrying the third. That is how
this one was caught — the tag count came back identical in both modes.

`ENCH_REBATE` covers the seven `enchrebate*` keys, which print as "10 gold
cheaper when active 107" — where 107 is the *number* of the enchantment that
has to be up. The card says "Gigantomachia discount 10" instead, and only in
advanced mode.

`SIGNED_ICONS` handles a property whose meaning turns on its sign: `incunrest`
raises unrest when positive and lowers it when negative, and each has its own
icon. `NO_ICON_WHEN_NEGATIVE` is the opposite case — gluttony only makes sense
for a *bigger* appetite, so a negative one keeps its words.

Sailing is a compound: `sailingIcon()` paints the ship's total capacity and its
per-unit size cap onto the one icon, which is drawn larger (38px) than the
others to carry two lines. **The two labels must be matched on `em` in the CSS**
(`.nv-sail em.nv-sail-a`), or the shared `.nv-ab em` rule — more specific than a
bare class — wins with its `top:auto` and stacks both labels in the middle.

### The gold line

Gold heads the stat block, and a cap on how many you may raise in a turn
(`reclimit`) rides beside the price rather than taking a line of its own:
`Gold 40 (limit 3/turn)`.

A **negative** `reclimit` (Niefel Giant `-2`, Laestrygonian `-1`) means the
unit is only recruitable while a particular ritual is active, and which ritual
varies by nation — so the line says `(special)` rather than a number, with the
explanation as its tooltip.

### Telling apart units that share a name

**557 names are shared by more than one unit — 1574 units in all.** Three
Sorginas, five Heavy Infantry, six Infantry of Ulm. A list that repeats a name
with no way to tell which is which is close to useless, so `disambiguator()`
puts a parenthetical after it:

| | when | example |
|---|---|---|
| by nation | the units belong to different nations and each names four or fewer | `Sorgina (EA Pyrène)` |
| by equipment | the nation does not separate them — same nation, or none | `Infantry of Ulm (hammer/shield)` |
| by nothing | neither does | the nine Daughters of Typhon |

The two are mixed within one group where that is what it takes: five Infantry
of Ulm are told apart by weapon and the sixth by nation. A label two units would
share is dropped from both — it tells them apart no better than none does.

Grouping is **global**, over whole-numbered ids only (the fractional ones are
clones of the same unit), and computed lazily per name so only shared names
cost anything. `equipLabel` needs `prepareForRender`, which is why it is not
done up front for all 4348 units.

### What a summoned creature costs

A price of zero means it is not bought, and for 511 units that is because a
ritual calls it up instead. What the ritual costs is the figure a player
weighs, so it takes the gold line's place:

    Cost   20 <D gem> / 5 (Conj3, 2 <D path>)     [Revive Wights]
    Cost   20 <D gem> / 17+++ (Conj9, 5 <D path>) [Legion of Wights]

Gems to cast it once, then how many arrive (left off when it is one), then the
school and research level, then the paths the caster needs. The ritual's name
is the row's tooltip.

**One line per ritual**, sorted by what a player reaches first: lowest research
level, then cheapest. 50 units have more than one; the Imp has three.

The count goes through `MSpell.spellBonus`, so a figure that grows with the
caster's path keeps the legacy view's `+` notation — `17+++`, `10+ [5/lvl]`.

**Unresearchable summoners are skipped.** They are links in a nextspell chain,
not something a player casts, and they carry no cost, school or paths — the Imp
was showing two near-empty `Cost / 40` lines before they were filtered.

Paths are listed in the spell's own `path1`/`path2` order, which is what
`mpath` and the legacy overlay use.

School abbreviations live in `SCHOOL_SHORT`: Conj, Alt, Evo, Cons, Ench,
Thaum, Blood, Divine.

### Protection

The game gives one number and the inspector's overlay does too — the pieces
survive there only inside a tooltip string. But two of them are what a player
reasons with, so they sit in the first column:

    Protection       7 <pelt> 21 <helm> 18 <plate>
    ... vs mundane            25 <helm> 25 <plate>

Armour is worth less the tougher the hide beneath it —
`nat + armour - (nat * armour / 40)` per location, then
`(body*4 + head) / 5` for the figure the game shows. That is MUnit's formula,
not one invented here.

The second line appears only for an invulnerable creature. Invulnerability is a
floor on protection against mundane weapons, so it shows the higher of the two
per location.

**MUnit now records the parts** (`prot_nat`, `prot_armor_head/body`,
`prot_head/body`) as it computes them, because the line that follows overwrites
`o.prot` with the total. They are in MUnit's `ignorekeys` so the overlay does
not print them as stray rows.

The natural figure appears only for a creature with protection of its own. With
nothing worn there is no breakdown to give, so one figure stands.

### Leadership

Only a commander leads anything, so `leadershipRow()` leaves the figure off
everything else — on a rank-and-file troop it was three lines saying nothing.

A commander always shows it, **zero included**: "can lead nobody" is worth
knowing. The two special kinds go in brackets after it under their own icons
(`magic_being`, `undead`), which puts on one line what used to take three:

    Leadership 150 (<magic> 100 <undead> 50)

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

### Other bodies

The same treatment covers everything else that is a second unit: the shapes a
unit turns into and the units its dominion attracts. `OTHER_BODIES` lists the
property and the words that go on its tab, and `OTHER_BODY_KEYS` then suppresses
the tag the tab replaces.

    secondshape     second shape        domsummon       domsummon
    secondtmpshape  dying shape         domsummon2      domsummon/2
    shapechange     alternate shape     domsummon20     domsummon/20
    prophetshape    prophet shape       raredomsummon   domsummon 8%
    landshape       land shape          slaver          captures
    watershape      sea shape           xpshape         experienced shape
    twiceborn       Twiceborn           labxpshape      experienced shape (lab)

`slaver` is in that list for the same reason: the number it stores is the unit
this one takes as slaves, so it is a reference like any other rather than a
figure in a chip.

Most entries store the unit's id. An entry may carry a **resolver** for the
ones that do not: `xpshape` stores the *experience threshold*, and the form it
promotes to is named by `xpshapemon` or is simply the next id along.

The tab has to name the relation, not just the unit: a dying shape is what you
are left with, a prophet shape is what you choose, a domsummon is what turns up
in your dominion. The domsummon variants differ only in how often, so the tab
says which. `faceLabel` puts that in front of the name via `f.prefix`.

**A creature that shrinks as it is damaged** is a chain, not a single step, so
`mountFaces` walks it separately. Each form names the next by convention — the
next id along — and carries the hit points at which it gives way, so the tabs
read `hp 119`, `hp 93`, `hp 70`. The name is left off those tabs when it
matches the card's own, which it nearly always does; eight repetitions of
"Water Elemental" only cost width. 71 units start a chain, the longest is 8
links.

The smaller forms are cards in their own right too, with shorter chains. That
is wanted, not duplication: different spells summon different sizes. `growhp`,
the way back up, is deliberately **not** followed — a card lists what this form
can become, not what it may have been.

Not every `*shape` property is here — `firstshape`, `forestshape`, `plainshape`,
`homeshape`, `xpshape` and the rest stay as tags.

`unique` sits in the title bar of the card it belongs to; a face that is *not*
the card's first (a mount, a shape, a summoned unit) carries its own badge in
the panel, since the title is already spoken for.

### Weapon modifiers

The modifier mask decodes to up to a dozen long phrases; burying the two that
matter is the failure mode. They are split four ways:

- **damage types → glyphs** beside the damage number (never in the tag list)
- **beside the weapon name:** `AoE n` first, then `2H`, `+Str/2`, `+Str/3`,
  and the damage modifiers `AP`, `AN`, `(cap)`. (A weapon's area is not in
  `weapons.csv` — MWpn lifts it off the effect record onto `w.aoe`.) The name column is the one with room to
  spare; crowding the damage figure buries the only number on the row anyone
  is reading.
- **folded / dropped:** `Made of Iron` and `Intrinsic Weapon` are dropped;
  `Damage Bonus on 1st Attack` → `lance`; all four of
  *Intrinsic Weapon + Damage Bonus on 1st Attack + Higher charge bonus cap +
  Cannot be used for repelling* → **`heavy-lance`**; `lance` supersedes
  `no-repel`
- **everything else** shortened to fit one line: `MRN`, `MRNH`, `MR/half`,
  `no Str`, `no shield`, `UW ok`, `no vs mindless`, …

Two default-mode suppressions, both from `weaponMods`:

- A weapon carrying **no damage type at all** does no ordinary damage — a mind
  blast, a net, a web. Saying such a thing cannot repel and adds no strength is
  noise, so `no-repel` and `no Str` are dropped from it.
- On a **ranged** weapon, `2H` and `UW ok` go: every bow needs both hands, and
  whether one works underwater is a detail for someone who went looking.
- `nat. ranged` goes everywhere (`QUIET_BY_DEFAULT`): that a claw or a breath
  is part of the creature is already plain from its name.

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

### Spell cards

Where the nation's spells come from: `MSpell` hands each spell it finds a
nation attribute for (or that a nation reaches through its home realm) to that
nation as `nation.spells`, and then **deletes `spell.nations`** — the nation's
own list is the only place the association survives. `spell.notnations` is the
counterpart and must be honoured: a spell reached through a realm but denied to
this nation specifically.

Coloured by **type**, not school — combat vs ritual decides how you use one,
and the school is spelled out in the title anyway. The path requirement sits in
the title beside the name, because it decides whether the nation can cast the
spell at all.

The summoning spells overlap the Summons section on purpose: one answers "what
can I summon", the other "what does it cost me".

**Encoded counts.** `nreff`, `damage` and the number summoned share a "base
value plus a bonus per caster level" encoding — `2001` means three at path 1
and one more per level. `MSpell.spellBonus` (exported from `SpellTables.js`)
decodes it. The detail overlay prints `nreff` raw, so it shows `2001`; the card
decodes it to `3++`. That divergence is deliberate.

For a summoning spell the count is already carried by the tabs, so the card
leaves the `Effects` row off entirely.

`SUMMON_EFFECTS` lists the effect numbers that summon; keep it in step with the
summon branches in `MSpell.prepareData_PostMod`.

`EFFECT_ICONS` swaps an effect's *name* for a picture where the game has one —
"Poison (HP damage)" is three words for what the poison icon says at a glance,
next to a damage figure that already carries its own glyphs. The name stays as
the tooltip. Both modes.

**Unresearchable spells (school `-1`) are left out of the list.** A player can
never cast one deliberately. They are either debris — LA Pythium carries one
literally named `xxx`, a copy of Orgy — or a link in a nextspell chain, which
is how "summons all of the following" is built. The links are picked up as tabs
on the spell that does the casting. 8 of 941 nation spell cards were of this
kind; 933 remain.

### What a summoning spell calls up

Given the same treatment as a mounted unit: one face per body, switched by the
tab strip in the title. **Tab 0 is the spell**, the rest are the units, each
with its full stat block. Tapping the card opens whichever face is on screen —
every face carries a `data-ref` and `cardRef` reads it.

Two shapes, meaning opposite things, so the tab strip is labelled with which:

| | how it is built | example |
|---|---|---|
| **one of the following** | one effect resolving to several candidates: a monster tag, or a list of uniques | Call Amesha Spenta, Queen of Elemental Air |
| **all of the following** | a chain of nextspells, each summoning its own thing | Troll King's Court, Contact Dai Tengu |

Detection is on the chain: **more than one link that summons → all of**;
otherwise more than one unit from the single link → **one of**. Counts come per
link, so Contact Dai Tengu reads `Dai Tengu`, `Tengu Warrior ×13`,
`Karasu Tengu ×20`.

A parent whose own effect does not summon (Parting of the Soul is a Paralyze
that chains into Black Hawk ×3) correctly gets no label — only one kind of unit
arrives.

**A third case rides along with both.** Spell attributes 1700 and 1701 —
"Underwater summon" and "Cold summon" — name a unit that **replaces** the
ordinary summon in that circumstance rather than arriving as well. That is the
Unseelie half of the Faerie Court. `MSpell` records these on `spell.summonconds`
so they can be labelled with the circumstance and kept out of the count that
decides the wording; otherwise a Faerie Court reads as twice as many choices as
it offers. 11 spells use them.

### Item cards

Two different things, and an item can be both: `item.restricted` (only this
nation can forge it) and `item.nationrebate` (anyone can, this nation pays
less). Both are lists of nation ids that may be strings *or* numbers depending
on which prepare pass ran first — compare loosely.

Coloured by what the item is worn or wielded as (weapon / armour / misc).
`itemcost1` and `itemcost2` are the percentages that produced the forge cost
and are suppressed; a `constlevel` of 12 means it exists but cannot be forged,
and its stored gem cost is meaningless.

### Descriptions on spell and item cards

Not flavour text — for most items the description is the only statement of what
the thing does — so the card carries it. Units deliberately do not have one.

Two files per spell, one per item, under `gamedata/spelldescr/` and
`gamedata/itemdescr/`, named by `Utils.descrFilename`. The second spell file,
`details<Name>.txt`, holds the mechanical figure (`Grants +4 MR`) and is set as
a figure rather than as prose. Coverage of national spells: 375 of 381 have a
description, 26 have a details file.

**There is no index of which files exist**, so a miss is a 404 — about a third
of requests. That is the same bargain the detail overlay already makes. A miss
is cached as `''`, so it is asked for once per session, not once per visit.

Loading is per *rendered card*, not per nation, so switching a section on later
fetches only what it added. Measured: ~23 requests and ~130ms on first visit to
a nation, **zero requests on a revisit** — `descrStrip` writes cached text
straight into the card, so a nation you have seen before renders at its final
height with no reflow at all.

**Fill in one pass, never one at a time.** Every placeholder is filled after
they have all settled (`paintDescriptions`). Cards grow as text arrives, and a
list that reflows forty times under a thumb is unusable. Two traps that follow
from that:

- A strip with nothing in it is **removed**, not left as an empty parchment
  band — and removing it hands the card's bottom corners back to whatever strip
  is now last (see the `:last-child` rule).
- A *placeholder* whose file turned out not to exist is removed too. The gap
  between two description blocks is a margin, and an empty block still collects
  one — leave them in and a card is 5px taller on first visit than on revisit.

### Reusing the overlay's formatting

`MUnit.display`, `MSpell.display` and `MItem.display` export the alias/format
tables their own detail overlay uses. `displayFor(kind)` normalises the three
shapes to the two lists the card code wants (`flags`, `other`). **Format a
value through these rather than re-deriving it**, so a stat reads the same on a
card as in the overlay.

One deliberate difference, carried on `D.preferFormatted`: items and spells
take the *formatted* value for a property (a gem cost, a signed bonus, a
reference to another object), units take the *stored* one. A unit's properties
are mostly bare numbers and were tuned that way; an item's meaning lives in its
formatter.

---

## 5. Ability icons

`images/abilities/` (180 PNGs, ~730 KB) + `scripts/DMI/abilityicons.js`
(key → `[icon stem, proper name]`, 189 entries). Provenance and regeneration
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

Baselines: load ~420ms to the Nation view, ~520ms to the default landing page
(which builds 250 item cards), 3.61MB over 209 files. Across all 103 nations: 3355
unit cards, 933 spell cards, 163 item cards, 4451 cards and 2793 tabs with
every section switched on; 101 nations have spells, 64 have items.

**Check a display rule by counting in both modes, not by looking.** A rule that
silently does nothing looks exactly like a rule that works, until you compare
`default n / advanced n` and find them equal.

### Sweep with the mods loaded

Vanilla data is uniform enough to hide whole classes of defect. Running the
same sweep with Worthy Heroes + Dominions Enhanced (9172 cards, 6920 tabs across
125 nations) turned up 46 cards showing `NaN`, `undefined` or `[object Object]`
that vanilla never produced:

- a stat formatter that appends to its argument turns `NaN` into **`"NaN-"`**,
  which no longer looks like a number that failed to compute — so `statRow`
  tests the *stored* value as well as the formatted one;
- weapon and armour cells fall back to empty rather than `NaN` (`cell()`), since
  the stat helpers meet combinations they were not written for;
- a modded spell effect can hand back something that is not text at all, so
  `spellEffect` accepts only a string or a number and otherwise prints the
  effect's name alone;
- `isNotANumber()` guards the tag row: `magicboost_G NaN` is worse than silence.

One thing left alone: `item 844` renders as **`(undefined)`** for three nations.
That is `MItem`'s own placeholder for a mod-defined item with no `#name`, and
the legacy item grid shows it too. The card is reporting the mod accurately.

**Sweep the tabs, not just the cards.** A hidden face returns zero rects, so an
overflow check that only looks at what is on screen never sees four fifths of a
summoning spell's content. `tabsweep` activates every tab of every spell card
and asserts the face activates, carries a ref, and has a stat block.

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

- The browse pages have only a name search and a type select. The legacy grids
  keep everything else (paths, research level, nation, era, custom js) and are
  one [table] click away; those filters want porting next.
- The browse list stops at 250 cards. A virtual list would remove the cap, but
  the search box makes it survivable for now.
- The spell and item card colours are a first pass and were not chosen by the
  domain expert: spells by ritual/combat, items by weapon/armour/misc. Both are
  two custom properties in `nationview.css`, so they are cheap to redo.
- Spell and item sections have no descriptor chip row of their own — the second
  chip row is still recruit-only. Ritual/combat and restricted/discount would
  be the obvious filters.
- Description files are fetched blind, so roughly a third of the requests are
  404s. A generated manifest of which files exist — the same arrangement as
  `abilityicons.js`, with its provenance note — would remove them, at the cost
  of an artifact to regenerate with the gamedata.
- **Latent bug, not mine, not fixed.** In `MSpell.prepareData_PostMod` the
  attributes loop reads `_effects.effect_number` to decide whether a 1700/1701
  summon is a unit or a commander — but `_effects` is not assigned until *after*
  that loop. `var` hoists it to function scope, so it holds the value left over
  from the **previous spell** in the outer loop, and would throw outright if the
  first spell processed had one of those attributes. 11 spells are affected, and
  the fix would move some units between typechars, so it wants checking against
  the game rather than a quiet edit.
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
