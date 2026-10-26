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

All 40 recordings are offered under **Creative Commons Attribution 3.0** on
their individual SampleSwap pages. License:
<https://creativecommons.org/licenses/by/3.0/>.

| File | Work | Artist | Genre | Source |
| --- | --- | --- | --- | --- |
| `public/tracks/selection.mp3` | Selection | abece | House | <https://sampleswap.org/mp3/song.php?id=488> |
| `public/tracks/house-tweek.mp3` | My First House Tweek | TEAMFOCUS | House | <https://sampleswap.org/mp3/song.php?id=955> |
| `public/tracks/techno-shonen.mp3` | 21seiki Techno Shonen | emanon | Techno | <https://sampleswap.org/mp3/song.php?id=413> |
| `public/tracks/robowalk.mp3` | Robowalk | sausageblowfly | Techno | <https://sampleswap.org/mp3/song.php?id=1455> |
| `public/tracks/ss-29.mp3` | Albert Ross/Dee Light | BeatNabob | House | <https://sampleswap.org/mp3/song.php?id=29> |
| `public/tracks/ss-244.mp3` | DISCO remix | JacquesLMond | House | <https://sampleswap.org/mp3/song.php?id=244> |
| `public/tracks/ss-2592.mp3` | Chicken Dance Song | Dj Thwar | Techno | <https://sampleswap.org/mp3/song.php?id=2592> |
| `public/tracks/ss-3563.mp3` | Subway | XBloome | Techno | <https://sampleswap.org/mp3/song.php?id=3563> |
| `public/tracks/ss-138.mp3` | maniac in the desert | alienzzz | Trance | <https://sampleswap.org/mp3/song.php?id=138> |
| `public/tracks/ss-888.mp3` | Run | Double Helix | Trance | <https://sampleswap.org/mp3/song.php?id=888> |
| `public/tracks/ss-1417.mp3` | Solstice | Tejaswi | Trance | <https://sampleswap.org/mp3/song.php?id=1417> |
| `public/tracks/ss-248.mp3` | Flying Higher(Shankar Mix) | BeatNabob | Trance | <https://sampleswap.org/mp3/song.php?id=248> |
| `public/tracks/ss-2198.mp3` | Goddess Nike | ChaseBronson | Trance | <https://sampleswap.org/mp3/song.php?id=2198> |
| `public/tracks/ss-590.mp3` | 9 Mile | Naram | Drum & Bass | <https://sampleswap.org/mp3/song.php?id=590> |
| `public/tracks/ss-930.mp3` | Dawn | Beda | Drum & Bass | <https://sampleswap.org/mp3/song.php?id=930> |
| `public/tracks/ss-935.mp3` | State of Abstraction | robbot | Drum & Bass | <https://sampleswap.org/mp3/song.php?id=935> |
| `public/tracks/ss-1272.mp3` | Aqua Cat | Wutec | Drum & Bass | <https://sampleswap.org/mp3/song.php?id=1272> |
| `public/tracks/ss-1315.mp3` | THROW THE SWITCH | Robert Meyers | Drum & Bass | <https://sampleswap.org/mp3/song.php?id=1315> |
| `public/tracks/ss-1185.mp3` | lovepartyinjapan | benzoul | Breakbeat | <https://sampleswap.org/mp3/song.php?id=1185> |
| `public/tracks/ss-2527.mp3` | The Act of pressure | penispanik | Breakbeat | <https://sampleswap.org/mp3/song.php?id=2527> |
| `public/tracks/ss-3839.mp3` | The Brushfield Eye | tylersrevenge | Breakbeat | <https://sampleswap.org/mp3/song.php?id=3839> |
| `public/tracks/ss-3843.mp3` | Japan dnb (Cruis'n USA mix) | tylersrevenge | Breakbeat | <https://sampleswap.org/mp3/song.php?id=3843> |
| `public/tracks/ss-1982.mp3` | SITAR | saeed pakfetrat | Electro | <https://sampleswap.org/mp3/song.php?id=1982> |
| `public/tracks/ss-2574.mp3` | cover trance | djchacha | Electro | <https://sampleswap.org/mp3/song.php?id=2574> |
| `public/tracks/ss-3058.mp3` | Action | Blueboma | Electro | <https://sampleswap.org/mp3/song.php?id=3058> |
| `public/tracks/ss-2543.mp3` | 112 | 3dE | Dubstep | <https://sampleswap.org/mp3/song.php?id=2543> |
| `public/tracks/ss-3089.mp3` | Tear Down This Wall! | Lous Kyklous | Dubstep | <https://sampleswap.org/mp3/song.php?id=3089> |
| `public/tracks/ss-4515.mp3` | Matrix | Chained Nomad | Dubstep | <https://sampleswap.org/mp3/song.php?id=4515> |
| `public/tracks/ss-933.mp3` | cold as ice | jjb8675309 | Hip Hop | <https://sampleswap.org/mp3/song.php?id=933> |
| `public/tracks/ss-1783.mp3` | thug in this club | arcanethegreat | Hip Hop | <https://sampleswap.org/mp3/song.php?id=1783> |
| `public/tracks/ss-2135.mp3` | TOP GUN | sameoneskie | Hip Hop | <https://sampleswap.org/mp3/song.php?id=2135> |
| `public/tracks/ss-2277.mp3` | man up | kellis1mc | Hip Hop | <https://sampleswap.org/mp3/song.php?id=2277> |
| `public/tracks/ss-92.mp3` | BAGHDAD | tomfox | Downtempo | <https://sampleswap.org/mp3/song.php?id=92> |
| `public/tracks/ss-194.mp3` | tree star | TrustProductions | Downtempo | <https://sampleswap.org/mp3/song.php?id=194> |
| `public/tracks/ss-213.mp3` | 43 Days | Kemi Helwa | Downtempo | <https://sampleswap.org/mp3/song.php?id=213> |
| `public/tracks/ss-312.mp3` | tranzethnik_01 | benzoul | Downtempo | <https://sampleswap.org/mp3/song.php?id=312> |
| `public/tracks/ss-970.mp3` | Insanety | Nico | Hardcore | <https://sampleswap.org/mp3/song.php?id=970> |
| `public/tracks/ss-1352.mp3` | brain waved | DJIKEYCISDIABLO | Hardcore | <https://sampleswap.org/mp3/song.php?id=1352> |
| `public/tracks/ss-1353.mp3` | Ravestyle | DJIKEYCISDIABLO | Hardcore | <https://sampleswap.org/mp3/song.php?id=1353> |
| `public/tracks/ss-1390.mp3` | A dark secret | DJIKEYCISDIABLO | Hardcore | <https://sampleswap.org/mp3/song.php?id=1390> |

Changes: each file is a 128-beat practice excerpt from the original recording,
re-encoded to 160 kbps stereo MP3 at 44.1 kHz with 5 ms edge fades. Exact source
offsets, durations, original download URLs and SHA-256 hashes, and license links
are retained in `public/catalog.json`. The collection spans House, Techno, Trance,
Drum & Bass, Breakbeat, Electro, Dubstep, Hip Hop, Downtempo, and Hardcore.

Tempos and starting beat phases are estimated from recorded onsets, including
multiband periodicity and repeated-section checks for the expanded collection.
They are not artist-supplied beat grids. Six excerpts carry conservative
`manualGridRecommended` flags; all tracks can be calibrated by ear with the
source BPM and Mark beat one controls. Genres follow the SampleSwap listings.

The excerpts are committed and require no downloads during app builds. To
recreate them, install `curl` and `ffmpeg`, then run
`python3 scripts/prepare-library.py --force`. This optional maintenance script
verifies original-file hashes and preserves attribution in MP3 metadata. Add
`--track <catalog-id>` to rebuild one excerpt. Full source recordings stay in
the temporary cache and are not included in the repository or distribution.

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
