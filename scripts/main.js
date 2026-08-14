//read options from querystring (ignore cookie)$('#showmodcmds:checked').prop('checked'
//DMI.Options['Show mod cmds'] = (location.search.indexOf('showids')!=-1 && location.search.indexOf('showmodcmds=1')!=-1);
DMI.Options['Ignore mods'] = (location.search.indexOf('showids=1')!=-1 && location.search.indexOf('ignoremods=1')!=-1);
DMI.Options['Custom js'] = location.search.indexOf('customjs=1')!=-1;
DMI.Options['Load events'] = location.search.indexOf('loadEvents=1')!=-1;
//?profile=1 logs how long each data-prep phase takes (see loaddata.js)
DMI.Options['Profile'] = location.search.indexOf('profile=1')!=-1;

//on page load
$(function() {
	console.log('D3MI VERSION: '+versionCode);

	//begin the loading process (loaddata.js)..
	DMI.continueLoading();
});

DMI.isFirefoxBrowser = function()
{
    return typeof InstallTrigger !== 'undefined';
};


////////////////////////////////////////////////////////////////////////////
// page registry
//
// one entry per tab. `module` is the DMI namespace holding the CGrid subclass.
// grids are constructed lazily on first visit and cached in `grid`.
// order here is the display order, and also the ctrl+left/right cycle order.
////////////////////////////////////////////////////////////////////////////

// `ctor` names the constructor on the module, defaulting to the slickgrid one.
// the nation page is a card view rather than a grid, so it supplies its own -
// it only has to implement show/hide/showIds/detachShowingDetails.
DMI.pages = [
	{ name: 'nation',module: 'MNationView', ctor: 'View' },
	{ name: 'item',  module: 'MItem'  },
	{ name: 'spell', module: 'MSpell' },
	{ name: 'unit',  module: 'MUnit'  },
	{ name: 'site',  module: 'MSite'  },
	{ name: 'merc',  module: 'MMerc'  },
	{ name: 'event', module: 'MEvent' },
	{ name: 'wpn',   module: 'MWpn'   },
	{ name: 'armor', module: 'MArmor' }
];

//calls fn(grid, page) for every grid that has been constructed so far
DMI.eachGrid = function(fn) {
	for (var i=0, p; p=DMI.pages[i]; i++)
		if (p.grid) fn(p.grid, p);
}

