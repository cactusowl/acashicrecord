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

// the first four and the last two hold units; `spell` and `item` hold the
// nation's own spells and its restricted / discounted items. every section is
// a list of cards of the same shape, whatever kind of thing is on them.
var GROUPS = [
	{ key:'recruit',   label:'Recruitable',   hint:'built in a province you hold' },
	{ key:'site',      label:'Magic site',    hint:'unlocked by owning a site' },
	{ key:'hero',      label:'Heroes',        hint:'arrive through luck events' },
	{ key:'summon',    label:'Summons',       hint:'called with a national spell' },
	{ key:'spell',     label:'Spells',        hint:'spells only this nation can research' },
	{ key:'item',      label:'Items',         hint:'items only this nation can forge, and items it forges cheaply' },
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
//each entry is { kind:'unit', obj, group, descriptors[] }.
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
			e = byKey[key] = { kind:'unit', obj: u, group: group, descriptors: [] };
			entries.push(e);
		}
		var d = descriptorOf(u.typechar);
		if (d && e.descriptors.indexOf(d) == -1) e.descriptors.push(d);
	}

	for (var i=0, e; e=entries[i]; i++)
		e.descriptors.sort(function(a,b){
			return DESCRIPTOR_ORDER.indexOf(a) - DESCRIPTOR_ORDER.indexOf(b);
		});

	return entries;
}

////////////////////////////////////////////////////////////////////////////
// national spells
//
// MSpell hands each spell it finds a nation attribute for (or that the nation
// reaches through its home realm) straight to that nation as nation.spells,
// and then deletes spell.nations - so the nation's own list is the only place
// the association survives. `notnations` is the counterpart: a spell a nation
// would otherwise get through its realm, but is explicitly denied.
//
// the summoning spells here overlap the Summons section, which lists the units
// they call. that is deliberate: one answers "what can I summon", the other
// "what does it cost me to summon it".
//
// UNRESEARCHABLE spells (school -1) are left out. A player can never cast one
// deliberately: it is either debris, or a link in a nextspell chain - the way
// "summons all of the following" is built, where the castable spell summons the
// first thing and each unresearchable link adds the next. Those links are
// picked up as tabs on the spell that does the casting, see summonFaces.
////////////////////////////////////////////////////////////////////////////
function spellsForNation(nation) {
	var entries = [], seen = {};

	for (var i=0, s; s=(nation.spells||[])[i]; i++) {
		if (!s || seen[s.id]) continue;
		if (s.notnations && s.notnations[nation.id]) continue;
		if (String(s.school) == '-1') continue;
		seen[s.id] = 1;

		entries.push({ kind:'spell', obj:s, group:'spell',
			descriptors: [ String(s.type||'').toLowerCase() || 'spell' ] });
	}
	return entries;
}

////////////////////////////////////////////////////////////////////////////
// national items
//
// two different things, both worth knowing and both listed here:
//   restricted - only this nation can forge it at all
//   discount   - anyone can forge it, this nation pays less
// an item can be both, so the descriptors are a list as they are for recruits.
////////////////////////////////////////////////////////////////////////////

//item.restricted / item.nationrebate hold nation ids that may be strings or
//numbers depending on which prepare pass ran first, so compare loosely
function listHas(arr, id) {
	for (var i=0; arr && i<arr.length; i++) if (arr[i] == id) return true;
	return false;
}

function itemsForNation(nation) {
	var entries = [];

	for (var i=0, o; o=modctx.itemdata[i]; i++) {
		var d = [];
		if (listHas(o.restricted, nation.id))    d.push('restricted');
		if (listHas(o.nationrebate, nation.id))  d.push('discount');
		if (!d.length) continue;

		entries.push({ kind:'item', obj:o, group:'item', descriptors:d });
	}
	return entries;
}

//everything the nation has, of every kind, in display order
function entriesForNation(nation) {
	var entries = unitsForNation(nation)
		.concat(spellsForNation(nation))
		.concat(itemsForNation(nation));

	entries.sort(function(a,b){
		var ga = groupIndex(a.group), gb = groupIndex(b.group);
		if (ga != gb) return ga - gb;
		return withinGroup(a, b);
	});
	return entries;
}

//ordering inside one section. the sections do not mix kinds, so a and b are
//always the same kind here.
function withinGroup(a, b) {
	if (a.kind == 'spell') {
		var d = (parseInt(a.obj.school) || 0) - (parseInt(b.obj.school) || 0);
		if (d) return d;
		d = (parseInt(a.obj.researchlevel) || 0) - (parseInt(b.obj.researchlevel) || 0);
		if (d) return d;
		return byName(a, b);
	}
	if (a.kind == 'item') {
		var d = (parseInt(a.obj.constlevel) || 0) - (parseInt(b.obj.constlevel) || 0);
		if (d) return d;
		return byName(a, b);
	}

	//sorttype already encodes a sensible cmdr/mage/unit ordering
	var sa = a.obj.sorttype || 'zzz', sb = b.obj.sorttype || 'zzz';
	if (sa != sb) return sa < sb ? -1 : 1;

	return (parseInt(a.obj.goldcost)||0) - (parseInt(b.obj.goldcost)||0);
}

function byName(a, b) {
	var na = a.obj.name || '', nb = b.obj.name || '';
	return na < nb ? -1 : na > nb ? 1 : 0;
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
	['hp','Hit points'], ['size','Size'],
	['mr','Magic Resistance'], ['mor','Morale']
];

//gold heads the block, and where there is a cap on how many you may raise in a
//turn it belongs beside the price rather than as a line of its own.
function goldRow(u, D) {
	var v = fmtValue(u, 'goldcost', D);
	if (v === null || v === '' || isNotANumber(v)) return '';

	//a NEGATIVE cap means the unit is only recruitable while a particular
	//ritual is active, which varies by nation - so it is named as special
	//rather than given a number
	var lim = parseInt(u.reclimit);
	var note = lim > 0 ? '(limit '+lim+'/turn)'
	         : lim < 0 ? '(special)' : '';

	return litRow('Gold', String(v).trim()
		+ (note ? ' <span class="nv-ldrx" title="'
			+ (lim < 0 ? 'only recruitable while a specific ritual is active'
			           : 'how many may be raised in a turn')
			+ '">'+note+'</span>' : ''));
}

////////////////////////////////////////////////////////////////////////////
// telling apart units that share a name
//
// 557 names are shared by more than one unit - 1574 units in all. Three
// Sorginas, five Heavy Infantry, six Infantry of Ulm. A list of cards that
// repeats a name with no way to tell which is which is close to useless, so
// each gets a parenthetical:
//
//   by NATION      where the units belong to different nations and each names
//                  four or fewer of them: "Sorgina (EA Pyrene)"
//   by EQUIPMENT   where the nation does not separate them - same nation, or
//                  none at all: "Heavy Infantry (broad sword/shield)"
//   by NOTHING     where neither does. The nine Daughters of Typhon differ
//                  only in how wounded they are, and that is what the shrink
//                  tabs are for.
//
// Computed once per name, and only for names that are actually shared.
////////////////////////////////////////////////////////////////////////////
var _nameGroups = null;
var _disambig = {};			//floor(id) -> label, '' for none

function nameGroups() {
	if (_nameGroups) return _nameGroups;

	_nameGroups = {};
	for (var i=0, u; u=modctx.unitdata[i]; i++) {
		//the fractional ids are clones of a unit, not another unit
		if (Math.floor(u.id) != u.id) continue;
		if (!u.name || u.name === 'Empty') continue;
		(_nameGroups[u.name] || (_nameGroups[u.name] = [])).push(u);
	}
	return _nameGroups;
}

//the nations that field it, while there are few enough to name
function nationLabel(u) {
	var ns = [];
	for (var k in (u.nations || {})) {
		var n = u.nations[k];
		if (n && n.shortname) ns.push(n.shortname);
		if (ns.length > 4) return '';
	}
	return ns.length ? ns.join(', ') : '';
}

//what it is carrying - which is what separates one Infantry of Ulm from the next
function equipLabel(u) {
	try { DMI.MUnit.prepareForRender(u); } catch(e) { return ''; }

	var bits = [];
	for (var i=0, w; w=(u.weapons||[])[i]; i++) {
		if (!w || !w.name) continue;
		var n = String(w.name).toLowerCase();
		if (bits.indexOf(n) == -1) bits.push(n);
		if (bits.length >= 3) break;
	}
	for (var i=0, a; a=(u.armor||[])[i]; i++)
		if (a && a.type == 'shield') { bits.push('shield'); break; }

	return bits.join('/');
}

function disambiguator(u) {
	var key = Math.floor(u.id);
	if (_disambig[key] !== undefined) return _disambig[key];

	var group = nameGroups()[u.name] || [];
	if (group.length < 2) return (_disambig[key] = '');

	//nations first; equipment wherever they do not separate the units
	var i, g, byNat = {};
	for (i=0; g=group[i]; i++) {
		var l = nationLabel(g);
		(byNat[l] || (byNat[l] = [])).push(g);
	}

	var label = {}, used = {};
	for (i=0; g=group[i]; i++) {
		var l = nationLabel(g);
		var lab = (l && byNat[l].length == 1) ? l : equipLabel(g);
		label[Math.floor(g.id)] = lab;
		used[lab] = (used[lab] || 0) + 1;
	}

	//a label two of them share tells them apart no better than none does
	for (i=0; g=group[i]; i++) {
		var k = Math.floor(g.id);
		_disambig[k] = (used[label[k]] > 1) ? '' : label[k];
	}
	return _disambig[key] || '';
}


