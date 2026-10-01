# Foxtail soundtrack recordings

This folder holds the recorded soundtrack. **It's empty for now.** Until a
recording is here, each track plays its built-in arrangement, synthesised
live in the browser from `src/game/audio/soundtrack.ts`. The game never
needs these files to work.

## Adding a track

1. Put the file in this folder with the name from the table below.
2. Add it to the track's `sources` in `src/game/audio/soundtrack.ts`, e.g.
   `sources: ['music/home.m4a']`. You can list more than one format; the
   first one the browser can play is used.
3. That's all. If the file is missing, fails to load or won't play, the
   game falls back to the built-in arrangement on its own.

| State        | Track id        | Working title         | File                 | Character |
|--------------|-----------------|-----------------------|----------------------|-----------|
| Title screen | `foxtail-theme` | Foxtail               | `foxtail-theme.m4a`  | The motif, plainly stated. Kalimba, picked guitar, strings. |
| Home         | `home`          | The Kettle’s On       | `home.m4a`           | Warm, welcoming, melodic. Felt piano, guitar, a little shaker. |
| Greenhouse   | `greenhouse`    | Under Glass           | `greenhouse.m4a`     | Delicate and intricate, with glassy, organic textures. Marimba and glass, in three. |
| Wild         | `wild`          | Off the Path          | `wild.m4a`           | Exploratory and rhythmic. Marimba ostinato, hand percussion, flute. |
| Deep wild    | `deep-wild`     | Where the Fox Goes    | `deep-wild.m4a`      | Atmospheric and mysterious, never dark. Drone, distant flute, kalimba. |
| Evening      | `evening`       | Lamps Lit             | `evening.m4a`        | Soft and intimate. Piano and strings. |

The discovery stinger stays synthesised: it's the motif, played in the key
of whatever track is on.

## Format

- **AAC in `.m4a`** (AAC-LC), stereo, 44.1 or 48 kHz, around **96–128 kbps**.
  It plays everywhere Foxtail runs, including iPhone Safari and the Home
  Screen app. Optionally add an `.ogg` (Vorbis/Opus) alongside it.
- **Loops seamlessly**: the file is looped as-is, so its end has to run
  straight back into its start. Leave no silence at either end.
- **Length**: about 1½–3 minutes. Keep each file under ~3 MB.
- **Level**: master to around −16 LUFS integrated, with peaks below −1 dBTP.
  The game mixes music under the ambience and sound effects itself.
- **The motif**: every track should carry the Foxtail motif somewhere,
  in its own arrangement. It's five notes, in scale degrees 1 – 5 – 6 – 3 – 2
  (in D: D A B F♯ E), with the rhythm *short–long–short–long–held*. Defined
  as `MOTIF` in `src/game/audio/soundtrack.ts`. It ends on a question, not
  on the home note.

Recordings aren't downloaded up front. The service worker caches each one
the first time it plays (`vite.config.ts`, `foxtail-music` cache), so the
soundtrack works offline after that without a big first download.