//called from loaddata.js once all data is loaded
DMI.initGrids = function() {
	if (!DMI.Options['Custom js'])
		$('.customjs').hide();

	//data dump
	if (location.search.indexOf('dumpunitkeys') != -1) {
		var keys = null;
		var res = /dumpunitkeys=([^\&]*)/.exec(location.search);
		if (res)
			keys = res[1].split(/[,\t]/);

		$('#modtext').css({width:'100%', height:'100%', position:'absolute', top:0, left:0})
		.show().val( DMI.MUnit.dumpCSV(keys) ).focus().select();
		return;
	}

	//wire up toggle ids button
	function showOrHideIds() {
		if ($('#showids').saveState().is(':checked')) {
			//add style
			$( "<style>.hidden-block { display:block; } tr.hidden-row { display:table-row; } .hidden-inline {display:inline; }</style>" ).appendTo( "head" );

			if (DMI.isFirefoxBrowser()) {
				$(".grid-container").css({left:'430px'})
				$("div.static-overlay-container").css({width:'430px'})
			} else {
				$(".grid-container").css({left:'375px'})
				$("div.static-overlay-container").css({width:'375px'})
			}

			DMI.eachGrid(function(g){ g.showIds(1); });

			DMI.Options['Show ids'] = 1;
			PaneManager.option_drag_anywhere = 0;
		}
		else {
			$( "<style>.hidden-block, tr.hidden-row, .hidden-inline { display:none; }</style>" ).appendTo( "head" );

			if (DMI.isFirefoxBrowser()) {
				$(".grid-container").css({left:'350px'})
				$("div.static-overlay-container").css({width:'350px'})
			} else {
				$(".grid-container").css({left:'343px'})
				$("div.static-overlay-container").css({width:'343px'})
			}

			DMI.eachGrid(function(g){ g.showIds(0); });

			DMI.Options['Show ids'] = 0;
			PaneManager.option_drag_anywhere = 1;

			//clear advanced filters
			$("div.hidden-block div.panel input.clear-filters-btn").trigger('click');

			//go to valid page (wpn/armor are advanced-mode only)
			if ($("#wpn-page:visible, #armor-page:visible").length)
				DMI.showPage('item');

		}
		showOrHideModdingInfo();
		showOrHideKeys();
		showOrHideModCmds();
		showOrHideDescriptions();
	}
	$('#showids').click( function(){setTimeout(showOrHideIds,0);} ); //asynchronous call as its a bit sluggish

	function showOrHideModdingInfo() {
		if ($('#showmoddinginfo').saveState().is(':checked') && DMI.Options['Show ids']) {
			//add style
			$( "<style>.modding-block { display:block; } tr.modding-row { display:table-row; } .modding-inline {display:inline; }</style>" ).appendTo( "head" );

			DMI.Options['Show modding info'] = 1;
		}
		else {
			$( "<style>.modding-block, tr.modding-row, .modding-inline { display:none; }</style>" ).appendTo( "head" );

			DMI.Options['Show modding info'] = 0;

			//clear advanced filters
			$("div.modding-block div.panel input.clear-filters-btn").trigger('click');
		}
	}
	$('#showmoddinginfo').click( function(){setTimeout(showOrHideModdingInfo,0);} ); //asynchronous call as its a bit sluggish


	function showOrHideKeys() {
		if ($('#showkeys').saveState().is(':checked') && DMI.Options['Show ids']) {
			//add style
			$( "<style>.internal-block { display:block; } tr.internal-row { display:table-row; } .internal-inline {display:inline; }</style>" ).appendTo( "head" );

			DMI.Options['Show internal keys'] = 1;
		}
		else {
			$( "<style>.internal-block, tr.internal-row, .internal-inline { display:none; }</style>" ).appendTo( "head" );

			DMI.Options['Show internal keys'] = 0;
		}
	}
	$('#showkeys').click( function(){setTimeout(showOrHideKeys,0);} );  //asynchronous call as its a bit sluggish


	function showOrHideModCmds() {
		if ($('#showmodcmds').saveState().is(':checked') && DMI.Options['Show ids']) {
			$('a.show-mod-commands').trigger('click');
			DMI.Options['Show mod cmds'] = 1;
		}
		else {
			$('a.hide-mod-commands').trigger('click');
			DMI.Options['Show mod cmds'] = 0;
		}
	}
	$('#showmodcmds').click( function(){setTimeout(showOrHideModCmds,0);} );  //asynchronous call as its a bit sluggish

	function showOrHideDescriptions() {
		if ($('#hidedescriptions').saveState().is(':checked')) {
			$( "<style>.overlay-descr { display:none !important; }</style>" ).appendTo( "head" );

			DMI.Options['Show descriptions'] = 0;
		}
		else {
			$( "<style>.overlay-descr { display:block !important; }</style>" ).appendTo( "head" );
			DMI.Options['Show descriptions'] = 1;
		}
	}
	$('#hidedescriptions').click( function(){setTimeout(showOrHideDescriptions,0);} );  //asynchronous call as its a bit sluggish


	//jquery plugin. no shit
	if (!$.fn.reverse) $.fn.reverse = [].reverse;

	//wire up global-clear-filters-btn
	$("#global-clear-filters-btn").click(function() {
		//we do it in reverse so the first input ends up focused
		$("input.clear-filters-btn:visible").reverse().trigger('click');
	});


	////////////////////////////////////////////////////////////////////////
	// page switching
	////////////////////////////////////////////////////////////////////////

	//show one page, hiding the rest. grid construction is deferred until
	//a page is first opened (building all eight up front is slow).
	DMI.showPage = function(name) {
		var page = null;
		for (var i=0, p; p=DMI.pages[i]; i++) {
			if (p.name == name) page = p;
			else if (p.grid) p.grid.hide();
		}
		if (!page) return;

		if (!page.grid)
			page.grid = new DMI[page.module][page.ctor || 'CGrid']();

		page.grid.show();

		$(".page-button").prop('disabled', false).removeClass('disabled');
		$("#"+name+"-page-button").prop('disabled', true).addClass('disabled');

		//focus search box
		$("div.filters-text."+name+"view input.search-box").focus();

		DMI.Utils.saveState();
	}

	for (var i=0, p; p=DMI.pages[i]; i++) {
		//bind name per iteration (var is function scoped)
		(function(name){
			$("#"+name+"-page-button").click(function(){ DMI.showPage(name); });
		})(p.name);
	}

	//names of pages whose tab button is currently visible, in display order
	function visiblePageNames() {
		var names = [];
		for (var i=0, p; p=DMI.pages[i]; i++)
			if ($("#"+p.name+"-page-button:visible").length) names.push(p.name);
		return names;
	}

	//step to the next/previous visible page, wrapping around
	function cyclePage(step) {
		var names = visiblePageNames();
		if (!names.length) return;

		var current = ($('div.page').filter(':visible').attr('id') || '').replace('-page','');
		var idx = names.indexOf(current);
		if (idx == -1) idx = 0;

		DMI.showPage( names[ (idx + step + names.length) % names.length ] );
	}

	DMI.onKeyDown = function(e){
		//console.log('keyCode: '+e.keyCode);

		//open first result on enter
		if (e.which == 13) {
			DMI.eachGrid(function(g){ g.detachShowingDetails(); });
		}
		//remove last popup on escape
		//or clear filters if all closed
		else if (e.which == 27) {
			var highest = null, highestZIndex = -1;
			$('div.overlay.popup').each(function(){
				var zIndex = parseInt(this.style.zIndex);
				if (zIndex > highestZIndex) {
					highest = this;
					highestZIndex = zIndex;
				}
			});
			if (highest) {
				$(highest).find('.overlay-pin').trigger('click');
				$('input.search-box:visible').focus();
			}
			else {
				$('input#global-clear-filters-btn').trigger('click');
				$('input.search-box:visible').focus();
			}
		}
		//ctrl+left/right changes tab
		else if (e.ctrlKey) {
			if (e.which == 37)		cyclePage(-1);
			else if (e.which == 39)	cyclePage(1);
		}
	}
	$('html').on('keydown', DMI.onKeyDown);

	//sprite swap. delegated so it works in the fixed overlay and in popups,
	//and so sprite urls never have to be interpolated into inline javascript.
	$(document).on('click', 'img.sprite-toggle', function() {
		var $img = $(this);
		var spr1 = $img.attr('data-spr1'), spr2 = $img.attr('data-spr2');
		if (!spr2) return;
		$img.attr('src', this.src.indexOf(spr1) != -1 ? spr2 : spr1);
	});

	//wire up unpin-all btn
	$("#global-unpin-all-btn").click(function(e) {
		//trigger click on every pin
		$('input.overlay-pin:visible').trigger('click');
		$('input.search-box:visible').focus();
	});
	//show or hide unpin all button on pane changes
	PaneManager.onUpdate( function() {
		if ($("input.overlay-pin:visible").length)
			$('#global-unpin-all-btn').show();
		else
			$('#global-unpin-all-btn').hide();
	});


	//display shared panels (hidden while loading)
	$("div.primary-panel").show();
	$("#advanced-options").show();

	//load state from cookie/url
	DMI.Utils.loadState();
	$('#nation').trigger('change');

	//process loaded state
	showOrHideIds();

	//save state to cookie on pane changes
	PaneManager.onUpdate(DMI.Utils.saveState);
}
