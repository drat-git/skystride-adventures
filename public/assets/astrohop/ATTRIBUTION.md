# Astro Hop source and art attribution

SkyStride's version 2 runtime ports Astro Hop by Nuno Amorim (2026), under the MIT license reproduced in `LICENSE-AstroHop.txt`. The inspected source is https://github.com/nunoamorim99/AstroHop at commit `65dc9b74711f5bd70e325b88d5bc5f85c38a8b12`.

The three packed PNG sheets are unmodified Kenney Pixel Platformer 1.2 art (CC0), downloaded as part of Astro Hop. `LICENSE-Kenney.txt` is the original notice. Source asset paths and dimensions:

| Shipped asset | Astro Hop original | Frame size |
| --- | --- | --- |
| characters.png | public/assets/kenney_pixel-platformer/Tilemap/tilemap-characters_packed.png | 24 × 24 |
| tiles.png | public/assets/kenney_pixel-platformer/Tilemap/tilemap_packed.png | 18 × 18 |
| backgrounds.png | public/assets/kenney_pixel-platformer/Tilemap/tilemap-backgrounds_packed.png | 24 × 24 |

Ported code:

- `src/runtime/Player.ts`: movement constants, state transitions, animations, fixed effective hitbox calculation, squash/stretch, damage and star effects from `src/objects/Player.js`.
- `src/runtime/Enemy.ts`: walker patrol, ledge probing, stomp and knock-away from `src/objects/Walker.js`; original turtle, winged, and shell extensions.
- `src/runtime/AudioEngine.ts` and `src/runtime/music.ts`: synthesized effects and the overworld/cave musical loops from `src/audio/sfx.js`; per-mount lifecycle and scheduled-note cleanup added. The separate eight-bar sky theme, **Skyward Steps**, is an original SkyStride composition made for this project. It uses the same synthesized square-wave lead and triangle-wave bass, with no samples or third-party song recording.
- `src/runtime/assets.ts`: packed-sheet loading, source animation indices, generated palette swaps and keyed parallax strip from `src/scenes/PreloadScene.js`.
- `src/runtime/CourseScene.ts`: terrain runs, source collisions, block interactions, power-up emergence, collectibles, projectiles, particles, flag sequence, and camera tuning from `src/scenes/GameScene.js`.

SkyStride modifications include saved-course data, checkpoint retry menus, attempt-local collectible retention, scoped input/focus cleanup, DOM HUD/state callbacks, read-only snapshots, reduced-motion decorative effects, moving platforms, and the original sky pack. The sky turtle/shell/wings, glowing blocks and sky terrain are new programmatic pixel drawings in the Kenney palette and frame scale; they contain no Nintendo assets. No pipe code, pipe textures, entrance/destination mechanics, or question-mark block art is used by the runtime. The packed original tilesheet contains unused source tiles; loaders select only the documented non-question frames.
