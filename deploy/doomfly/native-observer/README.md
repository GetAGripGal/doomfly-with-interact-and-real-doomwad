# Native spectator renderer

The primary ViZDoom 1.3.0 engine stays unmodified. An optional second engine
uses a small render-only patch against the official 1.3.0 source. It consumes
exactly the primary's actions and episode resets. After every action, the
observer compares RGB bytes, game counters, all exported objects and sector
geometry. A mismatch closes the spectator path, not the neural experiment.

`build.sh` downloads a hash-pinned official archive, applies `observer.patch`,
and builds the native executable. Use the installed Python environment's exact
`vizdoom.pk3` and Freedoom IWAD. On macOS the build requires Xcode command line
tools, CMake, Boost and SDL2. Source and engine output are local build artifacts;
no compiled engine or extracted game artwork is committed here.

The private `doomfly_view` engine command renders while waiting for an action;
it calls no ticker, save/load, or action function. It temporarily overrides
renderer view coordinates and hides the first-person weapon. Actor coordinates,
player view, controls and neural inputs are untouched. It restores the ordinary
view before accepting the next action. The command bypasses the ordinary CVAR
refresh because reapplying `r_maxparticles` erases particles, even with the same
value. That side effect was caught by the RGB equivalence test.

The exported buffer contains the native RGB image, engine projection and actual
camera coordinates, approximate 8-bit depth, and current weapon/flash sprite
pixels and frame metadata. A nonce acknowledges completion without a game tic.
Only a process-local temporary output path is accepted. The HTTP endpoint
accepts five bounded numbers; it never accepts commands or filesystem paths.
Rendering is serialized, globally capped at 24 requests/second, and unavailable
when the mirror is stale or mismatched. Requests cannot control the player.

The browser overlays the procedural fly and original weapon sprites. Enemies,
textures, projectiles and impact effects are rendered by Doom. There are no
invented bullets, attack events or enemies. Weapon and monster art remain Doom
sprites, not fabricated polygon models. Wings are decorative. Avatar occlusion
has a small tolerance because the native 8-bit depth is approximate.

The native camera has its own same-tick game counters. The main first-person
broadcast is buffered and may show a slightly older instant. Camera requests
render fresh views of existing game ticks; 30 fps video does not imply 30 neural
or game updates per wall-clock second.

Validation: `python -m pytest tests/test_doom_native_observer.py` checks three
seeds, 1,500 prescribed game ticks, 216 random viewpoints, repeated resets,
identical RGB/game/object state, request validation, and deliberate divergence.
The prescribed actions exist only in tests; live actions are neural outputs.

Licensing: the patch modifies ViZDoom/ZDoom files and preserves the original
headers. Apply the upstream license terms for those files. Do not distribute a
compiled engine without its corresponding source and required notices. The
runtime uses Freedoom art from the installed package, never a commercial Doom
IWAD. See the repository's third-party notices and upstream COPYING files.
