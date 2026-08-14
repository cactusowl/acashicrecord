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