////////////////////////////////////////////////////////////////////////////
// what a summoned creature costs
//
// A price of zero means it is not bought, and for 511 units that is because a
// ritual calls it up instead. What that ritual costs is the figure a player
// actually weighs, so it takes the gold line's place:
//
//     Cost 20 <D gem> / 5 (Conj3, 2 <D path>)
//
// gems to cast it once / how many arrive (left off when it is one), then the
// school and research level, then what paths the caster needs. The ritual's
// name is the row's tooltip.
//
// Where several rituals summon the same creature - 50 units - the one a player
// reaches first is shown: lowest research level, then cheapest.
////////////////////////////////////////////////////////////////////////////
var SCHOOL_SHORT = {
	'-1':'', '0':'Conj', '1':'Alt', '2':'Evo', '3':'Cons',
	'4':'Ench', '5':'Thaum', '6':'Blood', '7':'Divine'
};

function pathGlyph(p) {
	var e = Utils.escapeHtml(p);
	return '<span class="pathicon Path_'+e+'">'+e+'</span>';
}

//"2 <death>" or "1 <water> 1 <glamour>", in the spell's own path order
function pathReq(sp) {
	var out = [];
	if (sp.path1 && sp.pathlevel1) out.push(sp.pathlevel1 + pathGlyph(sp.path1));
	if (sp.path2 && sp.pathlevel2) out.push(sp.pathlevel2 + pathGlyph(sp.path2));
	return out.join(' ');
}

//one line per ritual, cheapest to reach first: several rituals often call up
//the same creature at different prices, and which you can afford is the point
function summonCostRows(u) {
	if (parseInt(u.goldcost)) return '';			//it is bought, not called up

	var spells = [];
	for (var i=0, sp; sp=(u.summonedby||[])[i]; i++) {
		if (!sp || spells.indexOf(sp) != -1) continue;
		//an unresearchable spell is a link in a chain, not something a player
		//can choose to cast - it has no cost, school or paths to report
		if (String(sp.school) == '-1') continue;
		spells.push(sp);
	}

	spells.sort(function(a,b){
		var d = (parseInt(a.researchlevel)||0) - (parseInt(b.researchlevel)||0);
		return d ? d : (parseInt(a.gemcost)||0) - (parseInt(b.gemcost)||0);
	});

	var h = '';
	for (var i=0; i<spells.length; i++) h += summonCostRow(spells[i]);
	return h;
}

function summonCostRow(sp) {
	var bits = [];
	var school = SCHOOL_SHORT[String(sp.school)];
	if (school) bits.push(school + (sp.researchlevel || ''));

	var paths = pathReq(sp);
	if (paths) bits.push(paths);

	//summonCount goes through MSpell.spellBonus, so a figure that grows with
	//the caster's path keeps the legacy view's "+" notation - 17+++, 10+ [5/lvl]
	var n = summonCount(sp);
	var h = (sp.gemcost ? Format.Gems(sp.gemcost) : '')
		+ ((n && n != '1' && n != '0') ? ' / ' + Utils.escapeHtml(n) : '')
		+ (bits.length ? ' <span class="nv-ldrx">(' + bits.join(', ') + ')</span>' : '');

	return litRow('Cost', $.trim(h), sp.name);
}

////////////////////////////////////////////////////////////////////////////
// protection
//
// The game gives one number, and the inspector's own overlay does too - the
// pieces survive there only inside a tooltip. But a player reasons with two of
// them: how tough the creature is of itself, and where that lands once its
// armour is on.
//
//     Protection      7 <pelt> 21 <helm> 18 <plate>
//     ... vs mundane           25 <helm> 25 <plate>
//
// Armour is worth less the tougher the hide beneath it, which is why the total
// is not a sum - see the formula in MUnit.
//
// The second line appears only for an invulnerable creature. Invulnerability
// is a floor on protection against mundane weapons, so it is shown as the
// higher of the two per location.
////////////////////////////////////////////////////////////////////////////
function protIcon(stem, name) {
	var t = Utils.escapeHtml(name);
	return '<img class="nv-ldricon" src="'+DMI.abilityIconPath+stem+'.png"'
		+ ' alt="'+t+'" title="'+t+'" width="14" height="14" loading="lazy" />';
}

function protRow(u) {
	var nat = parseInt(u.prot_nat) || 0;
	var th  = parseInt(u.prot_head) || 0, tb = parseInt(u.prot_body) || 0;

	var parts = [];
	if (nat) parts.push(nat + protIcon('prot_natural', 'natural protection'));
	if (th || tb)
		parts.push(th + protIcon('prot_head', 'protection, head') + ' ' +
		           tb + protIcon('prot_body', 'protection, body'));

	//no hide of its own and nothing worn: there is still a figure to give
	if (!parts.length) parts.push(String(parseInt(u.prot) || 0));

	return litRow('Protection', parts.join(' '));
}

function mundaneRow(u) {
	var inv = parseInt(u.invulnerable) || 0;
	if (!inv) return '';

	var nat = parseInt(u.prot_nat) || 0;
	var th  = parseInt(u.prot_head) || nat;
	var tb  = parseInt(u.prot_body) || nat;

	//the label is elided so the two lines line up under one another
	return litRow('... vs mundane',
		Math.max(th, inv) + protIcon('prot_head', 'protection, head') + ' ' +
		Math.max(tb, inv) + protIcon('prot_body', 'protection, body'));
}

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

////////////////////////////////////////////////////////////////////////////
// leadership
//
// Only a commander leads anything, so the figure is left off everything else -
// on a rank-and-file troop it is three lines saying nothing.
//
// A commander always shows it, zero included: "can lead nobody" is worth
// knowing. The two special kinds go in brackets after it under their own
// icons, which keeps one line where there were three:
//
//     Leadership 150 (<magic> 100 <undead> 50)
////////////////////////////////////////////////////////////////////////////
var LEADERSHIP = [
	['leader','Leadership'], ['undeadleader','Undead Ldr'], ['magicleader','Magic Ldr']
];

function ldrIcon(stem, name) {
	var t = Utils.escapeHtml(name);
	return '<img class="nv-ldricon" src="'+DMI.abilityIconPath+stem+'.png"'
		+ ' alt="'+t+'" title="'+t+'" width="14" height="14" loading="lazy" />';
}

function leadershipRow(u) {
	if (roleOf(u) == 'unit') return '';

	var extra = [];
	var mag = parseInt(u.magicleader) || 0;
	var und = parseInt(u.undeadleader) || 0;
	if (mag) extra.push(ldrIcon('magic_being', 'magic beings') + mag);
	if (und) extra.push(ldrIcon('undead', 'undead') + und);

	return litRow('Leadership', (parseInt(u.leader) || 0)
		+ (extra.length ? ' <span class="nv-ldrx">(' + extra.join(' ') + ')</span>' : ''));
}

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

////////////////////////////////////////////////////////////////////////////
// display tables
//
// each module exports the alias/format tables its own detail overlay uses, so
// a card can format a value exactly as the overlay does. the shapes differ
// slightly (a unit's properties are spread over several ordered lists), so
// they are normalised here to the two lists the card code wants:
//   flags - boolean abilities
//   other - named properties carrying a value
////////////////////////////////////////////////////////////////////////////
var _display = {};

function displayFor(kind) {
	if (_display[kind]) return _display[kind];

	var D, out;
	if (kind == 'item') {
		D = DMI.MItem.display;
		out = { aliases:D.aliases, formats:D.formats, flags:D.flags,
		        other:D.main, ignorekeys:D.ignorekeys, preferFormatted:true };
	}
	else if (kind == 'spell') {
		D = DMI.MSpell.display;
		//a spell's boolean specials live in the effect bitfield, not in flag
		//keys, and are rendered from it directly - see spellMods()
		out = { aliases:D.aliases, formats:D.formats, flags:[],
		        other:D.main, ignorekeys:D.ignorekeys, preferFormatted:true };
	}
	else {
		D = DMI.MUnit.display;
		out = { aliases:D.aliases, formats:D.formats, flags:D.flags,
		        other:D.other, ignorekeys:D.ignorekeys };
	}
	return (_display[kind] = out);
}

function fmtValue(o, key, D) {
	D = D || displayFor('unit');
	var v = o[key];
	if (v === undefined || v === null || v === '') return null;

	var f = D.formats[key];
	if (f && typeof f == 'function') return f(v, o);		//formatter returns html
	if (f && f[v] !== undefined)     return f[v];
	return Utils.escapeHtml(v);
}

//a figure the data layer could not work out. mods reach parts of the data the
//formatters were not written for, and NaN is not information - "magicboost_G
//NaN" on a card is worse than saying nothing.
function isNotANumber(v) {
	if (typeof v == 'number') return isNaN(v);
	if (typeof v != 'string') return false;
	return v.trim() == 'NaN';
}

