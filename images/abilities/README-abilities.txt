Unit ability icons
==================

These are the game's own ability icons, as catalogued on the community wiki:

    https://illwiki.com/dom5/unit-abilities

Each file keeps the name the wiki uses, so an icon can be traced back to its
entry there (images/abilities/trample.png <- .../_media/abilities/trample.png).

They are used by the nation card view to show an ability as its in-game icon
instead of a word, which is what the game itself does. In the game you hover an
icon to see what it is; on a touchscreen you cannot hover, so the card prints
the ability's number on the icon and keeps the name as a tooltip/aria-label.

The mapping from an inspector property key to an icon lives in
scripts/DMI/abilityicons.js. It is deliberately partial: abilities the wiki has
no icon for are rendered as text, and anything that is a data field rather than
an ability (basecost, recruited from, mount, ...) is never iconified.

To regenerate or extend the mapping, parse the ability table out of the wiki
page above (icon filename, label) and match it against the tag vocabulary the
inspector exposes as DMI.MUnit.display.flags / .aliases.

Artwork is Illwinter's, as with the unit sprites and item images already in
this repository.

Note on a file that is not named after a wiki ability:
  acid_damage.png  <- _media/abilities/unknown/0140.png  (the wiki keeps this
                      one in its "unknown" sub-namespace; it is the acid
                      damage icon)

Composed file, not from the wiki:
  berserk_when_blessed.png
      The game has no icon for this one, so it is the berserker icon with the
      blessed icon set into its top-left corner (a 15px copy, with a dark halo
      so it separates from the figure beneath). The berserker stays the
      dominant symbol; the candles read as the qualifier. Rebuild with:

          from PIL import Image, ImageFilter
          base  = Image.open('berserker.png').convert('RGBA')
          badge = Image.open('blessed.png').convert('RGBA').resize((15,15), Image.LANCZOS)
          halo  = Image.new('RGBA', (15,15), (20,18,14,255))
          halo.putalpha(badge.getchannel('A').filter(ImageFilter.MaxFilter(3))
                             .point(lambda v: min(255, int(v*0.85))))
          out = base.copy()
          out.alpha_composite(halo, (0,0)); out.alpha_composite(badge, (0,0))
          out.save('berserk_when_blessed.png')

One more file is not from the wiki:
  spiritform.png
      The game has no ability icon for it, so this is the Ancestral Spirit's
      own unit sprite (images/sprites/1363_1.png), fitted into a 32x32 box:

          from PIL import Image
          src = Image.open('images/sprites/1363_1.png').convert('RGBA')
          out = Image.new('RGBA', (32,32), (0,0,0,0))
          s = src.copy(); s.thumbnail((32,32), Image.LANCZOS)
          out.alpha_composite(s, ((32-s.width)//2, (32-s.height)//2))
          out.save('images/abilities/spiritform.png')

Four icons are the game's ITEM pictures rather than ability icons, fitted into
the same 32x32 box (images/items/item<id>.png):

  prot_natural.png  <- item 240, Kithaironic Lion Pelt   natural protection
  prot_head.png     <- item 185, Blacksteel Helmet       protection, head
  prot_body.png     <- item 230, Blacksteel Plate        protection, body

  (invulnerability.png is a real ability icon, used on the same line.)

Two icons are used for a property whose meaning turns on its sign:
  cause_unrest.png / reduces_unrest.png   for `incunrest`, positive/negative

And two are used for a key the wiki names differently:
  assassin.png       for `patience`, which IS the assassin ability
  water_breathing.png for both `waterbreathing` and `giftofwater`
