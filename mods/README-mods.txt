Bundled mods
============

Two mods ship here so the inspector can offer them as one-click checkboxes in
the header (see #quick-mods in index.html, wired in scripts/main.js). Everything
else still goes through [load mods] or a local upload.

    WH_6_5_dom-clockwork_v6.51.dm    "Worthy_Heroes 6.51"
    DomEnhanced-clockwork_v2.16.dm   "Dominions Enhanced v2.16 (Latest)"

Taken from ~/.dominions6/mods/ . Both are community mods; their authors are
credited in each file's #description.


The sprite directories
----------------------

The subdirectories here hold those mods' artwork, converted. The inspector asks
for a mod sprite at  mods/<path>  with any .tga rewritten to .png (see "set
sprite url" in scripts/DMI/MUnit.js), so the .tga files the mods ship cannot be
served as they are.

Converting is not just a change of container. Dominions sprite files are opaque,
with the figure sitting on a pure black background:

  * Black is the background colour, but it is ALSO used inside the art as
    outline - most shipped vanilla sprites carry 30-150 opaque black pixels. A
    global colour key punches holes in the figure. Only the black CONNECTED TO
    THE BORDER is background, so the conversion floods in from the edges.

  * A bright magenta strip under the figure is a baseline marker the game does
    not draw. It is not one fixed colour: (255,0,255) and (248,0,248) are both
    common and (255,2,255) turns up too, so the test is "bright magenta"
    (r>=240, b>=240, g<=8) rather than an exact value. Purples that appear in
    real art have a green channel well clear of zero.

  * The result is cropped to its content, as the shipped vanilla sprites are.
    A 64x64 canvas with transparent margins would render visibly smaller than a
    vanilla unit inside the card's fixed sprite box.

Regenerate with the script beside this file:

    python3 mods/convert-mod-sprites.py <mod dir> <mod .dm filename> mods/

It ships only the files the .dm actually names, and does the transparency work
only for sprite commands - a banner or an icon is copied as it is.

Sizes: 3904 .tga + 654 .png of source art (41 MB) become 4854 .png (13.3 MB),
the saving mostly from cropping.

Both mods name a few sprites they do not ship - 25 in Dominions Enhanced, 3 in
Worthy Heroes (Merlin and Morgana). Those units get no picture, and the card
hides the broken image rather than showing the browser's placeholder.
