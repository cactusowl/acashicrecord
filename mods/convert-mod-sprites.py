#!/usr/bin/env python3
"""Bring a mod's sprite art into the inspector.

The inspector asks for a mod sprite at mods/<path>, with any .tga in the mod
command rewritten to .png (see MUnit.js "set sprite url"). So the art has to be
converted, and it has to be converted the way the shipped vanilla sprites were:

  * Dominions sprite files are opaque, on a pure black background. But pure
    black is ALSO used inside the art as outline - most shipped sprites carry
    30-150 opaque black pixels - so a global colour key punches holes in the
    figure. Only the black CONNECTED TO THE BORDER is background.
  * A magenta (255,0,255) strip under the figure is a baseline marker the game
    does not draw. The shipped sprites contain no magenta at all.
  * The shipped sprites are cropped to their content. Leaving a 64x64 canvas
    with transparent margins would make modded units render visibly smaller
    than vanilla ones inside the card's fixed sprite box.

A sprite that already carries real alpha is trusted as-is and only cropped.
"""

import os, re, shutil, sys
import numpy as np
from scipy import ndimage
from PIL import Image

def is_marker(rgb):
    """The baseline strip under a sprite, which the game does not draw.

    Not one fixed colour: (255,0,255) and (248,0,248) are both common and
    (255,2,255) turns up too, so this keys on "bright magenta" rather than an
    exact value. Purples that appear in actual art - (184,104,184) and the
    like - have a green channel well above zero and are left alone.
    """
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r >= 240) & (b >= 240) & (g <= 8)


def keyed(im):
    """Opaque sprite on a black background -> transparent background."""
    a = np.array(im)
    rgb, alpha = a[..., :3], a[..., 3]

    # the marker is never art, so it goes whatever else the file does
    already_keyed = alpha.min() < 255
    alpha[is_marker(rgb)] = 0

    if already_keyed:                   # the file has real alpha: trust it
        a[..., 3] = alpha
        return Image.fromarray(a, 'RGBA')

    background = np.all(rgb == 0, axis=-1) | (alpha == 0)
    lbl, _ = ndimage.label(background)  # 4-connected: no diagonal leaks
    edge = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
    edge.discard(0)
    if edge:
        alpha[np.isin(lbl, list(edge))] = 0

    a[..., 3] = alpha
    return Image.fromarray(a, 'RGBA')


def convert(src, dst, is_sprite):
    im = Image.open(src).convert('RGBA')
    if is_sprite:
        im = keyed(im)
        box = im.getchannel('A').getbbox()
        if box:
            im = im.crop(box)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, optimize=True)
    return im.size


def referenced(dm_path):
    """Every file the mod names, and whether the command is a sprite one."""
    out = {}
    text = open(dm_path, encoding='utf-8', errors='replace').read()
    for cmd, path in re.findall(r'#(\w+)\s+"([^"]+\.(?:tga|png))"', text, re.I):
        p = path.replace('\\', '/').lstrip('./')
        out.setdefault(p, False)
        if 'spr' in cmd.lower():
            out[p] = True               # sprite: needs the transparency work
    return out


def main(mod_dir, dm_name, dest_root):
    dm = os.path.join(mod_dir, dm_name)
    refs = referenced(dm)

    made = missing = copied = 0
    total = 0
    for rel, is_sprite in sorted(refs.items()):
        src = os.path.join(mod_dir, rel)
        if not os.path.exists(src):
            # the mod command may name .tga where the file on disk is .png
            alt = os.path.splitext(src)[0] + ('.png' if src.lower().endswith('.tga') else '.tga')
            if os.path.exists(alt):
                src = alt
            else:
                missing += 1
                continue

        # the inspector always asks for .png
        dst = os.path.join(dest_root, os.path.splitext(rel)[0] + '.png')
        try:
            convert(src, dst, is_sprite)
            made += 1 if is_sprite else 0
            copied += 0 if is_sprite else 1
            total += os.path.getsize(dst)
        except Exception as e:
            print('  FAILED %s: %s' % (rel, e))
            missing += 1

    print('%s: %d sprites, %d other, %d unresolved, %.1f MB'
          % (dm_name, made, copied, missing, total / 1e6))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
