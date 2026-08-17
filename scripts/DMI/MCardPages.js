//namespace scope
(function( DMI, $, undefined ){

////////////////////////////////////////////////////////////////////////////
// Browse pages - the card view for the Unit, Item and Spell tabs
//
// The Nation view answers "what does this nation have". These answer "what is
// there", which is the only way to reach a unit no nation fields: an
// independent, a horror, a monster summoned by a generic spell.
//
// They render the same cards as the Nation view (MNationView.renderEntry) and
// reuse its CardList for everything a painted list does - the face tabs, the
// swipe, the detail sheet, the description files. All that is new here is
// choosing which objects to show.
//
// Filtering is deliberately the minimum: a name search and a type select,
// mirroring the legacy tabs' own two controls. More to come.
////////////////////////////////////////////////////////////////////////////

var MCardPages = DMI.MCardPages = DMI.MCardPages || {};

var Utils = DMI.Utils;
var modctx = DMI.modctx;


//A card is not cheap - stats, weapons, abilities, a description fetch - and
//there are 4348 units before any mod. Building every match would lock the page
//up for seconds, so the list stops here and says so; the search box is how you
//get at the rest.
var LIMIT = 250;


////////////////////////////////////////////////////////////////////////////
// unit types
//
// the coarse classes the legacy Unit tab's "type" select offers, derived from
// typechar rather than from that select's very long comma-separated option
// values. The classes deliberately overlap as the legacy ones do: a summoned
// commander is both a Commander and a Summon.
////////////////////////////////////////////////////////////////////////////
function typechar(u) { return String(u.typechar || ''); }

var UNIT_TYPES = [
	{ value:'',          label:'all units' },
	{ value:'cmdr',      label:'Commanders', test:function(u){ return /^(cmdr|commander|mage|priest|scout)/i.test(typechar(u)); } },
	{ value:'troop',     label:'Units',      test:function(u){ return /^unit/i.test(typechar(u)); } },
	{ value:'summon',    label:'Summoned',   test:function(u){ return /summon/i.test(typechar(u)); } },
	{ value:'pretender', label:'Pretenders', test:function(u){ return typechar(u) == 'Pretender'; } },
	{ value:'hero',      label:'Heroes',     test:function(u){ return /hero/i.test(typechar(u)); } }
];

//item types, as the legacy Item tab lists them. melee/missile are not stored
//types but a class the data layer derives from the attached weapon.
var ITEM_TYPES = [
	{ value:'',        label:'all item types' },
	{ value:'misc',    label:'Miscellaneous' },
	{ value:'helm',    label:'Helmets' },
	{ value:'crown',   label:'Crowns' },
	{ value:'armor',   label:'Armor' },
	{ value:'shield',  label:'Shields' },
	{ value:'boots',   label:'Boots' },
	{ value:'1-h wpn', label:'1-h weapons' },
	{ value:'2-h wpn', label:'2-h weapons' },
	{ value:'missile', label:'Missile' },
	{ value:'barding', label:'Barding' },
	{ value:'melee',   label:'All melee weapons',   test:function(o){ return o.wpnclass == 'melee'; } },
	{ value:'@missile',label:'All missile weapons', test:function(o){ return o.wpnclass == 'missile'; } }
];

var SPELL_TYPES = [
	{ value:'',       label:'ritual / combat' },
	{ value:'Ritual', label:'Rituals' },
	{ value:'Combat', label:'Combat spells' }
];


////////////////////////////////////////////////////////////////////////////
// what each page browses
//
// `grid` is the legacy slickgrid page of the same data, which the [table]
// button switches to - everything the card view cannot filter on yet is
// still there.
////////////////////////////////////////////////////////////////////////////
var KINDS = {
	unit: {
		page: 'unitcards', grid: 'unit', noun: 'units',
		types: UNIT_TYPES,
		data: function(){ return modctx.unitdata; },
		//the data layer clones a unit once per way a nation gets it, giving the
		//copies fractional ids. Off a nation those are the same unit, so only
		//the whole-numbered original is listed.
		skip: function(u){ return u.name === 'Empty' || Math.floor(u.id) != u.id; }
	},
	item: {
		page: 'itemcards', grid: 'item', noun: 'items',
		types: ITEM_TYPES,
		data: function(){ return modctx.itemdata; },
		match: function(o, v){ return o.type == v; }
	},
	spell: {
		page: 'spellcards', grid: 'spell', noun: 'spells',
		types: SPELL_TYPES,
		data: function(){ return modctx.spelldata; },
		match: function(o, v){ return o.type == v; },
		//unresearchable spells are debris or links in a nextspell chain; a
		//player can never cast one deliberately. Same rule as the Nation view.
		skip: function(o){ return String(o.school) == '-1'; }
	}
};


////////////////////////////////////////////////////////////////////////////
// the page
////////////////////////////////////////////////////////////////////////////
MCardPages.View = function(kind) {

	var K = KINDS[kind];
	var $page = $('#' + K.page + '-page');
	var isVisible = false;

	var filter = '';
	var type = '';

	////////////////////////////////////////////////////////////////////////
	// skeleton
	//
	// .nv-shared is where the app's shared header gets parked while this page
	// is on screen - see CGrid.show(), which moves that same element.
	////////////////////////////////////////////////////////////////////////
	var opts = '';
	for (var i=0, t; t=K.types[i]; i++)
		opts += '<option value="'+Utils.escapeHtml(t.value)+'">'+Utils.escapeHtml(t.label)+'</option>';

	$page.append(
		'<div class="nv-root">' +
		'  <div class="nv-shared"></div>' +
		'  <div class="nv-bar">' +
		'    <select class="nv-type">' + opts + '</select>' +
		'    <input class="nv-search" type="search" placeholder="filter by name" autocomplete="off" />' +
		'    <button class="nv-alt" type="button" title="the table view of the same data, with the full set of filters">table</button>' +
		'  </div>' +
		'  <div class="nv-count"></div>' +
		'  <div class="nv-list"></div>' +
		'  <div class="nv-empty" style="display:none"></div>' +
		'</div>'
	);

	var $list  = $page.find('.nv-list');
	var $count = $page.find('.nv-count');
	var $empty = $page.find('.nv-empty');

	var cards = new DMI.MNationView.CardList($page, $list);

	////////////////////////////////////////////////////////////////////////
	// selection
	////////////////////////////////////////////////////////////////////////
	function typeTest() {
		if (!type) return null;
		for (var i=0, t; t=K.types[i]; i++)
			if (t.value == type)
				return t.test || function(o){ return K.match(o, type); };
		return null;
	}

	function matches() {
		var q = filter.toLowerCase();
		var test = typeTest();
		var out = [];

		var data = K.data() || [];
		for (var i=0, o; o=data[i]; i++) {
			if (K.skip && K.skip(o)) continue;
			if (q && String(o.searchable || o.name || '').toLowerCase().indexOf(q) == -1) continue;
			if (test && !test(o)) continue;
			out.push(o);
		}

		out.sort(function(a,b){
			var na = String(a.name||''), nb = String(b.name||'');
			return na < nb ? -1 : na > nb ? 1 : (parseInt(a.id)||0) - (parseInt(b.id)||0);
		});
		return out;
	}

	function render() {
		var found = matches();
		var shown = Math.min(found.length, LIMIT);

		var h = '';
		for (var i=0; i<shown; i++) {
			try { h += DMI.MNationView.renderEntry(DMI.MNationView.buildEntry(kind, found[i])); }
			catch(e) { }		//one bad row must not empty the whole page
		}
		cards.paint(h);

		if (!found.length) {
			$count.text('');
			$empty.show().text(filter ? 'Nothing matches "'+filter+'".' : 'Nothing to show.');
			return;
		}
		$empty.hide();
		var noun = found.length == 1 ? K.noun.replace(/s$/, '') : K.noun;
		$count.text(found.length > shown
			? 'showing ' + shown + ' of ' + found.length + ' ' + K.noun + ' - narrow the search to see the rest'
			: found.length + ' ' + noun);
	}

	////////////////////////////////////////////////////////////////////////
	// events
	////////////////////////////////////////////////////////////////////////
	$page.on('input', '.nv-search', function(){ filter = this.value; render(); });
	$page.on('change', '.nv-type',  function(){ type = this.value; render(); });
	$page.on('click',  '.nv-alt',   function(){ DMI.showPage(K.grid); });

	//the cards say less by default; redraw when that switch moves
	$('#showids').on('click', function(){
		setTimeout(function(){ if (isVisible) render(); }, 0);
	});

	////////////////////////////////////////////////////////////////////////
	// page interface (see DMI.pages in main.js)
	////////////////////////////////////////////////////////////////////////
	var painted = false;

	this.show = function() {
		if (isVisible) return;
		isVisible = true;
		$page.show();

		//take custody of the shared header, and hide the grid filter panels -
		//they belong to the slickgrid pages, not to this one
		$page.find('.nv-shared').append($('#primary-details'));
		$('#primary-details div.panel').hide();

		//first look: build the list. later visits keep what is there.
		if (!painted) { painted = true; render(); }
	}
	this.hide = function() {
		if (!isVisible) return;
		isVisible = false;
		$page.hide();
	}
	//no id column to toggle, and no hover-preview to detach
	this.showIds = function() {}
	this.detachShowingDetails = function() {}
}

//one constructor per tab, so the registry in main.js can name them
MCardPages.Units  = function(){ return new MCardPages.View('unit'); }
MCardPages.Items  = function(){ return new MCardPages.View('item'); }
MCardPages.Spells = function(){ return new MCardPages.View('spell'); }

//namespace args
}( window.DMI = window.DMI || {}, jQuery ));