//one "Label ....... value" line of the stat block.
//`force` keeps a zero visible, as the game card does for the core stats; a
//property the unit simply does not have is still skipped.
function statRow(o, key, label, force, D) {
	//test the stored value as well as the formatted one: a formatter that
	//appends to its argument turns NaN into "NaN-", which no longer looks
	//like a number that failed to compute
	if (isNotANumber(o[key])) return '';

	var v = fmtValue(o, key, D);
	if (v === null || v === '') return '';
	if (isNotANumber(v)) return '';
	if (!force && v == '0') return '';
	return '<span class="nv-stat"><i>'+Utils.escapeHtml(label)+'</i><b>'+String(v).trim()+'</b></span>';
}

//`extra` is already-built rows to append to the column - see litRow
function statColumn(o, rows, force, D, extra, lead) {
	var h = lead || '';
	for (var i=0; i<rows.length; i++) h += statRow(o, rows[i][0], rows[i][1], force, D);
	h += extra || '';
	return h ? '<span class="nv-statcol">'+h+'</span>' : '';
}

//a stat whose value is html we have already built (path icons, gem icons)
function litRow(label, html, title) {
	if (html === null || html === undefined || html === '') return '';
	if (isNotANumber(html)) return '';
	return '<span class="nv-stat"'
		+ (title ? ' title="'+Utils.escapeHtml(title)+'"' : '')
		+ '><i>'+Utils.escapeHtml(label)+'</i><b>'+html+'</b></span>';
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

//the shapes and dominion summons are tabs of their own - see OTHER_BODIES,
//declared further down, which fills this in
var OTHER_BODY_KEYS = {};

////////////////////////////////////////////////////////////////////////////
// default and advanced
//
// the default card shows what is neither obvious nor minor, and says as much
// of it as it can in icons. advanced shows everything the detail overlay would.
//
// this rides on the app's existing "advanced" checkbox in the header - the one
// that also turns on ids and modder detail - rather than adding a second
// switch that could disagree with it.
////////////////////////////////////////////////////////////////////////////
function isAdvanced() { return !!DMI.Options['Show ids']; }

//true of most units, or a detail that never decides anything: worth a chip
//only when you have asked to see everything
var ADVANCED_ONLY = {
	//three separate keys all print as "guardian spirit"
	guardspiritbonus: 1,
	guardspirit: 1,
	guardianspiritmodifier: 1,
	female: 1,
	bird: 1,
	wolf: 1,
	aboleth: 1,
	indepspells: 1,		//"research level if independent"
	pathboost: 1,		//its effect is already in the paths shown above
	adventurers: 1,
	ainorec: 1,			//how the ai plays it, not how the unit works
	aisinglerec: 1,
	//a discount that only applies while a global enchantment is up - see
	//ENCH_REBATE for what these actually say
	enchrebate10: 1, enchrebate20: 1, enchrebate50: 1, enchrebate75: 1,
	enchrebate100: 1, enchrebate25p: 1, enchrebate50p: 1
};

////////////////////////////////////////////////////////////////////////////
// enchantment rebates
//
// These print as "10 gold cheaper when active 107", where 107 is the NUMBER of
// the enchantment that has to be up. The name and the size of the discount are
// what a player wants: "Gigantomachia discount 10".
////////////////////////////////////////////////////////////////////////////
var ENCH_REBATE = {
	enchrebate10:'10', enchrebate20:'20', enchrebate50:'50', enchrebate75:'75',
	enchrebate100:'100', enchrebate25p:'25%', enchrebate50p:'50%'
};

function tagText(key, raw) {
	if (!ENCH_REBATE[key]) return null;
	var e = modctx.enchantments_lookup && modctx.enchantments_lookup[raw];
	return ((e && e.name) ? e.name : 'enchantment ' + raw) + ' discount ' + ENCH_REBATE[key];
}

//said elsewhere on the card, so never a chip in either mode
var TAG_ELSEWHERE = {
	unique: 1,				//in the title bar
	sailingshipsize: 1,		//the sailing icon carries both figures
	sailingmaxunitsize: 1
};

function tagHidden(key, raw, adv) {
	if (TAG_ELSEWHERE[key]) return true;
	if (adv) return false;
	if (ADVANCED_ONLY[key]) return true;

	//a NEGATIVE appetite is an appetite smaller than usual - true of a great
	//many units and never decisive. a positive one is worth the gluttony icon.
	if (key == 'appetite' && parseInt(raw) < 0) return true;

	return false;
}

////////////////////////////////////////////////////////////////////////////
// abilities
//
// the game shows an ability as an icon and lets you hover it for the name.
// there is no hover on a touchscreen, so the icon carries its number in the
// corner and the name stays as a tooltip and an aria-label.
// abilities the icon set does not cover fall back to a text chip.
////////////////////////////////////////////////////////////////////////////

//one property, two meanings: the same stored figure raises unrest when it is
//positive and lowers it when negative, and the game has an icon for each
var SIGNED_ICONS = { incunrest: ['reduces_unrest', 'Reduces Unrest'] };

//and one where the icon only makes sense for a positive value: gluttony is a
//bigger appetite than usual, so a negative appetite keeps its words. it is
//hidden altogether in default mode - see tagHidden.
var NO_ICON_WHEN_NEGATIVE = { appetite: 1 };

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
	var isNeg = parseInt(raw) < 0;
	if (isNeg && NO_ICON_WHEN_NEGATIVE[key]) return null;

	var neg = isNeg && SIGNED_ICONS[key];
	var ic = neg || (DMI.abilityIcons && DMI.abilityIcons[key]);
	if (!ic) return null;

	//the negative icon already says "reduces", so the badge carries the size of
	//the reduction rather than repeating the minus sign
	if (neg) raw = -parseInt(raw);

	var name = ic[1] || label;
	var badge = iconBadge(raw);
	var title = Utils.escapeHtml(badge ? name + ' ' + badge : name);

	return '<span class="nv-ab" title="'+title+'" aria-label="'+title+'">'
		+ '<img src="'+DMI.abilityIconPath+Utils.escapeHtml(ic[0])+'.png" alt="" loading="lazy" />'
		+ (badge ? '<em>'+Utils.escapeHtml(badge)+'</em>' : '')
		+ '</span>';
}

////////////////////////////////////////////////////////////////////////////
// sailing
//
// a ship carries two figures: how much it can hold in total, and the biggest
// single unit it will take. two sentences' worth, so they are painted onto the
// one icon instead - the total above, the per-unit cap below it.
////////////////////////////////////////////////////////////////////////////
function sailingIcon(o) {
	var ship = parseInt(o.sailingshipsize);
	if (!ship) return '';

	var max = parseInt(o.sailingmaxunitsize);
	var t = 'sailing: ship size ' + ship + (max ? ', max unit size ' + max : '');
	t = Utils.escapeHtml(t);

	return '<span class="nv-ab nv-sail" title="'+t+'" aria-label="'+t+'">'
		+ '<img src="'+DMI.abilityIconPath+'sailing.png" alt="" width="38" height="38" loading="lazy" />'
		+ '<em class="nv-sail-a">'+ship+'</em>'
		+ (max ? '<em class="nv-sail-b">size '+max+'</em>' : '')
		+ '</span>';
}

