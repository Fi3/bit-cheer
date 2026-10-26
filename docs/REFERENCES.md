# References and bundled asset credits

Research snapshot: 26 October 2026. The playable interface is an Elm implementation,
with a Rust audio engine; it does not embed any of these applications.

## Beatmatch PRO

Reference: <https://www.beatmatch.pro/practice>.

The public practice-page catalog returned 574 Bandcamp track links with genre tags.
These links are retained under `referenceTracks` in `public/catalog.json`, so the
original selection can be browsed and filtered. Display titles in this discovery
catalog are derived from the URL slugs and may differ from the artist's exact
capitalization. The original artist page is the authoritative source.

The reference app obtains audio through its own server-side `/info` and `/mp3`
routes and enforces a practice quota. No license permitting redistribution of
the catalog's audio was provided. Bit Cheer therefore links to the original
artist pages and supports importing downloaded audio. The separately bundled
playable library below has explicit Creative Commons licenses. It is not
represented as Beatmatch PRO's audio library.

## Bundled real-track practice excerpts

All four recordings are offered under **Creative Commons Attribution 3.0** on
their individual SampleSwap pages. License:
<https://creativecommons.org/licenses/by/3.0/>.

| File | Work | Artist | Genre | Source |
| --- | --- | --- | --- | --- |
| `public/tracks/selection.mp3` | Selection | abece | House | <https://sampleswap.org/mp3/song.php?id=488> |
| `public/tracks/house-tweek.mp3` | My First House Tweek | TEAMFOCUS | House | <https://sampleswap.org/mp3/song.php?id=955> |
| `public/tracks/techno-shonen.mp3` | 21seiki Techno Shonen | emanon | Techno | <https://sampleswap.org/mp3/song.php?id=413> |
| `public/tracks/robowalk.mp3` | Robowalk | sausageblowfly | Techno | <https://sampleswap.org/mp3/song.php?id=1455> |

Changes: each file is a 64-beat practice excerpt from the original recording,
re-encoded to 160 kbps MP3 with 5 ms edge fades. Exact source offsets, durations,
download links, and license links are retained in `public/catalog.json`.
Tempos were estimated from low-frequency onsets: Selection 130 BPM, My First
House Tweek 123 BPM, 21seiki Techno Shonen 148.19 BPM, and Robowalk 130 BPM.
These are estimates, not artist-supplied beat grids. Users can calibrate their
own files and cue positions by ear. The genres follow the SampleSwap listings.

These recordings are distinct from Bit Cheer's synthesized practice loops. A local
learned Markov model trained on 20 original authored rhythm patterns generates
the sequences; Rust synthesizes the voices. The corpus, reproducible trainer, and
learned weights are included. This is statistical generation, not a neural or
cloud music service.

## Winamp Skin Museum: exact first four entries

Reference: <https://skins.webamp.org/>. The first four server-rendered
`initialSkins` entries at the research snapshot were:

| Native theme | Original file | Museum record | Original authors |
| --- | --- | --- | --- |
| Classic 2.91 | `base-2.91.wsz` | <https://skins.webamp.org/skin/5e4f10275dcb1fb211d4a8b4f1bda236/> | Nullsoft |
| Winamp 3 Classified | `Winamp3_Classified_v5.5.wsz` | <https://skins.webamp.org/skin/cd251187a5e6ff54ce938d26f1f2de02/> | Original design Steve Gedikian; classic version John Slegers and PeterPan; edits Wildrose-Wally |
| Winamp 5 Classified | `Winamp5_Classified_v5.5.wsz` | <https://skins.webamp.org/skin/b0fb83cc20af3abe264291bb17fb2a13/> | Original design Sven Kistner; classic version Zarko Jovic and GuidoD; edits Wildrose-Wally |
| Bento Classified | `Bento_Classified.wsz` | <https://skins.webamp.org/skin/d6010aa35bed659bc1311820daa4b341/> | LuigiHann |

Museum previews and original archives are retained under
`public/skins/{classic,classified3,classified5,bento}.{png,wsz}`. Original archives
are unchanged and retain their author metadata/readmes. The original graphics
remain copyrighted by their respective authors. They are not relicensed as
Bit Cheer code. Native themes adapt their colors and visual treatment to the
larger two-deck trainer; they do not emulate every classic Winamp window.

## The supplied green-face reference

User reference:
<https://www.instagram.com/p/DeXB3baiC1Q/>. Its public preview was recovered and
inspected, and is retained as `public/skins/alien-reference.jpg`.

Despite the Instagram post's Winamp description, this is **Headspace**, the
lime-green head skin for Windows Media Player from 2000. The original designer's
page identifies the design: <https://dribbble.com/shots/851181-Headspace-Skin>.
The design is credited to Microsoft / Carolyn Farino.

**HeadAMP**, a Winamp Modern adaptation by **sambaneko**, is available from the
author at <https://winamp.spacecatsamba.com/skin/headamp/>. Its preview is
`public/skins/alien.png`, and the unchanged original archive is
`public/skins/alien.wal`. The `alien-head.png`, `alien-bg_drawer_left.png`,
`alien-bg_drawer_right.png`, and `alien-buttons_player_controls.png` assets are
extracted from that archive for the requested visual adaptation. The original
graphics retain their original copyright; they are not Bit Cheer original art.
The application theme is named **Headspace · Alien Lime**.

## DJcompanion training reference

Reference: <https://www.djcompanion.app/>. Training concepts reviewed include
dual-deck ear practice, cue timing, waveform seeking and zoom, vertical pitch
faders with sensitivity ranges, temporary nudges, per-deck EQ, microphone tempo
monitoring, and local audio import. Bit Cheer's own lesson progression and
feedback are original implementation choices inspired by those capabilities.
