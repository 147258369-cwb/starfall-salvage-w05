# Starfall Salvage — W05 3D game

A compact browser-based 3D salvage game built with HTML, CSS, JavaScript and Three.js. Recover six energy shards while avoiding asteroids; three collisions end the run.

## Run locally
1. Keep `index.html` in this folder.
2. Open it in a current desktop browser with internet access (the Three.js ES module is loaded from jsDelivr CDN).
3. Click **START MISSION**. Click **WATCH DEMO** to see the game's built-in short automated play sequence. Demo uses the live game scene and controls and can be exited with Escape; normal play can be started afterward.

## Controls
- WASD or arrow keys: steer the ship in the field.
- Escape: pause/return to menu; choose Resume or Restart.
- Sound button: mute/unmute synthesized collection/collision/result cues. Sound starts only after interaction.

## Objective and feedback
Collect all six glowing shards (SALVAGE counter) before losing all three hull points (HULL counter). Collisions reduce hull and temporarily grant collision immunity. The result screen lets you replay or watch the demo.

## Assets, dependencies and limits
- Three.js 0.160.0, imported as an ES module from `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js` (requires network at runtime; no package manifest or lockfile is applicable for this CDN-import version).
- All visual objects are procedurally generated; sound cues are synthesized with the Web Audio API. No external media assets.
- Tested browser: Chrome via the agent browser; a local-file smoke test confirmed the page rendered a canvas, showed HUD counters, and accepted Escape to pause. This was not a human group-member gameplay check, external playtest, or full acceptance test. Group members still need to personally check normal play, the full demo sequence, sound, collisions, restart and browser compatibility.
- Known limit: controls are keyboard-first; internet access is needed to load Three.js. Check gameplay, objective, sound, demo, restart and browser compatibility from the final submitted copy.

## Team work still required
The source is a starter implementation. Every group member must personally run a game check. Complete an authentic external playtest with a non-member, ask permission to include anonymous notes, and record the real observation/feedback yourself (NO AI). Do two genuine improvement-and-retest cycles, including one based on that playtest (NO AI evidence). Prepare the <=5:00 video with actual human gameplay plus the in-game demo mode; do not substitute the automated demo for human play. Group ID, member identities/IDs/contributions, representative harness interaction and per-member learning summaries belong in the private group report. Do not invent these records.