//splits everything the overlay would print about an object into icons and text.
//`skip` holds keys already shown in the stat block so they are not repeated.
//`D` selects whose display tables to read - see displayFor().
function abilityBlock(o, skip, D) {
	D = D || displayFor('unit');
	var adv = isAdvanced();
	var icons = [], text = [], seen = {};

	//two figures on one icon, in place of two sentences
	var sail = sailingIcon(o);
	if (sail) icons.push(sail);

	//`raw` is the stored value, `formatted` the html MUnit's own formatter makes
	//of it. some properties hold objects or arrays (a recruiting site, a list of
	//nations) - those are only meaningful through the formatter, never as
	//String(value), which yields "[object Object]".
	function consider(key, label, raw, formatted) {
		if (seen[key] || skip[key] || DROP_PROPS[key] || OTHER_BODY_KEYS[key]) return;
		seen[key] = 1;
		if (tagHidden(key, raw, adv)) return;
		if (isNotANumber(raw) || isNotANumber(formatted)) return;

		//a few keys read as nonsense through the ordinary machinery
		var said = tagText(key, raw);
		if (said) { text.push('<span class="nv-tag">'+Utils.escapeHtml(said)+'</span>'); return; }

		var ic = abilityIcon(key, label, raw);
		if (ic) { icons.push(ic); return; }

		var val = '';
		//items and spells carry a lot of properties whose meaning is in the
		//formatter (a gem cost, a signed bonus, a reference to another object),
		//so those take the formatted html. a unit's properties are mostly bare
		//numbers, and print as they are stored.
		if (D.preferFormatted && formatted !== undefined && formatted !== null && formatted !== '') {
			val = String(formatted).trim();		//already html
		}
		else if (typeof raw == 'string' || typeof raw == 'number') {
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
		var v = fmtValue(o, k, D);
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

//shown next to the weapon name. the damage modifiers are here too: the name
//column is the one with room to spare, and squeezing "AP" in beside the damage
//figure crowds the only number on the row anyone is reading.
var NAME_MODS = {
	'Requires Two Hands':        '2H',
	'Half Strength added':       '+Str/2',
	'One Third Strength added':  '+Str/3'
};
var DMG_MODS = {
	'Armor Piercing': 'AP',
	'Armor Negating': 'AN',
	'Capped Damage':  '(cap)'
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

//in default mode these are noise on a weapon that does no ordinary damage - a
//mind blast, a net, a web. Of course a web cannot repel and adds no strength.
var QUIET_ON_ODD_WEAPONS = {
	'Cannot be used for repelling': 1,
	'Strength not added to damage': 1
};
//and these on a weapon you shoot: every bow needs both hands, and a bow that
//works underwater is a detail for someone who has gone looking
var QUIET_ON_RANGED = {
	'Requires Two Hands': 1,
	'May Use Underwater': 1
};
//and this one anywhere: that a claw or a breath is part of the creature is
//already plain from its name
var QUIET_BY_DEFAULT = {
	'Natural Ranged Weapon': 1
};

//splits a weapon's modifiers into the presentations described above
function weaponMods(w, adv) {
	if (adv === undefined) adv = isAdvanced();
	var labels = damageTags(w).map(function(t){ return String(t[0]).trim(); });

	var seen = {};
	var out = { glyphs: [], nameMods: [], tags: [] };

	//an area weapon says so first, beside its name where there is room. the
	//figure is not in weapons.csv - MWpn lifts it off the effect record.
	var aoe = parseInt(w.aoe);
	if (aoe) out.nameMods.push('AoE ' + aoe);

	var heavy = true;
	for (var i=0; i<HEAVY_LANCE.length; i++)
		if (labels.indexOf(HEAVY_LANCE[i]) == -1) { heavy = false; break; }
	if (heavy)
		for (var i=0; i<HEAVY_LANCE.length; i++) seen[HEAVY_LANCE[i]] = 1;

	//a lance implies it cannot repel, so "lance" alone says it
	if (labels.indexOf('Damage Bonus on 1st Attack') != -1)
		seen['Cannot be used for repelling'] = 1;

	//a weapon carrying no damage TYPE at all does no ordinary damage
	var ordinary = false;
	for (var i=0; i<labels.length; i++) if (DMG_TYPES[labels[i]]) { ordinary = true; break; }
	var ranged = (w.wpnclass == 'missile');

	var types = [];
	for (var i=0; i<labels.length; i++) {
		var L = labels[i];
		if (seen[L]) continue;
		seen[L] = 1;

		if (DROP_MODS[L]) continue;
		if (!adv && QUIET_BY_DEFAULT[L]) continue;
		if (!adv && !ordinary && QUIET_ON_ODD_WEAPONS[L]) continue;
		if (!adv && ranged && QUIET_ON_RANGED[L]) continue;

		if (DMG_TYPES[L]) { types.push(DMG_TYPES[L]); continue; }
		//both of these ride beside the name - see NAME_MODS
		if (NAME_MODS[L]) { out.nameMods.push(NAME_MODS[L]); continue; }
		if (DMG_MODS[L])  { out.nameMods.push(DMG_MODS[L]);  continue; }
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
////////////////////////////////////////////////////////////////////////////
// other bodies
//
// besides its mount, a unit can turn into something else, or draw something
// else to it. each of those is another unit with its own stats, so each gets
// its own face - the same treatment as the mount.
//
// the tab says which relation it is, because they are not interchangeable:
// a dying shape is what you are left with, a prophet shape is what you choose,
// a domsummon is what turns up in your dominion. the property is then dropped
// from the tag row, since the tab says it better.
//
// property -> the words on the tab
////////////////////////////////////////////////////////////////////////////
var OTHER_BODIES = [
	['secondshape',    'second shape'],
	['secondtmpshape', 'dying shape'],
	['shapechange',    'alternate shape'],
	['prophetshape',   'prophet shape'],
	['landshape',      'land shape'],
	['watershape',     'sea shape'],
	//the dominion-attracts-units family. the variants differ in how often, so
	//the tab has to say which.
	//a unit promoted to another form once it has earned enough experience. the
	//stored value is the xp threshold, not a unit - the form is named by
	//xpshapemon, or is simply the next id along.
	['xpshape',        'experienced shape',       function(u){ return u.xpshapemon || (parseInt(u.id)+1); }],
	['labxpshape',     'experienced shape (lab)', function(u){ return u.xpshapemon || (parseInt(u.id)+1); }],
	//the form it returns as after the wight-form ritual
	['twiceborn',      'Twiceborn'],
	//the number is the unit it takes as slaves
	['slaver',         'captures'],
	['domsummon',      'domsummon'],
	['domsummon2',     'domsummon/2'],
	['domsummon20',    'domsummon/20'],
	['raredomsummon',  'domsummon 8%']
];

//fill in the lookup declared beside DROP_PROPS, so the tag row does not repeat
//what the tab already says
for (var _i=0; _i<OTHER_BODIES.length; _i++) OTHER_BODY_KEYS[OTHER_BODIES[_i][0]] = 1;

//the shrink chain is not a single-step relation like the rest, so it is walked
//separately in mountFaces - but its key is spoken for just the same
OTHER_BODY_KEYS['shrinkhp'] = 1;

function mountFaces(u) {
	var faces = [{ unit: u, kind: 'rider', count: 1 }];
	var seen = {};
	seen[Math.floor(u.id)] = 1;

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
	for (var i=1; i<faces.length; i++) seen[Math.floor(faces[i].unit.id)] = 1;

	for (var i=0; i<OTHER_BODIES.length; i++) {
		var key = OTHER_BODIES[i][0];
		if (!u[key]) continue;

		//most of these store the unit's id; a few store something else and say
		//which unit they mean another way
		var resolve = OTHER_BODIES[i][2];
		var o = modctx.unitlookup[resolve ? resolve(u) : u[key]];
		if (!o || seen[Math.floor(o.id)]) continue;		//and never itself
		seen[Math.floor(o.id)] = 1;

		faces.push({ unit: o, kind: OTHER_BODIES[i][1], prefix: OTHER_BODIES[i][1], count: 1 });
	}

	////////////////////////////////////////////////////////////////////////
	// creatures that shrink as they are damaged
	//
	// Mostly elementals and the many-headed: each form names the next by
	// convention - the next id along - and carries the hit points at which it
	// gives way. So the chain is walked to its end and every form gets a tab,
	// labelled with the threshold that brings it on.
	//
	// The smaller forms are cards in their own right too, with shorter chains.
	// That is wanted, not a duplicate: different spells summon different sizes.
	//
	// NB: `growhp`, the way back up, is deliberately NOT followed. A card
	// should list what this form can become, not what it may have been.
	////////////////////////////////////////////////////////////////////////
	var link = u, guard = 0;
	while (link && link.shrinkhp && guard++ < 16) {
		var next = modctx.unitlookup[parseInt(link.id) + 1];
		if (!next || seen[Math.floor(next.id)]) break;
		seen[Math.floor(next.id)] = 1;

		faces.push({ unit: next, kind: 'shrinks below ' + link.shrinkhp + ' hp',
			prefix: 'hp ' + link.shrinkhp, count: 1,
			hideName: (next.name === u.name) });
		link = next;
	}

	for (var i=1; i<faces.length; i++)
		DMI.MUnit.prepareForRender(faces[i].unit);		//stats and sprite urls

	return faces;
}

//"Moose x2" - the count only shown when there is more than one. it can be a
//string as well as a number: a summon's count carries its per-level bonus, so
//"Troll x10" but "Great Lion x15+".
function faceLabel(f) {
	var n = f.unit.fullname || f.unit.name || '?';
	//a shrink chain is eight tabs of the same creature, so repeating its name
	//on every one of them only costs width - the threshold is the whole label
	if (f.hideName && f.prefix) return f.prefix;
	//"second shape: Werewolf" - which relation this body is, not just its name
	if (f.prefix) n = f.prefix + ': ' + n;
	var c = (f.count === undefined || f.count === null) ? '' : String(f.count);
	return (c && c != '1' && c != '0') ? n + ' ×' + c : n;
}

////////////////////////////////////////////////////////////////////////////
// what a summoning spell calls up
//
// the same treatment as a mounted unit: one face per body, switched with the
// tab strip in the title. tab 0 is the spell itself.
//
// there are two ways a spell summons more than one kind of thing and they mean
// opposite things, so the tab strip is labelled with which:
//
//   ONE OF   a single effect resolving to several candidates - a monster tag,
//            or a list of uniques (Queen of Elemental Air, Call Amesha
//            Spenta). you get one of them.
//
//   ALL OF   a chain of nextspells, each summoning its own thing (Troll King's
//            Court: the King, then 10 Trolls, then 5 War Trolls, then 2 Troll
//            Moose Knights). you get every one. the links are unresearchable
//            spells, which is why they are not in the list in their own right.
//
// a third case rides along with both: `summonconds` marks a unit that REPLACES
// the ordinary summon underwater or in a cold dominion, rather than arriving
// as well. those are labelled with the circumstance and left out of the count
// that decides the wording, so the Faerie Court's Unseelie half does not read
// as more choices.
////////////////////////////////////////////////////////////////////////////

//how many arrive from one link of the chain, in the same per-level encoding
//as everything else - see effectCount
function summonCount(link) {
	var raw = link.nreff || link.effects_count;
	if (!parseInt(raw)) return '';
	try { return DMI.MSpell.spellBonus(raw, link.pathlevel1); }
	catch(e) { return String(parseInt(raw)); }
}

function summonFaces(s) {
	var faces = [], seen = {}, links = 0, plain = 0;
	var link = s, guard = 0;

	while (link && guard++ < 8) {
		var units = link.summonsunits || [];
		var count = summonCount(link);
		var conds = link.summonconds || {};

		if (units.length) links++;

		for (var i=0, u; u=units[i]; i++) {
			var key = Math.floor(u.id);
			if (seen[key]) continue;
			seen[key] = 1;

			var cond = conds[u.id];
			if (!cond) plain++;

			try { DMI.MUnit.prepareForRender(u); } catch(e) {}
			faces.push({ unit:u, kind: cond || 'summoned', count: cond ? '' : count });
		}

		if (link === link.nextspell) break;		//the data holds self-referential rows
		link = (link.nextspell && typeof link.nextspell == 'object') ? link.nextspell : null;
	}

	return { faces: faces,
	         how: (links > 1) ? 'all of the following'
	            : (plain > 1) ? 'one of the following' : '' };
}

////////////////////////////////////////////////////////////////////////////
// descriptions
//
// a spell's or an item's description is not flavour text - it is where the
// game says what the thing actually does - so the card carries it.
//
// they live one file per object under gamedata/, a sentence or two each. a
// spell has a second file, "details<Name>.txt", holding the mechanical figure
// ("Grants +4 MR"); only about one national spell in fifteen has one, and
// there is no index of which, so a miss is a 404. that is the same bargain the
// detail overlay already makes, and a missing file is cached as "none" so it
// is asked for once per session.
////////////////////////////////////////////////////////////////////////////

var _descrCache = {};			//url -> text, or '' for "no such description"

//the files that describe this object. empty when a mod supplied the text
//inline, which is then used as-is.
function descrSources(kind, o) {
	if (o.descr) return [];

	var f = Utils.descrFilename(o.name || '');
	if (!f || f == '.txt') return [];

	if (kind == 'item') return ['gamedata/itemdescr/' + f];
	return ['gamedata/spelldescr/' + f, 'gamedata/spelldescr/details' + f];
}

//description text as escaped lines. the shipped files hold no markup, and mod
//text is untrusted, so everything is escaped. <span> rather than <p> - the
//card is spans all the way down.
function descrHtml(text) {
	var lines = String(text).split('\n');
	var out = [];
	for (var i=0; i<lines.length; i++) {
		var t = lines[i].replace(/^\s+|\s+$/g, '');
		if (t) out.push('<span class="nv-p">'+Utils.escapeHtml(t)+'</span>');
	}
	return out.join('');
}

//the description strip. what is already cached is written straight in, so a
//nation you have looked at before renders at its final height; the rest goes
//in as empty placeholders for fillDescriptions() to fetch, and the strip stays
//hidden until there is something in it.
function descrStrip(kind, o) {
	var urls = descrSources(kind, o);
	var parts = [], any = false, waiting = false;

	if (o.descr) { parts.push('<span class="nv-dsrc">'+descrHtml(o.descr)+'</span>'); any = true; }

	for (var i=0; i<urls.length; i++) {
		//the second file is the mechanical note, and reads differently
		var cls = 'nv-dsrc' + (i && urls.length > 1 ? ' nv-dmech' : '');
		var cached = _descrCache[urls[i]];

		if (cached === undefined) {
			parts.push('<span class="'+cls+'" data-url="'+Utils.escapeHtml(urls[i])+'"></span>');
			waiting = true;
		}
		else if (cached) {
			parts.push('<span class="'+cls+'">'+descrHtml(cached)+'</span>');
			any = true;
		}
	}

	if (!any && !waiting) return '';		//known to have none
	return '<span class="nv-descrbox"'+(any ? '' : ' style="display:none"')+'>'
		+ parts.join('') + '</span>';
}


////////////////////////////////////////////////////////////////////////////
// the card shell
//
// a unit card, a spell card and an item card are the same object: a div that
// behaves as a button, a title bar, and one or more strips under it. the kind
// and the id ride in data attributes so a tap can open the right detail sheet.
//
// NB: deliberately a div, not a button. blink does not reliably grow a
// <button> to fit flex/grid content, and these cards are full of both - the
// stat block and the weapon tables spill out of the bottom. role, tabindex and
// the keydown handler give it the button behaviour back.
////////////////////////////////////////////////////////////////////////////
function openCard(kind, id, group, cls) {
	return '<div class="nv-card" data-kind="'+kind+'" data-uid="'+Utils.escapeHtml(id)+'"'
		+ ' data-group="'+group+'" data-cls="'+cls+'" role="button" tabindex="0">'
		+ '<span class="nv-card-inner">';
}
function closeCard() { return '</span></div>'; }

//the right-hand end of a title bar: "forts - forest", "Conjuration 5 - ritual"
function originLine(parts) {
	var out = [];
	for (var i=0; i<parts.length; i++)
		if (parts[i]) out.push(Utils.escapeHtml(parts[i]));
	return out.join(' &middot; ');
}

//a short emphasised word in the title, beside the name
function titleBadge(text, title, cls) {
	return '<span class="'+(cls||'nv-slow')+'"'
		+ (title ? ' title="'+Utils.escapeHtml(title)+'"' : '')
		+ '>'+Utils.escapeHtml(text)+'</span>';
}

////////////////////////////////////////////////////////////////////////////
// the tab strip
//
// one tab per face, along the bottom edge of the title bar. a mounted unit's
// rider, co-riders and mount; a summoning spell's own tab and then what it
// calls up. the active tab takes the colour of the panel below it so the two
// read as one surface.
//
// `lead` is an unclickable first chip, used to say whether the tabs after it
// are things you get one of or all of.
////////////////////////////////////////////////////////////////////////////
function faceBar(faces, lead) {
	if (faces.length < 2) return '';
	var esc = Utils.escapeHtml;

	var h = '<span class="nv-facebar" role="tablist">';
	if (lead) h += '<span class="nv-facelead">'+esc(lead)+'</span>';

	for (var i=0; i<faces.length; i++) {
		var f = faces[i];
		h += '<span class="nv-facechip'+(i===0 ? ' is-active' : '')+'"'
			+ ' data-face="'+i+'" role="tab" tabindex="-1"'
			+ ' aria-selected="'+(i===0 ? 'true' : 'false')+'"'
			+ ' title="'+esc(f.kind)+'">';
		if (f.unit && f.unit.sprite && f.unit.sprite.url1)
			h += '<img src="'+esc(f.unit.sprite.url1)+'" alt="" loading="lazy"'
				+ ' onerror="this.style.display=\'none\'" />';
		h += esc(f.unit ? faceLabel(f) : (f.label || '?'));
		h += '</span>';
	}
	return h + '</span>';
}

function renderEntry(entry) {
	if (entry.kind == 'spell') return renderSpellCard(entry);
	if (entry.kind == 'item')  return renderItemCard(entry);
	return renderUnitCard(entry);
}

function renderUnitCard(entry) {
	var u = entry.obj;
	var g = entry.group;
	var qual = qualifierOf(u.typechar, g);
	var esc = Utils.escapeHtml;

	//where the nation raises it - "forts", "capital", a terrain, "foreign".
	//a unit buildable several ways lists them all.
	var origin = entry.descriptors.length
		? entry.descriptors.map(esc).join(' &middot; ')
		: esc(groupLabel(g)) + (qual ? ' &middot; ' + esc(qual) : '');

	var faces = mountFaces(u);

	var h = openCard('unit', u.id, g, classOf(u));

	//---- title bar -----------------------------------------------------
	h += '  <span class="nv-title">';
	//NB: no cmdr/mage badge - what kind of unit this is, is carried by the
	//card's colour (see data-cls and classOf)
	h += '    <span class="nv-name">'+esc(u.fullname || u.name)+'</span>';
	//several units share this name: say which one this is
	var dis = disambiguator(u);
	if (dis) h += '<span class="nv-disambig">('+esc(dis)+')</span>';
	//worth the space in the title: it decides whether you can field one at all
	if (u.slow_to_recruit)
		h += '  <span class="nv-slow" title="slow to recruit - one every other turn">slow</span>';
	//likewise: there is one of these in the game, not one per casting
	if (u.unique)
		h += titleBadge('unique', 'only one of these exists in the game', 'nv-slow nv-uniq');
	h += '    <span class="nv-origin">'+origin+'</span>';

	//the other bodies, as a tab strip that can also be swiped
	h += faceBar(faces);
	h += '  </span>';

	//---- one body per face ---------------------------------------------
	h += '  <span class="nv-faces">';
	for (var i=0; i<faces.length; i++)
		h += renderFace(faces[i], i === 0);
	h += '  </span>';

	h += closeCard();
	return h;
}

//the stat panel and tables for one body
function renderFace(face, isRider) {
	var u = face.unit;
	var esc = Utils.escapeHtml;

	//stats shown in the block above must not repeat in the ability row
	//"basecost" duplicates Gold; "slow" is in the title; goldcost and the
	//recruitment cap are the gold line, see goldRow
	var shown = { gcost:1, slow_to_recruit:1, goldcost:1, reclimit:1,
		//the protection line says all of these
		prot:1, prot_nat:1, prot_armor_head:1, prot_armor_body:1,
		prot_head:1, prot_body:1, invulnerable:1 };
	var cols = [COL1, COL2, COL3, LEADERSHIP];
	for (var c=0; c<cols.length; c++)
		for (var i=0; i<cols[c].length; i++) shown[cols[c][i][0]] = 1;
	shown['mpath'] = 1;

	//data-ref says what tapping this face should open - see cardRef
	var h = '';
	h += '<span class="nv-face'+(isRider ? ' is-active' : '')+'"'
		+ ' data-uid="'+esc(u.id)+'" data-ref="unit '+esc(u.id)+'">';

	//---- dark panel: three stat columns, sprite, ability icons ----------
	h += '  <span class="nv-panel">';
	//a mod can name art it does not ship; hide the broken image rather than
	//show the browser's placeholder, keeping the box the stats are laid out around
	h += '    <img class="nv-spr" loading="lazy" alt="" onerror="this.style.visibility=\'hidden\'"'
		+ ' src="'+esc((u.sprite && u.sprite.url1) || '')+'" />';
	//the card's own title carries this for the first face; the others - a
	//mount, a shape, a summoned unit - have to say it here
	if (!isRider && u.unique)
		h += '  <span class="nv-uniqface" title="only one of these exists in the game">unique</span>';

	h += '    <span class="nv-stats">';
	//column one is written out rather than driven from a list: gold carries the
	//recruitment cap, and protection is two rows built from several fields
	h += '<span class="nv-statcol">'
	   + (summonCostRows(u) || goldRow(u))
	   + statRow(u, 'hp',   'Hit points', true)
	   + statRow(u, 'size', 'Size',       true)
	   + protRow(u)
	   + mundaneRow(u)
	   + statRow(u, 'mr',   'Magic Resistance', true)
	   + statRow(u, 'mor',  'Morale',           true)
	   + '</span>';
	h += statColumn(u, COL2, true);
	h += statColumn(u, COL3, false, null, leadershipRow(u)) || '<span class="nv-statcol"></span>';
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
	h += tablesBlock(u.weapons, u.armor, u);

	h += '</span>';
	return h;
}

////////////////////////////////////////////////////////////////////////////
// weapon and armour tables
//
// `wielder` is the unit holding the weapon, when there is one: a unit's attack
// and damage are its own stats combined with the weapon's. An item's weapon
// has no wielder, so it is shown bare - which is what the item overlay does.
////////////////////////////////////////////////////////////////////////////

//length / attack / damage for one weapon
function wpnStats(wielder, wp, i) {
	if (wielder) return {
		len: MUnitSafe('getWpnLen',  wielder, i),
		att: MUnitSafe('getWpnAtt',  wielder, i),
		dmg: MUnitSafe('getWpnDmg',  wielder, i)
	};

	//no wielder: the weapon's own figures. a missile weapon's range can be
	//stored as a negative divisor of the wielder's strength, which without a
	//wielder is all we can say about it.
	var len = '';
	if (wp.wpnclass == 'missile') {
		var r = parseInt(wp.range);
		if (!isNaN(r))
			len = (r == 1) ? 'r0'
			    : (r == -1) ? 'r str'
			    : (r < 0) ? 'r str/' + (-r)
			    : 'r' + r;
	}
	else if (wp.len !== undefined && wp.len !== '') len = wp.len;

	return {
		len: len,
		att: (wp.att === undefined || wp.att === '') ? '' : Format.Signed(wp.att),
		dmg: (wp.dmg == '999') ? 'Special' : (wp.dmg === undefined ? '' : wp.dmg)
	};
}

//an empty cell says "not known" better than NaN does. modded units reach
//combinations the stat helpers were not written for.
function cell(v) {
	return isNotANumber(v) ? '' : v;
}

function weaponTable(list, wielder) {
	var esc = Utils.escapeHtml;
	var h = '';

	h += '<span class="nv-tbl nv-wtbl">';
	h += '  <span class="nv-thead"><i class="nv-c0">Weapon</i><i>Len</i><i>Att</i><i>Dmg</i></span>';

	for (var w=0; w<list.length; w++) {
		var wp = list[w];
		if (!wp) continue;
		var wm = weaponMods(wp);
		var st = wpnStats(wielder, wp, w);

		h += '<span class="nv-trow">';

		//the name truncates, the modifiers beside it must not
		h += '  <i class="nv-c0"><span class="nv-wname">'+esc(wp.name || '?')+'</span>';
		for (var m=0; m<wm.nameMods.length; m++)
			h += '<b class="nv-wmod">'+esc(wm.nameMods[m])+'</b>';
		h += '  </i>';

		h += '  <i>'+esc(cell(st.len))+'</i>';
		h += '  <i>'+esc(cell(st.att))+'</i>';

		h += '  <i class="nv-dmgcell">';
		h += wm.glyphs.join('');
		h += esc(cell(st.dmg));
		//NB: nratt is a count when positive, but a RELOAD interval when
		//negative (crossbows and arbalests) - "x-2" would read as nonsense
		var nratt = parseInt(wp.nratt);
		if (nratt > 1) h += '&times;'+nratt;
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
	h += '</span>';
	return h;
}

function armorTable(list, wielder) {
	var esc = Utils.escapeHtml;
	var h = '';

	h += '<span class="nv-tbl nv-atbl">';
	h += '  <span class="nv-thead"><i class="nv-c0">Armor</i><i>Prt</i><i>Def</i><i>Par</i><i>Enc</i></span>';
	for (var a=0; a<list.length; a++) {
		var ar = list[a];
		if (!ar) continue;
		h += '<span class="nv-trow">';
		h += '  <i class="nv-c0">'+esc(ar.name || '?')+'</i>';
		h += '  <i>'+esc(cell(MUnitSafe('getArmorProt', wielder, a)))+'</i>';
		h += '  <i>'+esc(cell(ar.def || '0'))+'</i>';
		h += '  <i>'+esc(cell(MUnitSafe('getArmorParry', wielder, a)))+'</i>';
		h += '  <i>'+esc(cell(ar.enc || '0'))+'</i>';
		h += '</span>';
	}
	h += '</span>';
	return h;
}

function tablesBlock(weapons, armors, wielder) {
	var hasW = weapons && weapons.length, hasA = armors && armors.length;
	if (!hasW && !hasA) return '';

	var h = '<span class="nv-tables">';
	if (hasW) h += weaponTable(weapons, wielder);
	if (hasA) h += armorTable(armors, wielder);
	h += '</span>';
	return h;
}

////////////////////////////////////////////////////////////////////////////
// Spell cards
//
// same shape as a unit card, holding what the spell overlay holds: what it
// costs, where it reaches, what it does, and - for the summoning spells that
// are most of a nation's list - what it calls up.
//
// the card is coloured by type rather than by school: whether a spell is cast
// in a battle or between turns decides how you use it, and the school is
// already spelled out in the title.
////////////////////////////////////////////////////////////////////////////

var SPELL_COL1 = [ ['gemcost','Gems'], ['fatiguecost','Fatigue'], ['casttime','Cast time'] ];
var SPELL_COL2 = [ ['rng_bat','Range'], ['provrange','Range'], ['aoe_s','Area'] ];
var SPELL_COL3 = [ ['duration','Duration'], ['precision','Precision'] ];

//how many times the spell's effect happens. `nreff` is stored in the same
//"base value plus a bonus per caster level" encoding as the damage and the
//number summoned, so 2001 means three at path 1 and one more per level above
//it. printing it raw - which is what the detail overlay does - reads as a
//nonsense five-figure number, so it is decoded here.
function effectCount(s) {
	if (!parseInt(s.nreff)) return '';
	var t;
	try { t = DMI.MSpell.spellBonus(s.nreff, s.pathlevel1); }
	catch(e) { t = String(s.nreff); }
	return (t == '1') ? '' : t;			//"one effect" is the ordinary case
}

//effect numbers that summon something. for these the count of what arrives is
//already written into the effect line ("Great Lion x 15+"), so the raw
//`nreff` - which is the encoded form of that same figure, and reads as a
//nonsense 1013 - is left off the stat block. taken from the summon branches in
//MSpell.prepareData_PostMod.
var SUMMON_EFFECTS = { 1:1, 21:1, 26:1, 31:1, 37:1, 38:1, 43:1, 50:1, 76:1,
                       81:1, 89:1, 93:1, 100:1, 114:1, 119:1, 120:1, 137:1, 141:1 };

//an effect the game has a picture for. the name is kept as the tooltip, so
//nothing is lost - "Poison (HP damage)" is three words for what the poison
//icon says at a glance, and it sits beside a damage figure that already has
//its own glyphs.
var EFFECT_ICONS = {
	'Poison (HP damage)': ['resist_poison', 'poison damage']
};

//what the spell does, as the overlay's effect row says it. the effect tables
//are keyed on a number and some of the entries are functions over the whole
//spell, so this is kept behind a try - a card that omits the line beats a
//nation list that fails to render.
function spellEffect(s) {
	try {
		var eff = DMI.MSpell.getEffect(s);
		if (!eff || eff.effect_number === undefined) return null;

		var info = modctx.effects_info_lookup[eff.effect_number];
		var name = info
			? String(info.name).replace(/{(.*?)}|(\(Type.*?\))|(\(\?\))/g, '').trim()
			: 'effect ' + eff.effect_number;

		var res = DMI.MSpell.effectlookup[eff.effect_number] || DMI.MSpell.effectlookup['unknown'];
		if (typeof res == 'function') res = res(s, eff);
		//a modded effect can hand back something that is not text at all;
		//"[object Object]" says less than the effect's name alone
		if (typeof res != 'string' && typeof res != 'number') res = '';

		return { name: name,
		         icon: EFFECT_ICONS[name] || null,
		         html: String(res),
		         summons: !!SUMMON_EFFECTS[parseInt(eff.effect_number)] };
	}
	catch(e) { return null; }
}

//a spell's modifier mask uses the same vocabulary as a weapon's, so it is
//split the same way: damage types become glyphs, the rest short tags.
function spellMods(s) {
	var out = { glyphs: [], tags: [] };
	var labels = [];

	try {
		var eff = DMI.MSpell.getEffect(s);
		if (eff) {
			var vals = DMI.MSpell.bitfieldValues(eff.modifiers_mask,
				modctx.effect_modifier_bits_lookup) || [];
			for (var i=0; i<vals.length; i++) labels.push(String(vals[i][0]).trim());
		}
	}
	catch(e) {}

	var seen = {}, types = [];
	for (var i=0; i<labels.length; i++) {
		var L = labels[i];
		if (!L || seen[L]) continue;
		seen[L] = 1;

		if (DROP_MODS[L]) continue;
		if (DMG_TYPES[L]) { types.push(DMG_TYPES[L]); continue; }
		out.tags.push(DMG_MODS[L] || NAME_MODS[L] || MOD_SHORT[L] || L);
	}

	types.sort(function(a,b){ return a[2]-b[2]; });
	for (var i=0; i<types.length; i++) out.glyphs.push(dmgGlyph(types[i][0], types[i][1]));
	return out;
}

function renderSpellCard(entry) {
	var s = entry.obj;
	var esc = Utils.escapeHtml;
	var D = displayFor('spell');
	var isRitual = String(s.type || '').toLowerCase() == 'ritual';

	//what it calls up, as further faces of this card
	var sum = summonFaces(s);
	var faces = sum.faces;

	var h = openCard('spell', s.id, 'spell', isRitual ? 'ritual' : 'combat');

	//---- title bar -----------------------------------------------------
	h += '  <span class="nv-title">';
	h += '    <span class="nv-name">'+esc(s.name)+'</span>';
	//the path requirement decides whether the nation can cast it at all, so it
	//goes in the title rather than among the numbers
	if (s.mpath)
		h += '  <span class="nv-titlepaths">'+Format.Paths(s.mpath)+'</span>';
	h += '    <span class="nv-origin">'+originLine([s.research, s.type])+'</span>';

	//tab 0 is the spell itself, the rest are what it summons
	if (faces.length)
		h += faceBar([{ label: s.name, kind: 'the spell' }].concat(faces), sum.how);
	h += '  </span>';

	//---- the spell's own face -------------------------------------------
	h += '<span class="nv-faces">';
	h += '<span class="nv-face is-active" data-ref="spell '+esc(s.id)+'">';

	//---- dark panel ----------------------------------------------------
	var shown = { mpath:1, research:1, type:1, nreff:1 };
	var cols = [SPELL_COL1, SPELL_COL2, SPELL_COL3];
	for (var c=0; c<cols.length; c++)
		for (var i=0; i<cols[c].length; i++) shown[cols[c][i][0]] = 1;

	var mods = spellMods(s);
	var eff  = spellEffect(s);

	//for a summon the count is already written into the effect line
	var nreff = (eff && eff.summons) ? '' : effectCount(s);

	h += '  <span class="nv-panel">';
	h += '    <span class="nv-stats">';
	h += statColumn(s, SPELL_COL1, false, D) || '<span class="nv-statcol"></span>';
	h += statColumn(s, SPELL_COL2, false, D);
	h += statColumn(s, SPELL_COL3, false, D, nreff ? litRow('Effects', esc(nreff)) : '');
	h += '    </span>';

	//what it does. where the spell summons, the tab strip already carries the
	//names and the counts, so the effect line keeps only its label - "Summon
	//Commander" against "Summon Units" says something the tabs do not.
	if (eff)
		h += '<span class="nv-effect">'
		   + (eff.icon ? dmgGlyph(eff.icon[0], eff.icon[1]) : '<i>'+esc(eff.name)+'</i>')
		   + '<b>'+mods.glyphs.join('') + (faces.length ? '' : eff.html) + '</b></span>';

	//a spell can carry a chain of secondary effects. the links that summon are
	//tabs by now; the rest are listed under the first effect. guarded against
	//the self-referential rows in the data.
	var next = s.nextspell, guard = 0;
	while (next && typeof next == 'object' && guard++ < 4) {
		var e2 = spellEffect(next);
		if (e2 && !(e2.summons && faces.length))
			h += '<span class="nv-effect nv-effect2">'
			   + (e2.icon ? dmgGlyph(e2.icon[0], e2.icon[1]) : '<i>'+esc(e2.name)+'</i>')
			   + '<b>'+e2.html+'</b></span>';
		if (next === next.nextspell) break;
		next = next.nextspell;
	}

	//the mask's remaining bits, then whatever else the overlay would print
	var ab = abilityBlock(s, shown, D);
	var tags = mods.tags.map(function(t){
		return '<span class="nv-tag">'+esc(t)+'</span>';
	});

	if (tags.length || ab.icons.length || ab.text.length) {
		h += '  <span class="nv-abil">';
		h += ab.icons.join('');
		h += tags.join('');
		h += ab.text.join('');
		h += '  </span>';
	}
	h += '  </span>';

	//---- parchment footer: what the game says it does -------------------
	h += descrStrip('spell', s);
	h += '</span>';			//end of the spell's own face

	//---- a face per summoned unit ---------------------------------------
	for (var i=0; i<faces.length; i++)
		h += renderFace(faces[i], false);
	h += '</span>';			//end of .nv-faces

	h += closeCard();
	return h;
}


////////////////////////////////////////////////////////////////////////////
// Item cards
//
// a nation's items are of two kinds and an item can be both: ones only it can
// forge, and ones anyone can forge that it forges cheaply. which it is goes in
// the title, since that is the reason the item is on this page at all.
//
// the card is coloured by what the item is worn or wielded as.
////////////////////////////////////////////////////////////////////////////

var ITEM_CLASS = {
	'1-h wpn':'weapon', '2-h wpn':'weapon', 'missile':'weapon',
	'armor':'armour', 'shield':'armour', 'helm':'armour',
	'barding':'armour', 'boots':'armour'
	//misc and crown fall through to 'misc'
};

//the armour figures an item carries, split over two columns
var ITEM_COL2 = [ ['prot','Protection'], ['protbody','Prot body'], ['prothead','Prot head'] ];
var ITEM_COL3 = [ ['protshield','Prot shield'], ['def','Defence'], ['parry','Parry'], ['enc','Encumbrance'] ];

var DESC_TITLES = {
	restricted: 'only this nation can forge it',
	discount:   'this nation forges it cheaply'
};

function renderItemCard(entry) {
	var o = entry.obj;
	var esc = Utils.escapeHtml;
	var D = displayFor('item');
	var IT = DMI.MItem.display;

	var h = openCard('item', o.id, 'item', ITEM_CLASS[o.type] || 'misc');

	//---- title bar -----------------------------------------------------
	h += '  <span class="nv-title">';
	h += '    <span class="nv-name">'+esc(o.name)+'</span>';
	for (var i=0, d; d=entry.descriptors[i]; i++)
		h += titleBadge(d, DESC_TITLES[d], 'nv-slow nv-desc-'+d);
	h += '    <span class="nv-origin">'
	   + originLine([ IT.typeNames[o.type] || o.type, IT.conNames[o.constlevel] ])
	   + '</span>';
	h += '  </span>';

	//---- dark panel ----------------------------------------------------
	//keys spoken for by the title or the stat columns, so the chip row below
	//does not repeat them
	//itemcost1/2 are the percentages that produced the forge cost above, not
	//anything a player acts on
	var shown = { mpath:1, gemcost:1, constlevel:1, type:1,
	              restricted:1, nationrebate:1, boosters:1,
	              itemcost1:1, itemcost2:1 };
	var cols = [ITEM_COL2, ITEM_COL3];
	for (var c=0; c<cols.length; c++)
		for (var i=0; i<cols[c].length; i++) shown[cols[c][i][0]] = 1;

	h += '  <span class="nv-panel">';
	h += '    <img class="nv-spr" loading="lazy" alt="" onerror="this.style.visibility=\'hidden\'"'
		+ ' src="'+esc(o.sprite || '')+'" />';

	//an item with construction level 12 exists but cannot be forged, and its
	//stored gem cost is meaningless
	var forge = (String(o.constlevel) == '12')
		? 'cannot be forged'
		: Format.Gems(o.gemcost);

	h += '    <span class="nv-stats">';
	h += '<span class="nv-statcol">'
	   + litRow('Forge', forge)
	   + litRow('Paths', Format.Paths(o.mpath))
	   + '</span>';
	h += statColumn(o, ITEM_COL2, false, D);
	h += statColumn(o, ITEM_COL3, false, D);
	h += '    </span>';

	//everything the item grants, as icons where the ability set covers them
	var ab = abilityBlock(o, shown, D);
	var boosters = o.boosters ? Format.Booster(o.boosters) : '';

	if (boosters || ab.icons.length || ab.text.length) {
		h += '  <span class="nv-abil">';
		if (boosters) h += '<span class="nv-abpaths">'+boosters+'</span>';
		h += ab.icons.join('');
		h += ab.text.join('');
		h += '  </span>';
	}
	h += '  </span>';

	//---- parchment footer: the weapon the item is, then what it says -----
	var wlist = [];
	if (o.weapon && typeof o.weapon == 'object')        wlist.push(o.weapon);
	if (o.dancingweapon && typeof o.dancingweapon == 'object') wlist.push(o.dancingweapon);
	h += tablesBlock(wlist, null, null);

	h += descrStrip('item', o);

	h += closeCard();
	return h;
}


function groupLabel(key) {
	for (var i=0; i<GROUPS.length; i++) if (GROUPS[i].key == key) return GROUPS[i].label;
	return key;
}


////////////////////////////////////////////////////////////////////////////
// exported for the browse pages in MCardPages.js, which show these same cards
// without a nation to scope them
//
// an entry is what every renderer here takes: the object, which kind of card
// it is, and - for a unit - the section colour and the descriptor its typechar
// implies. Off a nation there is only ever the one descriptor.
////////////////////////////////////////////////////////////////////////////
MNationView.renderEntry = renderEntry;

MNationView.buildEntry = function(kind, o) {
	if (kind == 'spell') return { kind:'spell', obj:o, group:'spell', descriptors:[] };
	if (kind == 'item')  return { kind:'item',  obj:o, group:'item',  descriptors:[] };

	DMI.MUnit.prepareForRender(o);
	var d = descriptorOf(o.typechar);
	return { kind:'unit', obj:o, group:groupOf(o.typechar), descriptors: d ? [d] : [] };
}


////////////////////////////////////////////////////////////////////////////
// CardList - a scrollable list of cards, and everything it needs to behave
//
// Owns the parts that are the same wherever cards are shown: the face tabs and
// the swipe between them, the detail sheet a tap opens, and the description
// files the cards ask for. The page above it decides only WHICH cards.
//
// $page  the page root; handlers are delegated from here, and the sheet is
//        appended to it
// $list  the container the cards are painted into
////////////////////////////////////////////////////////////////////////////
MNationView.CardList = function($page, $list) {

	var that = this;

	$page.append(
		'<div class="nv-sheet" style="display:none">' +
		'  <div class="nv-sheet-bar">' +
		'    <button class="nv-back" type="button" style="display:none">&#8249; back</button>' +
		'    <button class="nv-close" type="button" aria-label="close">&times;</button>' +
		'  </div>' +
		'  <div class="nv-sheet-body"></div>' +
		'</div>'
	);
	var $sheet = $page.find('.nv-sheet');

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

	this.sheetOpen = function() { return $sheet.is(':visible'); }
	this.closeSheet = closeSheet;

	////////////////////////////////////////////////////////////////////////
	// painting
	////////////////////////////////////////////////////////////////////////
	this.paint = function(html) {
		$list.html(html);
		fetchDescriptions();
	}

	////////////////////////////////////////////////////////////////////////
	// descriptions
	//
	// fetched for the cards actually on the list, so switching a section on
	// later fetches only what it added, and anything looked at before costs
	// nothing (see descrStrip, which writes cached text straight into the
	// card).
	//
	// every placeholder is filled in one pass once they have all settled,
	// rather than each as it lands. the cards grow as text arrives, and a list
	// that reflows forty times under a thumb is unusable.
	////////////////////////////////////////////////////////////////////////
	function fetchDescriptions() {
		var pending = [], seen = {};

		$list.find('.nv-dsrc[data-url]').each(function(){
			var url = $(this).attr('data-url');
			if (seen[url] || _descrCache[url] !== undefined) return;
			seen[url] = 1;
			pending.push(url);
		});

		if (!pending.length) return paintDescriptions();

		var left = pending.length;
		for (var i=0; i<pending.length; i++) (function(url){
			$.ajax({ url: url, dataType: 'text' })
				.done(function(t){ _descrCache[url] = t; })
				.fail(function(){ _descrCache[url] = ''; })		//no such description
				.always(function(){ if (!--left) paintDescriptions(); });
		})(pending[i]);
	}

	function paintDescriptions() {
		//a placeholder whose file turned out not to exist is removed, not left
		//empty: the gap between two description blocks is a margin, and an
		//empty block still collects one
		$list.find('.nv-dsrc[data-url]').each(function(){
			var $s = $(this);
			var t = _descrCache[$s.attr('data-url')];
			if (t) $s.removeAttr('data-url').html(descrHtml(t));
			else   $s.remove();
		});

		//a strip with nothing in it is dropped rather than left as an empty
		//band - and dropping it hands the card's bottom corners back to
		//whatever strip is now last
		$list.find('.nv-descrbox').each(function(){
			var $b = $(this);
			if ($.trim($b.text())) $b.show(); else $b.remove();
		});
	}

	////////////////////////////////////////////////////////////////////////
	// faces: the other bodies on a card - a mount, a shape, a summoned unit
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
	//what a tap on this card should open: whichever face is on screen, which
	//for a mounted unit is the body the user swiped to and for a summoning
	//spell may be one of the things it calls up
	function cardRef($card) {
		var $f = $card.find('.nv-face.is-active');
		var ref = $f.length && $f.attr('data-ref');
		return ref || ($card.attr('data-kind') || 'unit') + ' ' + $card.attr('data-uid');
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

	//a reference the shared renderers put inside a card - a unit an effect
	//names - opens that object rather than the card's own
	$page.on('click', '.nv-card a.ref', function(e){
		var ref = $(this).find('input').val();
		if (ref) openSheet(ref);
		e.stopPropagation();
		e.preventDefault();
		return false;
	});

	$page.on('click', '.nv-card', function(){
		if (Date.now() - swipedAt < 500) return;
		openSheet(cardRef($(this)));
	});
	//the card is a div (see openCard), so give it back the keyboard
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
		openSheet(cardRef($card));
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

	//escape closes the sheet. a page with further layers of its own binds its
	//own handler and checks sheetOpen() first.
	$page.on('keydown', function(e){
		if (e.which == 27 && that.sheetOpen()) closeSheet();
	});
}


////////////////////////////////////////////////////////////////////////////
// the nation view
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
	var entries = [];			//everything it has - units, spells, items - sorted
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
		'</div>'
	);

	var $list   = $page.find('.nv-list');
	var $chips  = $page.find('.nv-chips').not('.nv-dchips');
	var $dchips = $page.find('.nv-dchips');
	var $empty  = $page.find('.nv-empty');
	var $picker = $page.find('.nv-picker');

	//the list of cards and everything it does once painted - tabs, swipe, the
	//detail sheet, description loading. this page only decides which cards.
	var cards = new MNationView.CardList($page, $list);

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
	// main list
	////////////////////////////////////////////////////////////////////////
	function selectNation(n) {
		nation = n;
		entries = n ? entriesForNation(n) : [];

		$page.find('.nv-nation-name').text(n ? n.fullname : 'Choose a nation');

		//remember for the permalink / cookie
		$('#nv-nation').val(n ? n.id : '').saveState();

		renderChips();
		renderList();
	}

	//counts per group, for the chips
	function counts() {
		var c = {};
		for (var i=0, e; e=entries[i]; i++)
			c[e.group] = (c[e.group]||0) + 1;
		return c;
	}

	//counts per recruitment descriptor. a unit buildable two ways counts under
	//both, which is what makes "how much can I raise in forest" answerable.
	function descriptorCounts() {
		var c = {};
		for (var i=0, e; e=entries[i]; i++) {
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

		for (var i=0, e; e=entries[i]; i++) {
			var g = e.group;
			if (hidden[g]) continue;
			if (descriptorHidden(e)) continue;
			if (q && String(e.obj.searchable||e.obj.name||'').toLowerCase().indexOf(q) == -1) continue;

			if (g != lastGroup) {
				h += '<div class="nv-group-head" data-group="'+g+'">'+Utils.escapeHtml(groupLabel(g))+'</div>';
				lastGroup = g;
			}
			h += renderEntry(e);
			shown++;
		}

		cards.paint(h);
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

	//the app's "advanced" checkbox decides how much a card says - see
	//isAdvanced. it lives in the shared header, which this page borrows, so
	//bind to it directly and redraw. deferred, so the click has set the
	//checkbox and main.js has updated DMI.Options first.
	$('#showids').on('click', function(){
		setTimeout(function(){ if (isVisible) renderList(); }, 0);
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

	//escape closes the picker - the CardList has already dealt with the sheet,
	//which sits above it
	$page.on('keydown', function(e){
		if (e.which != 27) return;
		if (!cards.sheetOpen() && $picker.is(':visible')) closePicker();
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
