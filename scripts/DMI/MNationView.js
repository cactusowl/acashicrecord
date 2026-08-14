//namespace scope
(function( DMI, $, undefined ){

var MNationView = DMI.MNationView = DMI.MNationView || {};

var Format = DMI.Format;
var Utils = DMI.Utils;
var modctx = DMI.modctx;


////////////////////////////////////////////////////////////////////////////
// origin groups
//
// every unit the data layer associates with a nation carries a `typechar`
// saying HOW the nation gets it (see the `iterations` table in MNation.js).
// there are 30-odd of those strings; this collapses them into the handful of
// groups a player actually thinks in, each with its own colour.
//
// order here is the display order of both the chips and the card list.
////////////////////////////////////////////////////////////////////////////

var GROUPS = [
	{ key:'recruit',   label:'Recruitable',   hint:'built in a province you hold' },
	{ key:'site',      label:'Magic site',    hint:'unlocked by owning a site' },
	{ key:'hero',      label:'Heroes',        hint:'arrive through luck events' },
	{ key:'summon',    label:'Summons',       hint:'called with a national spell' },
	{ key:'pretender', label:'Pretenders',    hint:'chooseable gods and titans', offByDefault:true },
	{ key:'other',     label:'Other' }
];

var TERRAINS = ['forest','mountain','swamp','waste','cave','coast','plains','land','u-water'];

////////////////////////////////////////////////////////////////////////////
// where a nation recruits a unit
//
// the data layer records one typechar per way of getting a unit, and clones
// the unit when there is more than one - so a troop buildable both in forts
// and in forest provinces exists twice, as "unit" and "unit (forest)".
//
// they are all the same troop, so the clones are merged back into one card and
// every place it can be raised is listed in the title: "forts - forest".
//
// returns null for typechars that are not a recruitment origin at all
// (summons, heroes, pretenders); those keep their own section.
////////////////////////////////////////////////////////////////////////////
var DESCRIPTOR_NAMES = { 'u-water': 'underwater' };

//the order descriptors are listed in, whatever order the clones came in
var DESCRIPTOR_ORDER = ['forts', 'capital'].concat(
	TERRAINS.map(function(t){ return DESCRIPTOR_NAMES[t] || t; })
).concat(['foreign']);

function descriptorOf(typechar) {
	var t = String(typechar || '').toLowerCase();

	if (t == 'unit' || t == 'commander')	return 'forts';
	if (t.indexOf('cap only') != -1)		return 'capital';
	if (t.indexOf('foreign') != -1)			return 'foreign';

	for (var i=0, k; k=TERRAINS[i]; i++)
		if (t.indexOf('('+k+')') != -1) return DESCRIPTOR_NAMES[k] || k;

	return null;
}

//typechar -> group key
function groupOf(typechar) {
	var t = String(typechar || '').toLowerCase();

	if (descriptorOf(typechar))				return 'recruit';
	if (t.indexOf('magic site') != -1)		return 'site';
	if (t.indexOf('hero') != -1)			return 'hero';
	if (t.indexOf('summon') != -1)			return 'summon';
	if (t == 'pretender')					return 'pretender';

	return 'other';
}

//the parenthesised qualifier, eg "cmdr (Battle Summon)" -> "Battle Summon".
//only worth showing where the group label does not already say it.
var QUALIFIED = { hero:1, other:1 };

function qualifierOf(typechar, group) {
	if (!QUALIFIED[group]) return '';
	var m = /\(([^)]+)\)/.exec(String(typechar || ''));
	return m ? m[1] : '';
}

//NB: nations field several units with the SAME name that differ only in kit -
//Ulm has five "Infantry of Ulm", one per weapon. the per-weapon attack rows
//below are what tells them apart.

//commander / mage / unit. sorttype is the data layer's own classification and
//is more reliable than re-parsing typechar.
function roleOf(u) {
	var s = String(u.sorttype || '');
	if (s.indexOf('mage') != -1) return 'mage';
	if (s.indexOf('cmdr') != -1) return 'cmdr';
	return 'unit';
}

////////////////////////////////////////////////////////////////////////////
// unit class
//
// what colours a card. four kinds, in the order they matter to a player:
//   unit  - not a commander
//   cmdr  - a commander with no magic at all
//   holy  - a commander with holy paths and nothing else
//   mage  - a commander with any other path
//
// paths are read from the unit's own path properties (F, A, W, ... H) rather
// than by parsing the assembled mpath string, and random draws count too: a
// commander whose only magic is a random pick is still a mage.
////////////////////////////////////////////////////////////////////////////
function classOf(u) {
	if (roleOf(u) == 'unit') return 'unit';

	var keys = DMI.modconstants.pathkeys;
	var holy = false, other = false;

	for (var i=0, k; k=keys[i]; i++) {
		if (!Utils.is(u[k])) continue;
		if (k == 'H') holy = true; else other = true;
	}
	for (var i=0, r; r=(u.randompaths||[])[i]; i++) {
		var paths = String(r.paths || '');
		if (!paths) continue;
		if (paths.replace(/H/g, '')) other = true;		//any non-holy option
		else holy = true;
	}

	if (other) return 'mage';
	if (holy)  return 'holy';
	return 'cmdr';
}


////////////////////////////////////////////////////////////////////////////
// data
////////////////////////////////////////////////////////////////////////////

//every unit a nation can field, in display order.
//
//the data layer clones a unit once per way of obtaining it, so the same troop
//can appear several times with different typechars. clones within one section
//are merged back into a single entry carrying every descriptor that applies -
//see descriptorOf. a unit that is both recruitable AND summoned still gets an
//entry in each section, because those are genuinely different things.
//
//each entry is { unit, group, descriptors[] }.
function unitsForNation(nation) {
	var entries = [], byKey = {};

	for (var i=0, u; u=modctx.unitdata[i]; i++) {
		if (!u.nations || !u.nations[nation.id]) continue;
		if (u.name === 'Empty') continue;		//placeholder rows, as in the unit grid

		DMI.MUnit.prepareForRender(u);			//fills in sprite urls and final stats

		var group = groupOf(u.typechar);
		//clones differ by a fractional id (1085, 1085.01, ...); the whole part
		//identifies the underlying unit
		var key = Math.floor(u.id) + '|' + group;

		var e = byKey[key];
		if (!e) {
			e = byKey[key] = { unit: u, group: group, descriptors: [] };
			entries.push(e);
		}
		var d = descriptorOf(u.typechar);
		if (d && e.descriptors.indexOf(d) == -1) e.descriptors.push(d);
	}

	for (var i=0, e; e=entries[i]; i++)
		e.descriptors.sort(function(a,b){
			return DESCRIPTOR_ORDER.indexOf(a) - DESCRIPTOR_ORDER.indexOf(b);
		});

	entries.sort(function(a,b){
		var ga = groupIndex(a.group), gb = groupIndex(b.group);
		if (ga != gb) return ga - gb;

		//sorttype already encodes a sensible cmdr/mage/unit ordering
		var sa = a.unit.sorttype || 'zzz', sb = b.unit.sorttype || 'zzz';
		if (sa != sb) return sa < sb ? -1 : 1;

		return (parseInt(a.unit.goldcost)||0) - (parseInt(b.unit.goldcost)||0);
	});
	return entries;
}

var _groupIndex = null;
function groupIndex(key) {
	if (!_groupIndex) {
		_groupIndex = {};
		for (var i=0; i<GROUPS.length; i++) _groupIndex[GROUPS[i].key] = i;
	}
	return _groupIndex[key];
}

//nations grouped by era, for the picker
function nationsByEra() {
	var eras = [];
	for (var era=1; era<=3; era++) {
		var list = [];
		for (var i=0, n; n=modctx.nationdata[i]; i++)
			if (parseInt(n.era) == era) list.push(n);

		list.sort(function(a,b){ return (a.name||'') < (b.name||'') ? -1 : 1; });
		if (list.length) eras.push({ name: DMI.modconstants.eranames[era], nations: list });
	}
	return eras;
}


////////////////////////////////////////////////////////////////////////////
// rendering
////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////
// stat formatting
//
// values go through MUnit's own formatter for that key wherever one exists,
// so a stat reads the same here as it does in the detail overlay (size shows
// its mount, age shows current(max), and so on).
////////////////////////////////////////////////////////////////////////////

//the three stat columns, laid out as the game's own unit card lays them out.
//Fatigue and XP are omitted deliberately: they describe an individual unit in a
//game, not the unit type this card describes.
var COL1 = [
	['goldcost','Gold'], ['hp','Hit points'], ['size','Size'],
	['prot','Protection'], ['mr','Magic Resistance'], ['mor','Morale']
];
var COL2 = [
	['rcost','Resources'], ['str','Strength'], ['att','Attack Skill'],
	['def','Defence Skill'], ['prec','Precision'], ['ap','Combat Speed']
];
var COL3 = [
	//NB: recruitment points (rpcost) are deliberately absent. they are a
	//Dominions 6 mechanic - roughly, how much training capacity a unit consumes,
	//so an unarmoured expert swordsman is cheap in resources and dear in
	//recruitment points, and an armoured slave the reverse. the game
	//autocalculates them and the inspector has no working implementation, so the
	//stored figures are wrong (6996 on a Moose Rider, 10000 on summons).
	//Restore this row once the value can be computed.
	['mapmove','Map Move'],
	['enc','Encumbrance'], ['maxage','Age']
];
//appended to the third column for anything that can lead troops
var LEADERSHIP = [
	['leader','Leadership'], ['undeadleader','Undead Ldr'], ['magicleader','Magic Ldr']
];

////////////////////////////////////////////////////////////////////////////
// random magic
//
// a recruit can come with random path picks. the data holds one entry per
// draw: { paths:'FAWE', levels:'1', chance:'100' } - `levels` picks that many
// times, `chance` is the probability of the draw happening at all.
//
// each distinct set of paths is shown once, as (N% PATHS), where N is the sum
// of levels x chance over its draws. so 3 guaranteed picks from F/E/S read as
// (300% FES), and "one pick plus a 50% shot at another" reads as (150% FAWE).
// N is left off when it is exactly 100.
//
// 150% is not mechanically the same as a 100% draw plus a 50% draw, but it is
// how players write it and it collapses the common case onto one line.
////////////////////////////////////////////////////////////////////////////
function randomDraws(o) {
	var list = o.randompaths || [];
	if (!list.length) return '';

	var order = [], total = {};
	for (var i=0, r; r=list[i]; i++) {
		var k = r.paths || '';
		if (!k) continue;
		if (total[k] === undefined) { total[k] = 0; order.push(k); }
		total[k] += (parseInt(r.levels) || 1) * (parseInt(r.chance) || 100);
	}

	var out = [];
	for (var i=0; i<order.length; i++) {
		var k = order[i], pct = total[k];
		out.push('<span class="nv-draw">'
			+ '<b class="nv-paren">(</b>'
			+ (pct != 100 ? '<span class="nv-drawpct">' + pct + '%</span>' : '')
			+ pathStack(k)
			+ '<b class="nv-paren">)</b></span>');
	}
	return out.join(' ');
}

//the paths of one draw, packed two rows high so a four-path random reads as a
//2x2 block rather than a long strip. the icons are only half the line height,
//so the second row costs no extra vertical space in the ability strip.
//filled left-to-right then down, so the block reads in the order of the string.
function pathStack(paths) {
	var n = String(paths || '').length;
	if (!n) return '';
	var cols = Math.ceil(n / 2);
	return '<span class="nv-pathstack" style="grid-template-columns:repeat('+cols+',auto)">'
		+ Format.Paths(paths) + '</span>';
}

//the magic path line: fixed paths, the random draws in place of the data
//layer's "U<n>" summary token, then the research figure
function pathsDisplay(o) {
	var mp = String(o.mpath || '');
	if (!mp) return '';

	var rnd = randomDraws(o);
	var parts = mp.split(/U\d*/);			//"E1 U1 R9 " -> ["E1 ", " R9 "]

	var h = Format.Paths(parts[0] || '');
	if (rnd) h += rnd;
	if (parts.length > 1) h += Format.Paths(parts.slice(1).join(''));
	return h;
}

function fmtValue(o, key) {
	var D = DMI.MUnit.display;
	var v = o[key];
	if (v === undefined || v === null || v === '') return null;

	var f = D.formats[key];
	if (f && typeof f == 'function') return f(v, o);		//formatter returns html
	if (f && f[v] !== undefined)     return f[v];
	return Utils.escapeHtml(v);
}

//one "Label ....... value" line of the stat block.
//`force` keeps a zero visible, as the game card does for the core stats; a
//property the unit simply does not have is still skipped.
function statRow(o, key, label, force) {
	var v = fmtValue(o, key);
	if (v === null || v === '') return '';
	if (!force && v == '0') return '';
	return '<span class="nv-stat"><i>'+Utils.escapeHtml(label)+'</i><b>'+String(v).trim()+'</b></span>';
}

function statColumn(o, rows, force) {
	var h = '';
	for (var i=0; i<rows.length; i++) h += statRow(o, rows[i][0], rows[i][1], force);
	return h ? '<span class="nv-statcol">'+h+'</span>' : '';
}

//properties that are not abilities and not worth a chip. `eyes` is a good
//example of why: most units record "eyes 2", one-eyed ones record "eyes 1",
//and a bare 1 renders as a boolean - so it reads as "eyes" for a cyclops.
var DROP_PROPS = {
	mountmnr: 1,		//shown as a face / tag instead
	coridermnr: 1,
	nofriders: 1,
	nofmounts: 1,
	lich: 1,			//"lich shape"
	drawsize: 1,
	recruitedby: 1,		//"recruited from"
	older: 1,			//"start age modifier"
	eyes: 1
};

////////////////////////////////////////////////////////////////////////////
// abilities
//
// the game shows an ability as an icon and lets you hover it for the name.
// there is no hover on a touchscreen, so the icon carries its number in the
// corner and the name stays as a tooltip and an aria-label.
// abilities the icon set does not cover fall back to a text chip.
////////////////////////////////////////////////////////////////////////////

//a value worth painting on a 24px icon: short, and not just the boolean 1
function iconBadge(raw) {
	if (raw === undefined || raw === null) return '';
	//objects and arrays have no meaningful short form; never String() them
	if (typeof raw != 'string' && typeof raw != 'number') return '';
	var s = String(raw).trim();
	if (s === '' || s === '1') return '';
	return s.length <= 4 ? s : '*';
}

function abilityIcon(key, label, raw) {
	var ic = DMI.abilityIcons && DMI.abilityIcons[key];
	if (!ic) return null;

	var name = ic[1] || label;
	var badge = iconBadge(raw);
	var title = Utils.escapeHtml(badge ? name + ' ' + badge : name);

	return '<span class="nv-ab" title="'+title+'" aria-label="'+title+'">'
		+ '<img src="'+DMI.abilityIconPath+Utils.escapeHtml(ic[0])+'.png" alt="" loading="lazy" />'
		+ (badge ? '<em>'+Utils.escapeHtml(badge)+'</em>' : '')
		+ '</span>';
}

//splits everything the overlay would print about a unit into icons and text.
//`skip` holds keys already shown in the stat block so they are not repeated.
function abilityBlock(o, skip) {
	var D = DMI.MUnit.display;
	var icons = [], text = [], seen = {};

	//`raw` is the stored value, `formatted` the html MUnit's own formatter makes
	//of it. some properties hold objects or arrays (a recruiting site, a list of
	//nations) - those are only meaningful through the formatter, never as
	//String(value), which yields "[object Object]".
	function consider(key, label, raw, formatted) {
		if (seen[key] || skip[key] || DROP_PROPS[key]) return;
		seen[key] = 1;

		var ic = abilityIcon(key, label, raw);
		if (ic) { icons.push(ic); return; }

		var val = '';
		if (typeof raw == 'string' || typeof raw == 'number') {
			val = String(raw).trim();
			val = (val === '1') ? '' : Utils.escapeHtml(val);
		}
		else if (formatted !== undefined && formatted !== null && formatted !== '') {
			val = String(formatted).trim();		//already html
		}
		text.push('<span class="nv-tag">'+Utils.escapeHtml(label)+(val ? ' '+val : '')+'</span>');
	}

	//boolean abilities
	for (var i=0, k; k=D.flags[i]; i++)
		if (o[k] && o[k] != '0') consider(k, D.aliases[k] || k, o[k]);

	//named numeric properties (gem income, auras, resistances, ...)
	for (var i=0, k; k=D.other[i]; i++) {
		var v = fmtValue(o, k);
		if (v === null || v === '' || v == '0') continue;
		consider(k, D.aliases[k] || k, o[k], v);
	}

	//and whatever is left over, exactly as renderStrangeDetailsRows selects it
	for (var k in o) {
		if (seen[k] || skip[k] || D.ignorekeys[k] || D.aliases[k]) continue;
		var v = o[k];
		if (v === null || v === undefined || v === '' || v == '0') continue;
		if (typeof v == 'function' || typeof v == 'object') continue;
		consider(k, k, v);
	}

	return { icons: icons, text: text };
}

////////////////////////////////////////////////////////////////////////////
// weapon modifiers
//
// a weapon's modifier mask decodes to up to a dozen long phrases. spelling
// them all out under the weapon buries the two or three that matter, so they
// are split four ways:
//   - damage TYPES become a glyph beside the damage number
//   - a couple of modifiers ride next to the weapon name or the damage value
//   - a few are folded together or dropped
//   - whatever is left becomes a short tag
////////////////////////////////////////////////////////////////////////////

//damage types are drawn with the game's own art. the wiki files the ability
//list calls resist_pierce / resist_slash / resist_blunt (and the elemental
//ones) are pictures of the damage TYPE - a spear, a sword, a mace, a flame -
//so they read correctly here even though the wiki uses them for resistances.
//
//label -> [icon file stem, tooltip, sort order]
var DMG_TYPES = {
	'Piercing Damage':    ['resist_pierce', 'piercing damage',    1],
	'Slashing Damage':    ['resist_slash',  'slashing damage',    2],
	'Bludgeoning Damage': ['resist_blunt',  'bludgeoning damage', 3],
	'Heat/Fire':          ['resist_fire',   'fire damage',        4],
	'Chill/Cold':         ['resist_cold',   'cold damage',        5],
	'Shock':              ['resist_shock',  'shock damage',       6],
	'Poison':             ['resist_poison', 'poison damage',      7],
	'Acid Damage':        ['acid_damage',   'acid damage',        8],
	'Magic weapon':       ['magic_weapons', 'magic weapon',       9]
};

//shown next to the weapon name
var NAME_MODS = {
	'Requires Two Hands':        '2H',
	'Half Strength added':       '+Str/2',
	'One Third Strength added':  '+Str/3'
};
//shown next to the damage value
var DMG_MODS = {
	'Armor Piercing': 'AP',
	'Armor Negating': 'AN'
};
//not worth the space
var DROP_MODS = { 'Made of Iron': 1, 'Intrinsic Weapon': 1 };

//these four always travel together (every weapon carrying "Higher charge bonus
//cap" carries all four); together they are what a player calls a heavy lance
var HEAVY_LANCE = [
	'Intrinsic Weapon', 'Damage Bonus on 1st Attack',
	'Higher charge bonus cap', 'Cannot be used for repelling'
];

//everything else, shortened to fit on one line
var MOD_SHORT = {
	'Damage Bonus on 1st Attack':      'lance',
	'Strength not added to damage':    'no Str',
	'Natural Ranged Weapon':           'nat. ranged',
	'Cannot be repelled':              'unrepel',
	'Cannot be used for repelling':    'no-repel',
	'Higher charge bonus cap':         'charge+',
	'Ignores Shields':                 'no shield',
	'May Use Underwater':              'UW ok',
	'Used in melee too':               'melee too',
	'False Damage':                    'false dmg',
	'Internal Damage':                 'internal',
	'Defense Negate':                  'def neg',
	'Soul Slaying':                    'soul slay',
	'More likely to hit head':         'head shot',
	'Size or Strength negates':        'size/Str neg',
	'Magic Resistance Negates':        'MRN',
	'Magic Resistance Negates Easily': 'MRNE',
	'Magic Resistance Hard to Negate': 'MRNH',
	'MR check for Half Damage':        'MR/half',
	'No Effect on Mindless':           'no vs mindless',
	'No effect on Inanimate':          'no vs inanimate',
	'No Effect on Undead':             'no vs undead',
	'No effect on Demons':             'no vs demons',
	'No Effect on Fliers/Floaters':    'no vs fliers',
	'Affects Demons and Undead':       'vs demon/undead',
	'Affects Enemies Only':            'vs enemies',
	'Affects Sacreds Only':            'vs sacreds',
	'Affects Magic Beings Only':       'vs magic beings',
	'Affects Air Breathers Only':      'vs air breathers'
};

function dmgGlyph(icon, label) {
	var t = Utils.escapeHtml(label);
	return '<img class="nv-dmgicon" src="'+DMI.abilityIconPath+Utils.escapeHtml(icon)+'.png"'
		+ ' alt="'+t+'" title="'+t+'" width="14" height="14" loading="lazy" />';
}

//splits a weapon's modifiers into the four presentations described above
function weaponMods(w) {
	var labels = damageTags(w).map(function(t){ return String(t[0]).trim(); });

	var seen = {};
	var out = { glyphs: [], nameMods: [], dmgMods: [], tags: [] };

	var heavy = true;
	for (var i=0; i<HEAVY_LANCE.length; i++)
		if (labels.indexOf(HEAVY_LANCE[i]) == -1) { heavy = false; break; }
	if (heavy)
		for (var i=0; i<HEAVY_LANCE.length; i++) seen[HEAVY_LANCE[i]] = 1;

	//a lance implies it cannot repel, so "lance" alone says it
	if (labels.indexOf('Damage Bonus on 1st Attack') != -1)
		seen['Cannot be used for repelling'] = 1;

	var types = [];
	for (var i=0; i<labels.length; i++) {
		var L = labels[i];
		if (seen[L]) continue;
		seen[L] = 1;

		if (DROP_MODS[L])   continue;
		if (DMG_TYPES[L])   { types.push(DMG_TYPES[L]); continue; }
		if (NAME_MODS[L])   { out.nameMods.push(NAME_MODS[L]); continue; }
		if (DMG_MODS[L])    { out.dmgMods.push(DMG_MODS[L]); continue; }
		out.tags.push(MOD_SHORT[L] || L);
	}

	types.sort(function(a,b){ return a[2]-b[2]; });
	for (var i=0; i<types.length; i++) out.glyphs.push(dmgGlyph(types[i][0], types[i][1]));

	if (heavy) out.tags.unshift('heavy-lance');
	return out;
}

//MUnit's weapon/armour helpers assume a fully prepared unit and can trip over
//odd modded data; a card that renders "?" beats a card that fails to render
function MUnitSafe(fn, o, i) {
	try {
		var v = DMI.MUnit[fn](o, i);
		return (v === undefined || v === null) ? '' : v;
	}
	catch(e) { return ''; }
}

//damage-type tags per weapon are derived from a 64-bit mask; memoise so a
//long nation list does not redo the work for every shared weapon
var _dmgTagCache = {};
function damageTags(w) {
	if (!w || !w.id) return [];
	if (_dmgTagCache[w.id]) return _dmgTagCache[w.id];
	var tags = [];
	try { tags = DMI.MWpn.damageTags(w) || []; } catch(e) {}
	return (_dmgTagCache[w.id] = tags);
}

////////////////////////////////////////////////////////////////////////////
// mounts and co-riders
//
// a mounted unit stores its mount's id in `mountmnr` and, when two people ride
// the same beast, the other one in `coridermnr` (`nofriders` counts them all).
// the mount and the co-rider are separate units with their own stats, so the
// card carries one "face" per body: the rider, any co-riders, then the mount.
//
// they appear as a tab strip in the title at every width (see .nv-facebar);
// on a touchscreen the card can also be swiped sideways to move between them.
////////////////////////////////////////////////////////////////////////////
function mountFaces(u) {
	var faces = [{ unit: u, kind: 'rider', count: 1 }];

	if (u.coridermnr) {
		var cr = modctx.unitlookup[u.coridermnr];
		//nofriders counts every rider including this one
		if (cr) faces.push({ unit: cr, kind: 'co-rider',
			count: Math.max(1, (parseInt(u.nofriders) || 2) - 1) });
	}
	if (u.mountmnr && parseInt(u.mountmnr) > 0) {
		var mt = modctx.unitlookup[u.mountmnr];
		if (mt) faces.push({ unit: mt, kind: 'mount',
			count: parseInt(u.nofmounts) || 1 });
	}

	for (var i=1; i<faces.length; i++)
		DMI.MUnit.prepareForRender(faces[i].unit);		//stats and sprite urls

	return faces;
}

//"Moose x2" - the count only shown when there is more than one
function faceLabel(f) {
	var n = f.unit.fullname || f.unit.name || '?';
	return f.count > 1 ? n + ' ×' + f.count : n;
}

function renderCard(entry) {
	var u = entry.unit;
	var g = entry.group;
	var qual = qualifierOf(u.typechar, g);
	var esc = Utils.escapeHtml;

	//where the nation raises it - "forts", "capital", a terrain, "foreign".
	//a unit buildable several ways lists them all.
	var origin = entry.descriptors.length
		? entry.descriptors.map(esc).join(' &middot; ')
		: esc(groupLabel(g)) + (qual ? ' &middot; ' + esc(qual) : '');

	var faces = mountFaces(u);

	var h = '';
	//NB: deliberately a div, not a button. blink does not reliably grow a
	//<button> to fit flex/grid content, and this card is full of both - the
	//stat block and the weapon tables spill out of the bottom. role, tabindex
	//and the keydown handler give it the button behaviour back.
	h += '<div class="nv-card" data-uid="'+esc(u.id)+'" data-group="'+g+'"'
		+ ' data-cls="'+classOf(u)+'" role="button" tabindex="0">';
	h += '<span class="nv-card-inner">';

	//---- title bar -----------------------------------------------------
	h += '  <span class="nv-title">';
	//NB: no cmdr/mage badge - what kind of unit this is, is carried by the
	//card's colour (see data-cls and classOf)
	h += '    <span class="nv-name">'+esc(u.fullname || u.name)+'</span>';
	//worth the space in the title: it decides whether you can field one at all
	if (u.slow_to_recruit)
		h += '  <span class="nv-slow" title="slow to recruit - one every other turn">slow</span>';
	h += '    <span class="nv-origin">'+origin+'</span>';

	//the other bodies, as a swipe strip. hidden once the card is wide enough.
	if (faces.length > 1) {
		h += '  <span class="nv-facebar" role="tablist">';
		for (var i=0; i<faces.length; i++) {
			var f = faces[i];
			h += '<span class="nv-facechip'+(i===0 ? ' is-active' : '')+'"'
				+ ' data-face="'+i+'" role="tab" tabindex="-1"'
				+ ' aria-selected="'+(i===0 ? 'true' : 'false')+'"'
				+ ' title="'+esc(f.kind)+'">';
			if (f.unit.sprite && f.unit.sprite.url1)
				h += '<img src="'+esc(f.unit.sprite.url1)+'" alt="" loading="lazy" />';
			h += esc(faceLabel(f));
			h += '</span>';
		}
		h += '  </span>';
	}
	h += '  </span>';

	//---- one body per face ---------------------------------------------
	h += '  <span class="nv-faces">';
	for (var i=0; i<faces.length; i++)
		h += renderFace(faces[i], i === 0);
	h += '  </span>';

	h += '</span>';
	h += '</div>';
	return h;
}

//the stat panel and tables for one body
function renderFace(face, isRider) {
	var u = face.unit;
	var esc = Utils.escapeHtml;

	//stats shown in the block above must not repeat in the ability row
	var shown = { gcost:1, slow_to_recruit:1 };	//"basecost" duplicates Gold; "slow" is in the title
	var cols = [COL1, COL2, COL3, LEADERSHIP];
	for (var c=0; c<cols.length; c++)
		for (var i=0; i<cols[c].length; i++) shown[cols[c][i][0]] = 1;
	shown['mpath'] = 1;

	var h = '';
	h += '<span class="nv-face'+(isRider ? ' is-active' : '')+'" data-uid="'+esc(u.id)+'">';

	//---- dark panel: three stat columns, sprite, ability icons ----------
	h += '  <span class="nv-panel">';
	h += '    <img class="nv-spr" loading="lazy" alt="" src="'+esc((u.sprite && u.sprite.url1) || '')+'" />';

	h += '    <span class="nv-stats">';
	h += statColumn(u, COL1, true);
	h += statColumn(u, COL2, true);
	h += statColumn(u, COL3.concat(LEADERSHIP), false) || '<span class="nv-statcol"></span>';
	h += '    </span>';

	//magic paths sit with the abilities, as path icons
	var paths = pathsDisplay(u);
	var ab = abilityBlock(u, shown);

	if ((paths && paths !== '') || ab.icons.length || ab.text.length) {
		h += '  <span class="nv-abil">';
		if (paths && paths !== '')
			h += '<span class="nv-abpaths">'+paths+'</span>';
		h += ab.icons.join('');
		h += ab.text.join('');
		h += '  </span>';
	}
	h += '  </span>';

	//---- parchment panel: weapons and armour side by side --------------
	var hasW = u.weapons && u.weapons.length, hasA = u.armor && u.armor.length;
	if (hasW || hasA) {
		h += '  <span class="nv-tables">';

		if (hasW) {
		h += '    <span class="nv-tbl nv-wtbl">';
		h += '      <span class="nv-thead"><i class="nv-c0">Weapon</i><i>Len</i><i>Att</i><i>Dmg</i></span>';
		for (var w=0; w<u.weapons.length; w++) {
			var wp = u.weapons[w];
			var wm = weaponMods(wp);

			h += '<span class="nv-trow">';

			//the name truncates, the modifiers beside it must not
			h += '  <i class="nv-c0"><span class="nv-wname">'+esc(wp.name || '?')+'</span>';
			for (var m=0; m<wm.nameMods.length; m++)
				h += '<b class="nv-wmod">'+esc(wm.nameMods[m])+'</b>';
			h += '  </i>';

			h += '  <i>'+esc(MUnitSafe('getWpnLen', u, w))+'</i>';
			h += '  <i>'+esc(MUnitSafe('getWpnAtt', u, w))+'</i>';

			h += '  <i class="nv-dmgcell">';
			h += wm.glyphs.join('');
			h += esc(MUnitSafe('getWpnDmg', u, w));
			//NB: nratt is a count when positive, but a RELOAD interval when
			//negative (crossbows and arbalests) - "x-2" would read as nonsense
			var nratt = parseInt(wp.nratt);
			if (nratt > 1) h += '&times;'+nratt;
			for (var m=0; m<wm.dmgMods.length; m++)
				h += '<b class="nv-wmod">'+esc(wm.dmgMods[m])+'</b>';
			h += '  </i>';

			h += '</span>';

			if (nratt < 0)
				wm.tags.push('reload ' + Math.abs(nratt));

			if (wm.tags.length) {
				h += '<span class="nv-dtags">';
				for (var t=0; t<wm.tags.length; t++)
					h += '<span class="nv-dtag">'+esc(wm.tags[t])+'</span>';
				h += '</span>';
			}
		}
		h += '    </span>';
		}

		if (hasA) {
		h += '    <span class="nv-tbl nv-atbl">';
		h += '      <span class="nv-thead"><i class="nv-c0">Armor</i><i>Prt</i><i>Def</i><i>Par</i><i>Enc</i></span>';
		for (var a=0; a<u.armor.length; a++) {
			var ar = u.armor[a];
			h += '<span class="nv-trow">';
			h += '  <i class="nv-c0">'+esc(ar.name || '?')+'</i>';
			h += '  <i>'+esc(MUnitSafe('getArmorProt', u, a))+'</i>';
			h += '  <i>'+esc(ar.def || '0')+'</i>';
			h += '  <i>'+esc(MUnitSafe('getArmorParry', u, a))+'</i>';
			h += '  <i>'+esc(ar.enc || '0')+'</i>';
			h += '</span>';
		}
		h += '    </span>';
		}

		h += '  </span>';
	}

	h += '</span>';
	return h;
}

function groupLabel(key) {
	for (var i=0; i<GROUPS.length; i++) if (GROUPS[i].key == key) return GROUPS[i].label;
	return key;
}


////////////////////////////////////////////////////////////////////////////
// the view
//
// duck-types the interface main.js expects of a page (show/hide/showIds/
// detachShowingDetails) so it can live in the DMI.pages registry alongside
// the slickgrid pages, without either knowing about the other.
////////////////////////////////////////////////////////////////////////////

MNationView.View = function() {

	var that = this;
	var $page = $('#nation-page');
	var isVisible = false;

	var nation = null;			//currently selected nation
	var units = [];				//its units, sorted
	var hidden = {};			//group key -> true when its chip is off
	var hiddenDesc = {};		//recruitment descriptor -> true when its chip is off
	var filter = '';			//name filter

	for (var i=0; i<GROUPS.length; i++)
		if (GROUPS[i].offByDefault) hidden[GROUPS[i].key] = true;

	////////////////////////////////////////////////////////////////////////
	// skeleton
	//
	// appended, not assigned: #nation-page also holds the hidden input that
	// carries the chosen nation into the permalink.
	// .nv-shared is where the app's shared header (page tabs, permalink,
	// mod status) gets parked while this page is on screen - the grid pages
	// move that same element into themselves, see CGrid.show().
	////////////////////////////////////////////////////////////////////////
	$page.append(
		'<div class="nv-root">' +
		'  <div class="nv-shared"></div>' +
		'  <div class="nv-bar">' +
		'    <button class="nv-nation-btn" type="button"><span class="nv-nation-name">Choose a nation</span><span class="nv-caret">&#9662;</span></button>' +
		'    <input class="nv-search" type="search" placeholder="filter by name" autocomplete="off" />' +
		'  </div>' +
		'  <div class="nv-chips"></div>' +
		'  <div class="nv-chips nv-dchips" style="display:none"></div>' +
		'  <div class="nv-list"></div>' +
		'  <div class="nv-empty" style="display:none"></div>' +
		'</div>' +
		'<div class="nv-picker" style="display:none">' +
		'  <div class="nv-picker-bar">' +
		'    <input class="nv-picker-search" type="search" placeholder="search nations" autocomplete="off" />' +
		'    <button class="nv-close" type="button" aria-label="close">&times;</button>' +
		'  </div>' +
		'  <div class="nv-picker-list"></div>' +
		'</div>' +
		'<div class="nv-sheet" style="display:none">' +
		'  <div class="nv-sheet-bar">' +
		'    <button class="nv-back" type="button" style="display:none">&#8249; back</button>' +
		'    <button class="nv-close" type="button" aria-label="close">&times;</button>' +
		'  </div>' +
		'  <div class="nv-sheet-body"></div>' +
		'</div>'
	);

	var $list   = $page.find('.nv-list');
	var $chips  = $page.find('.nv-chips').not('.nv-dchips');
	var $dchips = $page.find('.nv-dchips');
	var $empty  = $page.find('.nv-empty');
	var $picker = $page.find('.nv-picker');
	var $sheet  = $page.find('.nv-sheet');

	////////////////////////////////////////////////////////////////////////
	// nation picker
	////////////////////////////////////////////////////////////////////////
	function buildPicker() {
		var eras = nationsByEra();
		var h = '';
		for (var i=0; i<eras.length; i++) {
			h += '<div class="nv-era">'+Utils.escapeHtml(eras[i].name)+'</div>';
			for (var j=0, n; n=eras[i].nations[j]; j++) {
				h += '<button class="nv-nation-row" type="button" data-nid="'+Utils.escapeHtml(n.id)+'">';
				h += '  <span class="nv-era-tag">'+Utils.escapeHtml(n.eracode)+'</span>';
				h += '  <span class="nv-nation-title">'+Utils.escapeHtml(n.name)+'</span>';
				h += '  <span class="nv-nation-sub">'+Utils.escapeHtml(n.epithet||'')+'</span>';
				h += '</button>';
			}
		}
		$page.find('.nv-picker-list').html(h);
	}

	function openPicker() {
		$picker.show();
		$page.find('.nv-picker-search').val('').focus();
		filterPicker('');
	}
	function closePicker() { $picker.hide(); }

	function filterPicker(q) {
		q = String(q||'').toLowerCase();
		$page.find('.nv-nation-row').each(function(){
			var $r = $(this);
			var txt = $r.text().toLowerCase();
			$r.toggle(!q || txt.indexOf(q) != -1);
		});
		//hide era headings with nothing under them
		$page.find('.nv-era').each(function(){
			var $h = $(this), any = false;
			$h.nextUntil('.nv-era').each(function(){ if ($(this).is(':visible')) any = true; });
			$h.toggle(any);
		});
	}

	////////////////////////////////////////////////////////////////////////
	// detail sheet (a stack, so refs inside a card drill down and come back)
	////////////////////////////////////////////////////////////////////////
	var sheetStack = [];

	function openSheet(ref) {
		sheetStack = [];
		pushSheet(ref);
		$sheet.show();
	}
	function pushSheet(ref) {
		var html = PaneManager.renderPane(ref, true);
		if (!html) return;
		sheetStack.push(ref);
		$page.find('.nv-sheet-body').html(html).scrollTop(0);
		$page.find('.nv-back').toggle(sheetStack.length > 1);
	}
	function popSheet() {
		sheetStack.pop();
		var ref = sheetStack.pop();
		if (ref) pushSheet(ref);
		else closeSheet();
	}
	function closeSheet() { $sheet.hide(); sheetStack = []; }

	////////////////////////////////////////////////////////////////////////
	// main list
	////////////////////////////////////////////////////////////////////////
	function selectNation(n) {
		nation = n;
		units = n ? unitsForNation(n) : [];

		$page.find('.nv-nation-name').text(n ? n.fullname : 'Choose a nation');

		//remember for the permalink / cookie
		$('#nv-nation').val(n ? n.id : '').saveState();

		renderChips();
		renderList();
	}

	//counts per group, for the chips
	function counts() {
		var c = {};
		for (var i=0, e; e=units[i]; i++)
			c[e.group] = (c[e.group]||0) + 1;
		return c;
	}

	//counts per recruitment descriptor. a unit buildable two ways counts under
	//both, which is what makes "how much can I raise in forest" answerable.
	function descriptorCounts() {
		var c = {};
		for (var i=0, e; e=units[i]; i++) {
			if (e.group != 'recruit') continue;
			for (var j=0, d; d=e.descriptors[j]; j++) c[d] = (c[d]||0) + 1;
		}
		return c;
	}

	//a recruit is hidden only when EVERY place it can be raised is switched off:
	//turning off "forest" should not hide a troop you can also build in forts.
	function descriptorHidden(e) {
		if (e.group != 'recruit' || !e.descriptors.length) return false;
		for (var i=0, d; d=e.descriptors[i]; i++)
			if (!hiddenDesc[d]) return false;
		return true;
	}

	function renderChips() {
		var c = counts();
		var h = '';
		for (var i=0, G; G=GROUPS[i]; i++) {
			if (!c[G.key]) continue;
			h += '<button class="nv-chip'+(hidden[G.key]?' nv-off':'')+'" type="button"' +
				 ' data-group="'+G.key+'"' +
				 ' title="'+Utils.escapeHtml(G.hint||G.label)+'">' +
				 '<span class="nv-swatch"></span>' +
				 Utils.escapeHtml(G.label) +
				 '<span class="nv-count">'+c[G.key]+'</span>' +
				 '</button>';
		}
		$chips.html(h);

		//second row: where the nation raises them. only meaningful while the
		//recruitable section is on screen.
		var dc = descriptorCounts();
		var dh = '';
		if (!hidden['recruit']) {
			for (var i=0, d; d=DESCRIPTOR_ORDER[i]; i++) {
				if (!dc[d]) continue;
				dh += '<button class="nv-chip nv-dchip'+(hiddenDesc[d]?' nv-off':'')+'" type="button"' +
					  ' data-desc="'+Utils.escapeHtml(d)+'">' +
					  Utils.escapeHtml(d) +
					  '<span class="nv-count">'+dc[d]+'</span>' +
					  '</button>';
			}
		}
		$dchips.html(dh).toggle(!!dh);
	}

	function renderList() {
		if (!nation) {
			$list.html('');
			$empty.show().text('Pick a nation to see everything it can field.');
			return;
		}

		var q = filter.toLowerCase();
		var h = '';
		var shown = 0;
		var lastGroup = null;

		for (var i=0, e; e=units[i]; i++) {
			var g = e.group;
			if (hidden[g]) continue;
			if (descriptorHidden(e)) continue;
			if (q && String(e.unit.searchable||e.unit.name||'').toLowerCase().indexOf(q) == -1) continue;

			if (g != lastGroup) {
				h += '<div class="nv-group-head" data-group="'+g+'">'+Utils.escapeHtml(groupLabel(g))+'</div>';
				lastGroup = g;
			}
			h += renderCard(e);
			shown++;
		}

		$list.html(h);
		if (shown) $empty.hide();
		else $empty.show().text(q ? 'Nothing matches "'+filter+'".' : 'Every category is switched off.');
	}

	////////////////////////////////////////////////////////////////////////
	// events
	////////////////////////////////////////////////////////////////////////
	$page.on('click', '.nv-nation-btn', openPicker);
	$page.on('click', '.nv-picker .nv-close', closePicker);
	$page.on('input', '.nv-picker-search', function(){ filterPicker(this.value); });

	$page.on('click', '.nv-nation-row', function(){
		var n = modctx.nationlookup[ $(this).attr('data-nid') ];
		if (n) selectNation(n);
		closePicker();
	});

	$page.on('input', '.nv-search', function(){
		filter = this.value;
		renderList();
	});

	$page.on('click', '.nv-chip', function(){
		var $c = $(this);
		var d = $c.attr('data-desc');

		if (d !== undefined) {						//a descriptor chip
			if (hiddenDesc[d]) delete hiddenDesc[d]; else hiddenDesc[d] = true;
			$c.toggleClass('nv-off', !!hiddenDesc[d]);
			renderList();
			return;
		}

		var g = $c.attr('data-group');
		if (hidden[g]) delete hidden[g]; else hidden[g] = true;
		$c.toggleClass('nv-off', !!hidden[g]);

		//the descriptor row belongs to the recruitable section
		if (g == 'recruit') renderChips();
		renderList();
	});

	////////////////////////////////////////////////////////////////////////
	// faces: a mounted unit's rider, co-riders and mount share one card
	////////////////////////////////////////////////////////////////////////
	function setFace($card, n) {
		var $faces = $card.find('.nv-faces').children('.nv-face');
		if (!$faces.length) return;
		n = (n + $faces.length) % $faces.length;
		$faces.removeClass('is-active').eq(n).addClass('is-active');
		$card.find('.nv-facechip').removeClass('is-active').attr('aria-selected','false')
			.eq(n).addClass('is-active').attr('aria-selected','true');
	}
	function activeFaceIndex($card) {
		var i = $card.find('.nv-faces').children('.nv-face').index($card.find('.nv-face.is-active'));
		return i < 0 ? 0 : i;
	}
	//the uid of whichever body is on screen, so tapping opens the right unit
	function activeUid($card) {
		var $f = $card.find('.nv-face.is-active');
		return ($f.length && $f.attr('data-uid')) || $card.attr('data-uid');
	}

	$page.on('click', '.nv-facechip', function(e){
		setFace($(this).closest('.nv-card'), parseInt($(this).attr('data-face')) || 0);
		e.stopPropagation();			//don't also open the detail sheet
	});

	//horizontal swipe cycles the faces. a mostly-vertical drag is the user
	//scrolling the list, so leave it alone.
	var swipeX = null, swipeY = null, swipedAt = 0;
	$page.on('touchstart', '.nv-card', function(e){
		var t = e.originalEvent.touches[0];
		swipeX = t.clientX; swipeY = t.clientY;
	});
	$page.on('touchend', '.nv-card', function(e){
		if (swipeX === null) return;
		var t = e.originalEvent.changedTouches[0];
		var dx = t.clientX - swipeX, dy = t.clientY - swipeY;
		swipeX = swipeY = null;

		if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

		var $card = $(this);
		if ($card.find('.nv-faces').children('.nv-face').length < 2) return;

		setFace($card, activeFaceIndex($card) + (dx < 0 ? 1 : -1));
		swipedAt = Date.now();			//suppress the click this generates
	});

	$page.on('click', '.nv-card', function(){
		if (Date.now() - swipedAt < 500) return;
		openSheet('unit ' + activeUid($(this)));
	});
	//the card is a div (see renderCard), so give it back the keyboard
	//activation a real button would have had
	$page.on('keydown', '.nv-card', function(e){
		//left/right also cycle the faces, for keyboard and desktop users
		var $card = $(this);
		if (e.which == 37 || e.which == 39) {
			if ($card.find('.nv-faces').children('.nv-face').length < 2) return;
			setFace($card, activeFaceIndex($card) + (e.which == 39 ? 1 : -1));
			e.preventDefault();
			return;
		}
		if (e.which != 13 && e.which != 32) return;
		openSheet('unit ' + activeUid($card));
		e.preventDefault();
	});

	//refs inside the sheet drill down in place rather than spawning a
	//draggable window - there is nowhere to drag to on a phone
	$page.on('click', '.nv-sheet a.ref', function(e){
		var ref = $(this).find('input').val();
		if (ref) pushSheet(ref);
		e.preventDefault();
		return false;
	});
	$page.on('click', '.nv-sheet .nv-close', closeSheet);
	$page.on('click', '.nv-back', popSheet);

	//escape closes the topmost layer
	$page.on('keydown', function(e){
		if (e.which != 27) return;
		if ($sheet.is(':visible')) closeSheet();
		else if ($picker.is(':visible')) closePicker();
	});

	////////////////////////////////////////////////////////////////////////
	// page interface (see DMI.pages in main.js)
	////////////////////////////////////////////////////////////////////////
	this.show = function() {
		if (isVisible) return;
		isVisible = true;

		$page.show();

		//first visit with nothing chosen: go straight to the picker, there is
		//nothing else to look at
		if (!nation) openPicker();

		//take custody of the shared header, and hide the grid filter panels -
		//they belong to the slickgrid pages, not to this one
		$page.find('.nv-shared').append($('#primary-details'));
		$('#primary-details div.panel').hide();
	}
	this.hide = function() {
		if (!isVisible) return;
		isVisible = false;
		$page.hide();
	}
	//no id column to toggle, and no hover-preview to detach
	this.showIds = function() {}
	this.detachShowingDetails = function() {}

	////////////////////////////////////////////////////////////////////////
	// init
	////////////////////////////////////////////////////////////////////////
	buildPicker();

	//restore the nation from the permalink / cookie. if there isn't one, show()
	//opens the picker.
	var saved = $('#nv-nation').val();
	if (saved && modctx.nationlookup[saved])
		selectNation(modctx.nationlookup[saved]);
	else
		renderList();
}

//namespace args
}( window.DMI = window.DMI || {}, jQuery ));
