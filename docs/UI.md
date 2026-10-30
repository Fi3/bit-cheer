# User interface — specification

This document describes everything a person can see, click, drag, type and choose in bit.cheer, and what each control does. It is written from the user's side of the screen: what happens, under which rules, and what the app says back. It does not describe how anything looks (colors, sizes, skins' artwork), only what it is for.

Keys have their own specification, [KEYBOARD.md](KEYBOARD.md). This document mentions a control's key where it helps, but KEYBOARD.md is the reference for the keyboard. The user manual built from this specification is [`public/manual.html`](../public/manual.html), served with the app at `manual.html`.

Contents

1. [Words used here](#1-words-used-here)
2. [Opening the app](#2-opening-the-app)
3. [The app frame](#3-the-app-frame): [top bar](#31-top-bar), [mode bar](#32-mode-bar), [notice bar](#33-notice-bar), [footer](#34-footer)
4. [Practice page](#4-practice-page): [heading](#41-heading), [decks](#42-the-decks), [deck modules](#43-deck-modules), [under the decks](#44-under-the-decks), [session modules](#45-session-modules), [arranging modules](#46-arranging-modules)
5. [The five practice modes](#5-the-five-practice-modes)
6. [Checking a match](#6-checking-a-match)
7. [Star runs](#7-star-runs)
8. [Learning path page](#8-learning-path-page)
9. [Training page](#9-training-page)
10. [Focus session](#10-focus-session)
11. [Keyboard help](#11-keyboard-help)
12. [Skin studio page](#12-skin-studio-page)
13. [Dropdown lists](#13-dropdown-lists)
14. [Messages](#14-messages)
15. [What the app remembers](#15-what-the-app-remembers)
16. [Known gaps](#16-known-gaps)

---

## 1. Words used here

| Word | Meaning |
| --- | --- |
| **Deck A / deck B** | The two players. Deck A is labelled **REFERENCE**, deck B **MATCH THIS**: the lessons and the coach ask you to match B to A, but every control works on both. |
| **Source BPM** | A deck's own tempo: the tempo of its loop or recording at pitch 0%. |
| **BPM** (on the deck screen) | The tempo you hear: source BPM × (1 + pitch ÷ 100). |
| **Pitch** | How much faster (+) or slower (−) than its source tempo a deck plays, in percent. Classic varispeed: tempo and musical pitch move together. |
| **Nudge** | A small jump of the playhead, forward or back, to line up beats without changing tempo. |
| **Bend** | A temporary speed change while a jog wheel is scrolled or a nudge key is held. |
| **Cue point** | A saved position on a deck. It starts at the beginning of the track. |
| **Generated material** | Loops the app makes itself: Foundation's kicks, study loops, named loops and CHAOS arrangements. All 32 beats long. |
| **Recording** | A real track: one of the 40 bundled practice recordings, an imported file or a file from a music folder. |
| **Module** | A block of controls that can be folded, removed and added back (section [4.6](#46-arranging-modules)). A deck module belongs to one deck; a session module is shared. |
| **Winamp look** | How the app looks with a Winamp skin: the two built-in skins (Millennium Chrome, Strawberry Mochi) and any `.wsz` skin. This is the default. |
| **Classic look** | How the app looks with a skin made from a `skin.toml` file (colors and images only). A few controls exist only in one look; this document says where. |
| **Notice** | A one-line message in the notice bar (section [3.3](#33-notice-bar)). |

## 2. Opening the app

**On a computer**, the app opens straight on the Practice page in Foundation mode (01), with two kick drums ready: deck A at 120 BPM playing the kick **Velvet**, deck B at 124 BPM playing **Club Punch**. Nothing plays until you press a play button.

The browser only allows sound after a click or key press, so the audio engine starts with your first action that needs it (usually the first play). Until then the top bar says **CLICK PLAY TO START**; after that, **ENGINE READY**.

**On a phone or small touch tablet**, the app shows a retro "PC only" screen instead of the decks, because two decks and a crossfader don't fit next to your thumbs:

| Control | Does |
| --- | --- |
| The phone picture | Click or tap it (or press `Enter` / `Space`) to play **Snake** on its little screen. It plays itself until you take over. |
| Phone keypad `2` `4` `6` `8` | Steer the snake up, left, right, down. `5` starts a new game. On a keyboard the arrows, `W` `A` `S` `D` and the number keys work too; `Esc` leaves the game. |
| **Play Snake** / **Back to the message** | Start the game / go back to the text. |
| **OK, I'll get my PC** | Answers with a different joke each press. After five presses a third button appears. |
| **Load anyway (no refunds)** | Opens the real app on this device. The choice lasts until the browser tab or window is closed. |

The best Snake score is kept on the device. Adding `?mobile=0` to the address skips this screen; `?mobile=1` shows it on a computer.

## 3. The app frame

Every page shares a top bar, a mode bar on the left, a notice bar above the page and a footer.

### 3.1 Top bar

| Control | Does |
| --- | --- |
| **Skip to practice** | Appears only when reached with `Tab`; jumps the keyboard focus to the page content. |
| **bit.cheer** logo | Goes to the Practice page. Nothing is reset. |
| **Practice** | Goes to the Practice page (the decks). |
| **Learning path** | Goes to the [Learning path page](#8-learning-path-page). |
| **Training** | Goes to the [Training page](#9-training-page). |
| **Skin studio** | Goes to the [Skin studio page](#12-skin-studio-page). |
| Engine status | Not a button. **CLICK PLAY TO START** until the audio engine runs, then **ENGINE READY**. |
| **?** | Opens the [keyboard help](#11-keyboard-help). Key: `?`. |

The current page's button is marked as active. Changing pages never stops the decks: music keeps playing while you read a lesson card or try a skin.

### 3.2 Mode bar

The column on the left lists the five practice modes as cards, each with its number, name and tagline:

| Card | Tagline | Key |
| --- | --- | --- |
| **01 Foundation** | Two kicks. One groove. | `1` |
| **02 Loop builder** | Layer up the challenge. | `2` |
| **03 By ear** | Trust what you hear. | `3` |
| **04 Star mode** | Decks with trust issues. | `4` |
| **05 Pro decks** | Real tracks. Real skills. | `5` |

Clicking a card **starts that mode from scratch**, even when it's the mode you're in: both decks stop, fresh material loads, any lesson, drill, Star run and result end, and the app shows the Practice page (details per mode in [section 5](#5-the-five-practice-modes)). The digit keys differ in one way: the digit of the mode you're already in does nothing on the Practice page, and only brings you back to the decks from another page.

The selected mode's card is marked. Entering a mode:

- stops both decks, sets their pitch to 0%, rewinds them, turns **Loop** on and clears any **SOLO**;
- turns **Hide BPM** on in By ear and off in every other mode;
- in Foundation, also sets the equalizer flat and the kick's level and pan to their defaults;
- keeps deck volumes, pitch ranges, the crossfader and the master volume as they were.

**Classic look only:** below the cards, the mode bar also has

- a learning-path card: **Your learning path** with *n*/8 lessons complete, a progress bar, an encouraging line, and **Continue learning →** (goes to the Learning path page);
- a **Headphones on.** card with **⌨ Keyboard shortcuts** (opens the keyboard help).

### 3.3 Notice bar

Short messages appear in a bar above the page: confirmations ("Cue point saved…"), refusals ("Let both decks run together…"), lesson and drill instructions, loading progress and errors. A message stays until another replaces it or you press its **×**. Errors are marked as alerts. The full list is in [section 14](#14-messages). In Focus session, only errors are shown.

### 3.4 Footer

| Control | Does |
| --- | --- |
| **Manual ↗** | Opens the user manual in a new tab. |
| **Credits & sources ↗** | Opens the credits page (track licenses, skin and font sources) in a new tab. |

The rest of the footer is text: "Built for the ears. Inspired by the era." and the app's version.

## 4. Practice page

The Practice page is the two-deck desk. From top to bottom: the heading, the decks, the track or loop pickers, the session modules, and a line under the decks.

### 4.1 Heading

The heading's title and text change with the mode:

| Mode | Title | Text |
| --- | --- | --- |
| Foundation | Find your rhythm. | Two clean kick drums. Learn to match their speed, then bring each hit together. |
| Loop builder | Build your groove. | Add a little texture. Keep the beats together as the groove gets richer. |
| By ear | Let your ears lead. | The numbers are off. Listen for the drift and bring two rhythms together. |
| Star mode | Hold it together. | Explains that the decks drift like real turntables, that neither the BPM screen nor the pitch fader shows it, and that the rating counts how long and how tight you held the match for 60 seconds. |
| Pro decks | Make the mix yours. | Pick a genre or bring your own tracks. This is where practice meets the dance floor. |

Controls in the heading:

| Control | Does |
| --- | --- |
| **▶ Play both decks** / **Ⅱ Pause both decks** | If either deck plays, pauses both; otherwise starts both together. The label shows what a press will do. Key: `Space`. |
| **Focus session ⛶** | Opens [Focus session](#10-focus-session). Key: `` ` ``. |
| **Hide BPM** (toggle) | Hides the tempo numbers (see below). Key: `B`. |
| Round button | Depends on what you're doing, see the next table. Key: `N`. |

**Hide BPM** on:

- each deck screen shows `---.--` instead of the BPM, and **LISTEN. DON'T LOOK.** instead of the source BPM;
- the live Winamp window shows `---` in its BPM slot;
- the **SOURCE BPM** field in Pro decks disappears.

The pitch percentage stays visible. Hide BPM switches on by itself in By ear and in lessons 6 and 8.

The round button:

| When | Button | Does |
| --- | --- | --- |
| In a drill (any mode) | **New challenge** | Resets both decks to a fresh starting point for that drill. |
| Star mode | **New run** | Fresh loops at one shared tempo, and a new 60-second run. |
| Pro decks, no Star run yet | **★ Star run** | Starts a Star run on the loaded tracks ([section 7](#7-star-runs)). |
| Pro decks, during a run | **★ Stop star run** | Cancels the run: the drift stops and no result is given. |
| Pro decks, after a run | **★ New star run** | Starts another run on the same tracks. |
| Foundation, Loop builder, By ear (no drill) | none | `N` still starts a new challenge: fresh loops and tempos on both decks. |

### 4.2 The decks

Deck A sits on the left, deck B on the right. Each deck has, from top to bottom: its live Winamp window (Winamp look only), and its console: the console's title, the deck's modules with the fixed transport, and an add-module menu.

#### Live Winamp window (Winamp look only)

Each deck shows the skin's Winamp main window, live and clickable. It shows:

- **Title**, scrolling: the deck number, the track or loop name, its length, and the pitch when it isn't 0 (for example `2. LOW TIDE (0:16) +1.2%`).
- **Time**: elapsed time, blinking while paused, empty while stopped at the start.
- **BPM** (where Winamp shows kbps) and **pitch** rounded to whole percent (where Winamp shows kHz). The BPM shows `---` while Hide BPM is on.
- **Spectrum analyser** drawn from the deck's own sound, the play/pause/stop indicator, and the STEREO light while playing.

Every part you can click works:

| Part | Does |
| --- | --- |
| Time display | Switches between elapsed and remaining time (shown with a minus). |
| Analyser | Cycles bars → oscilloscope → off. |
| Volume slider | Sets this deck's volume (the same as its Volume module). |
| Balance slider | Pans this deck left or right. It snaps to the middle near the centre. |
| Position bar | Click or drag to jump to that point of the track. |
| ⏮ Previous | Nudges back (as the transport's **−**). |
| ▶ Play | Starts the deck if it's paused. |
| ⏸ Pause | Pauses the deck if it's playing. |
| ⏹ Stop | Stops and returns to the cue point (as **CUE**). |
| ⏭ Next | Nudges forward (as the transport's **+**). |
| ⏏ Eject | **Change track** for generated material; in Pro decks, **↥ Import** a file into this deck. |
| Shuffle | **Randomize tempo** of this deck. Does nothing in the phase and phrase drills. |
| Repeat | Turns **Loop** on or off. Lit while Loop is on. |
| EQ | Shows or folds this deck's **Equalizer** module, adding it if it isn't there. Lit while the equalizer is open. |
| PL | Shows or hides this deck's console (everything below the window). Lit while the console shows. |
| Title-bar shade button | Folds the window to a one-line bar (Winamp's windowshade) or unfolds it. The bar keeps the time, a mini transport (previous, play, pause, stop, next, eject: same jobs as above) and a tiny position bar. |

Winamp's options, minimize and close buttons have no job here and aren't shown. The window last clicked is drawn as the active one.

#### Console title

- **DECK A · REFERENCE** or **DECK B · MATCH THIS**, and the deck state: **PLAYING** or **READY**.
- A small fold button (Winamp look only) that shows or hides the console, the same as the window's **PL** button.

#### Transport (always there)

The transport can't be removed. It sits right after the Screen module.

| Control | Does |
| --- | --- |
| **▶** / **Ⅱ** | Play or pause this deck. Keys: `F` (A), `J` (B). |
| **CUE** | Stops the deck and returns to its cue point. Keys: `A`, `;`. |
| **SET** | Saves the current position as the cue point. Notice: "Cue point saved. Press CUE to return to it." Keys: `Shift`+`A`, `Shift`+`;`. |
| **NUDGE −** / **+** | Moves the playhead 0.04 beat back or forward (about 20 ms at 120 BPM). Keys: `S` `D`, `K` `L`; holding them bends the speed, see KEYBOARD.md. |
| **Randomize tempo** | Gives this deck a new tempo; the other deck never changes. See below. Keys: `V`, `M`. |
| **Change track** | Not in Pro decks (the track picker has its own). Puts new material on this deck. See below. Keys: `Shift`+`V`, `Shift`+`M`. |

**Randomize tempo**

- Picks a tempo at least 1 BPM away from what the deck plays now, within ±4% (Foundation) or ±8% (other modes) of the other deck's tempo.
- On generated material it changes the **source** tempo and sets the pitch back to 0%. The loop keeps playing from the same musical position.
- On a recording (Pro decks) it moves the **pitch** instead, staying within ±8% of the recording's own tempo. If no such tempo exists, an error says the tracks are too far apart.
- In the phase and phrase drills the button is disabled, with the hint "Tempo is fixed for this drill. New challenge resets both decks."
- In Star mode it is refused with a notice.

**Change track**

- **Foundation:** another kick sound, never the one the other deck is playing, at this deck's tempo.
- **Loop builder, By ear, Star mode:** a random named loop (not the one on either deck), preferring one within 6% of the other deck's tempo. It plays at its own home tempo, except in the phase and phrase drills and Star mode, where the deck keeps its tempo.
- Pitch goes back to 0%, and a deck that was playing keeps playing.

#### Add-module menu

At the foot of each deck, **+ Add module…** lists the deck modules this deck doesn't have yet (section [4.6](#46-arranging-modules)). It reads **All modules added** and is disabled when nothing is left. A deck with no modules at all says "Add a module to build this deck."

### 4.3 Deck modules

Each deck module has a title bar with two buttons: **Hide** / **Open** (fold or unfold it) and **×** (remove it). See [arranging modules](#46-arranging-modules).

#### Screen

| Part | Shows |
| --- | --- |
| Track title | The deck's track or loop name, and a badge: **KICK-ONLY** (Foundation), **LAYERED LOOP** (other generated material) or **TRACK** (a recording). |
| BPM | The tempo you hear, with two decimals. `---.--` while Hide BPM is on. |
| Second line | Winamp look: **PITCH ±x.xx%**. Classic look: elapsed time (hidden in By ear). |
| Small print | **SOURCE** and the source BPM, or **LISTEN. DON'T LOOK.** while Hide BPM is on. |

Deck names: Foundation names the kick (`KICK STUDY · VELVET`); fresh loops at the start of a mode, lesson, drill or challenge are `RHYTHM STUDY · nn`; named loops carry their name (`LOW TIDE`); CHAOS! arrangements are `CHAOS STUDY · nnnnn`; recordings show "Title — Artist" or the file name.

#### Pitch fader (title: Pitch)

| Control | Does |
| --- | --- |
| Fader | Drag to set the pitch anywhere in the range. The top end is fastest (+), the bottom slowest (−), the middle is 0%. |
| `Shift` + drag | Fine drag: the fader moves ten times less than the pointer, in 0.01% steps. |
| Mouse wheel over the fader | One step per wheel notch (see **Wheel / keys**); `Shift` makes it 0.01%. Trackpads move smoothly. |
| Arrow keys on the focused fader | One step. `Page Up` / `Page Down`: ten steps. `Home` / `End`: bottom / top of the range. |
| Pitch value | The pitch in percent, such as **+0.35%**. In the Winamp look it's hidden while the Screen module shows (the screen shows it). |
| **−** / **+** | 0.01% slower / faster. |
| **0** | Back to 0%, the source tempo. Keys: `Z`, `/`. |
| Range (**±2%** … **±50%**) | The fader's span: ±2, 4, 8 (default), 16, 32 or 50%. A narrower range pulls the pitch inside it. |
| **Wheel / keys** (**Fine**, **Normal**, **Coarse**) | The step for the wheel, the focused fader's arrows and the pitch keys: 0.01%, 0.05% (default) or 0.25%. Remembered per deck on this device. |

The fader, its buttons and the wheel stop at the end of the range. The pitch keys don't: past the end they widen the range to the next size (KEYBOARD.md, Pitch steps).

#### Volume

A slider from 0 to 100% (default 80%) with the value beside it. Keys: `X` `C`, `,` `.`.

#### Jog wheel

| Action | Does |
| --- | --- |
| Scroll over it | Bends the deck: faster or slower while you scroll, back to its pitch 160 ms after you stop. |
| Drag it | Scrubs through the track: right or up goes forward, left or down goes back. |
| `←` / `→` on the focused wheel | Nudge back / forward. |
| `Home` / `End` on the focused wheel | Jump to the start / end. |

The wheel's marker turns with the music.

#### Waveform

| Control | Does |
| --- | --- |
| Waveform | Click or drag to jump to that point. Scroll over it to zoom in or out. The label reads **32-BEAT LOOP** for generated material and **SEEK / SCROLL TO ZOOM** for recordings. |
| Beat lights **1 2 3 4** | Light up on each beat of the bar while the deck plays. |
| **−** **ZOOM** **+** | Zoom out / in (1× to 16×). Zoomed in, the view follows the playhead. |

In By ear the waveform is faded out (its label reads **LISTEN FOR THE DRIFT**) and the beat lights are hidden.

#### Equalizer

Three sliders, **LOW**, **MID** and **HIGH**, from −24 dB to +12 dB in 0.5 dB steps, each with its value. 0 dB is flat.

#### VU meter

A 14-segment level meter of the deck's real output. Display only.

#### Loop

A **Loop** toggle, on by default: when the track or loop reaches its end it starts again. Off, it stops at the end. The live window's **Repeat** button is the same switch.

#### Composer (Loop builder, By ear, Star mode)

The composer edits the deck's generated loop. Its top line counts the active instruments: **n / 20 ACTIVE**.

| Control | Does |
| --- | --- |
| **+ Add instrument…** | Lists the instruments this deck doesn't play yet; picking one adds it. Disabled at 20. |
| **+ Add next** | Adds the next missing instrument in bank order. Disabled at 20. |
| **CHAOS!** | Replaces this deck's loop with a dense arrangement of 12 to 20 instruments, each with a random sound, level, pan and pattern. The tempo, pitch and play state stay. Only this deck changes. |

The bank, in order: Kick, Closed hat, Snare, Clap, Bass, Perc, Synth, Open hat, Shaker, Ride, Crash, Rim, Low tom, High tom, Cowbell, Conga, Acid, Chord, Noise, Zap.

Each active instrument has a row:

| Control | Does |
| --- | --- |
| Instrument name (with **×**) | Removes the instrument from this deck. If it was soloed, the solo ends. |
| Sound | Chooses one of the instrument's named sounds, for example the kick's **Velvet**, **Club Punch**, **808 Boom**, **Dusty Tape**, **Knock**, **Pillow**. Every other instrument has four. |
| **LEVEL** | 0 to 150% (default 100%). |
| **PAN** | Left 100 to right 100; **C** is centre. |
| **SOLO** | Plays only this instrument on this deck; the others are muted. One solo per deck; press again to end it. |
| **AUTO** / **MANUAL** | Whether the pattern is the rhythm model's own (AUTO) or edited by you (MANUAL). |
| Steps **1–16** | One bar of sixteenth notes; every fourth step starts a beat. Click a step to turn it on or off; the pattern becomes MANUAL. The step being played lights up. |
| **Generate pattern** | Gives the instrument back the model's pattern (AUTO). |

With no instruments the composer says "Add an instrument to start your rhythm." A deck with no instruments is silent, and **Check my match** asks you to add one.

#### Track picker (Pro decks)

The two track pickers sit side by side below the decks, titled **Deck A — Track picker** and **Deck B — Track picker**. They are deck modules: fold, remove and add them like the others.

| Control | Does |
| --- | --- |
| **GENRE** | Filters this deck's list: **All genres**, the ten bundled genres, and **Local files** once you've added your own. Changing it doesn't load anything. |
| Library count | "40 playable tracks · 10 genres", or how many tracks the chosen genre shows. |
| **PLAYABLE TRACK** | Chooses a track by title (no BPM, so you can't cheat). "Import a track to get started" when the genre is empty. |
| **Load** | Loads the chosen track: paused, at the start, at pitch 0%. |
| **◀ Previous** / **Next ▶** | Loads the previous / next track in the genre (wrapping round). The deck keeps playing or stays paused; pitch goes to 0%. Keys: `Shift`+`V` / `V` (deck A), `Shift`+`M` / `M` (deck B). |
| **Change track** | Loads a random other track from the genre, keeping play state; pitch goes to 0%. |
| **↥ Import** | Opens your computer's file dialog; the chosen audio file joins this session's library under **Local files** and loads into the deck, paused. Up to 100 MB. |
| **📁 Browse folder** | Opens the folder browser in the picker (below). |
| **LOADED** | The name of the deck's current track. |
| **SOURCE BPM** | The recording's tempo, 40 to 300, with two decimals. Type a better value and leave the field (or press `Enter`) to correct it. Hidden while Hide BPM is on. |
| **SET GRID** | Marks the current position as beat one, so phase checks follow this downbeat. |

**Load**, **◀ Previous**, **Next ▶** and **Change track** are disabled while the chosen genre has no tracks. Imported and folder tracks stay in the library for this session, for both decks; a reload forgets them. When a track loads, the notice bar says so and, for your own files, gives the estimated BPM (estimates can be half or double the real tempo).

**Folder browser.** The first time in a session, **📁 Browse folder** shows an explanation first: "Choose your music folder", why the folder dialog greys out files, **📁 Choose music folder…** (opens the browser's folder dialog) and **×** (close). Once a folder is chosen, both decks use it without asking again, and the browser shows:

| Control | Does |
| --- | --- |
| Path | The folder's name and the subfolders you're in; click any part to go back to it. |
| **Change folder** | Chooses another folder. |
| **×** | Closes the browser. |
| **Filter this folder** | Shows only names containing what you type. |
| **↰ ..** | Up one folder. |
| 📁 *folder* | Opens it. |
| ♪ *file* | Loads that audio file into this deck, paused (the deck's genre switches to **Local files**). The loaded file is marked. |
| Count | How many folders and audio files are here. |

Audio files are MP3, WAV, OGG, Opus, FLAC (hi-res too), M4A/AAC, AIFF and WebM, as far as the browser can decode them, up to 300 MB and about 10 minutes at 48 kHz. Files are read from your disk and never uploaded. Browsers without a folder picker (Firefox, Safari) use a folder-upload dialog instead; the files still stay on the computer.

#### Loop picker (Loop builder, By ear, Star mode)

Below the decks in the generated modes, **Deck A — Track picker** and **Deck B — Track picker** pick from twenty-four named loops made by the app's rhythm model (Lemon Haze, Low Tide, Cloud Nine Café, Honey Drip, Night Bus Home…). Each loop has its own instruments, sounds, mix and home tempo (104–124 BPM). The Loop builder shows the pickers by default; in By ear and Star mode add them from the deck's menu.

| Control | Does |
| --- | --- |
| **GENERATED LOOP** | Chooses a loop by name. Nothing loads yet. |
| Count | "24 loops made by the rhythm model". |
| Vibe | One line about the chosen loop ("Dub techno, washed out and slow"). |
| **Load** | Loads the chosen loop: paused, from its start, at pitch 0%, at its home tempo (in the phase and phrase drills and Star mode, at the deck's tempo). Its instruments, sounds and mix replace the deck's. |
| **◀ Previous** / **Next ▶** | Loads the neighbouring loop in the list, keeping play state. From a study loop, Next starts at the first loop and Previous at the last. |
| **LOADED** | The deck's current loop name. |

### 4.4 Under the decks

One line under the desk, depending on the mode:

| When | Shows |
| --- | --- |
| Foundation | **Ready for more? Build a layered loop →**: switches to the Loop builder (as clicking 02). |
| Loop builder, By ear, Star mode | **+ Add an element to both decks**: adds each deck's next missing instrument. Disabled when both decks have all twenty. Key: `=`. |
| Pro decks, with a waveform open | The hint "Drag the waveforms to seek. Scroll to zoom." |

### 4.5 Session modules

Session modules are shared by both decks. They sit below the pickers, with **+ Add module…** (Add session module) after them.

#### Crossfader

A slider from **A** to **B** (default: centre). At the A end only deck A is heard; at the B end only deck B; in between, an equal-power blend. Keys: hold `G` / `H` to glide, `Y` to centre. While Audio outputs sends the decks to separate channels, the crossfader is disabled and reads **EXTERNAL MIX**.

#### Master volume

**MASTER**, 0 to 100% (default 75%): the volume of everything. A limiter keeps the output from clipping.

#### Monitor

**Split cue** (off by default): deck A plays in the left ear only and deck B in the right ("A → left / B → right"), so on headphones you can hear each deck separately. Disabled while separate outputs are in use ("External output routing active").

#### Audio outputs

For people with a multichannel audio interface and an external mixer.

| Control | Does |
| --- | --- |
| Summary | "Stereo mix · master output", or where each deck goes ("A → Channel 1 / B → Channel 2"). |
| Channel count | How many output channels the browser exposes, or "Detecting available output channels…". |
| **Refresh outputs** | Asks the browser again (after plugging in or choosing an interface). |
| **OUTPUT MODE** | **Stereo mix** (default: both decks through the crossfader and master); **Separate mono channels** (each deck, downmixed to mono, to one channel; needs 2 or more); **Separate stereo pairs** (each deck to its own pair, such as 1–2 and 3–4; needs 4 or more). Options the device can't do are disabled. |
| **DECK A OUTPUT** / **DECK B OUTPUT** | With separate outputs: which channel or pair each deck uses. The two never overlap. |
| **Swap A / B** | Exchanges the two decks' channels. |
| **OUTPUT DEVICE** | Where the browser allows it: chooses the audio device. |
| **Choose an output device…** | Where the browser allows it: opens the browser's own device picker. |

Where the browser can't choose devices, the module says to pick the interface in the operating system and refresh. With separate outputs, deck volume, EQ and master volume still work; the crossfader and split cue are bypassed. If the device stops offering enough channels, the app goes back to Stereo mix and says so.

#### Coach

The coach guides and scores. Its parts:

- **Heading:** the lesson ("Lesson 3 · Find the pocket"), **★ Star run** during a run, the drill ("tempo drill"), **Find the downbeat.** in Pro decks, or **Listen for the double hit.**
- **Body:** the latest result ([section 6](#6-checking-a-match)), else the Star run meter ([section 7](#7-star-runs)), else the instruction for the lesson, drill or mode.
- **Foundation steps** (Foundation only): **1 Listen**, **2 Match tempo**, **3 Nudge & check**. Pointing at a step shows its detail.
- **Stats:** "*n* checks · *m* avg. score" once you have checked a match.
- **Check my match ↗**: scores your match. During a Star run it reads **Finish the run**. Key: `Enter`.

#### Tap tempo

| Control | Does |
| --- | --- |
| **TAP** | Tap along to a beat; the readout shows the tempo from your taps. Key: `T`. A pause of 4 seconds starts a new count. |
| Readout | The tapped BPM (or `— — —`) and "*n* taps · keep the rhythm". |
| **♩ Listen with microphone** / **● Stop microphone** | Estimates the tempo of music the microphone hears, on this device, every six seconds. The browser asks permission first; click again while waiting to cancel. Nothing is recorded, uploaded or played back. The line beside it shows "*n* BPM estimated". |

#### External track discovery

Added folded by default. It links to 574 tracks of the original Beatmatch PRO catalog, on their artists' sites; they don't play inside the app.

| Control | Does |
| --- | --- |
| Genre | Filters the links. |
| *Track* **Get track ↗** | Opens the track's page in a new tab. Eight per page. |
| **← Previous** / **Next →** | Pages through the links ("Page 2 / 72"). |

Get a track from its artist, then **↥ Import** it into a deck.

### 4.6 Arranging modules

Every module except the transport can be arranged:

| Control | Does |
| --- | --- |
| **Hide** / **Open** (on the module's title bar) | Folds the module to its title bar, or unfolds it. |
| **×** (on the module's title bar) | Removes the module. |
| **+ Add module…** (at the foot of each deck, and after the session modules) | Adds a removed module back, at the end. |

Folding or removing a module never stops its sound or resets its settings: an equalizer keeps its curve, a folded composer keeps playing.

Each mode keeps its own arrangement, remembered on this device. The starting arrangement:

| Mode | Each deck | Session |
| --- | --- | --- |
| Foundation | Screen, Pitch fader, Volume | Crossfader, Master volume, Coach |
| Loop builder | Screen, Pitch fader, Volume, Composer, Track picker (loops) | same |
| By ear, Star mode | Screen, Pitch fader, Volume, Composer | same |
| Pro decks | Screen, Pitch fader, Volume, Track picker (recordings) | same |

What each deck can add: Screen, Pitch fader, Volume, Jog wheel, Waveform, Equalizer, VU meter, Loop, plus Composer (Loop builder, By ear, Star mode) and Track picker (every mode but Foundation). Session: Crossfader, Master volume, Monitor, Audio outputs, Coach, Tap tempo, External track discovery.

## 5. The five practice modes

All five modes use the same desk. This section lists what each one starts with and what's particular to it.

### 5.1 Foundation (01)

- **Material:** one kick drum per deck, two different kick sounds, named in the deck titles. On first opening: 120 and 124 BPM; afterwards, a random tempo between 100 and 130 BPM and a second one 2–5 BPM away.
- **Composer and pickers:** not available. Kick only.
- **Change track:** another kick sound. **Randomize tempo:** within ±4% of the other deck.
- **New challenge** (`N` only): two fresh kicks and tempos; both decks stop.
- **Coach:** "Listen for the double hit." with the three Foundation steps.
- **Under the decks:** the invitation to the Loop builder.

### 5.2 Loop builder (02)

- **Material:** a study loop on each deck with kick and closed hat, each instrument with a random sound and the two kicks different; tempos 100–130 BPM, 2–8 BPM apart.
- **Composer** on both decks, **loop pickers** below them, **+ Add an element to both decks** under the desk.
- **Randomize tempo:** within ±8%. **Change track:** a named loop.
- **New challenge** (`N` only): fresh study loops and tempos, with as many instruments as deck A has now.

### 5.3 By ear (03)

As the Loop builder, starting with kick, closed hat, snare and bass, plus:

- **Hide BPM** is on (you can switch it off for a peek; switching back to another mode turns it off).
- Waveforms are faded out, the beat lights hidden, and in the classic look the elapsed time too, whatever the Hide BPM toggle says.
- The loop pickers aren't shown by default.

### 5.4 Star mode (04)

- **Material:** study loops with kick, closed hat, snare and bass, both decks at **the same tempo**.
- A **60-second run** starts at once; its clock waits until both decks play ([section 7](#7-star-runs)).
- **Randomize tempo** is refused (the drift is the challenge). **Change track** and the loop pickers keep the deck's tempo.
- **New run** (button and `N`): fresh loops and a new run. **Finish the run** (coach button and `Enter`) ends it early, after at least 10 seconds of both decks playing.

### 5.5 Pro decks (05)

- **Material:** the first two practice recordings load into deck A and deck B (paused). If the library is still loading, a notice says so and they load when it's ready.
- **Track pickers** below the decks; no composer, no Change track in the transport, no **+ Add an element**.
- **Randomize tempo** moves the pitch (within ±8% of the track's own tempo).
- **★ Star run** in the heading (and `N`).
- **Check my match** needs a recording on both decks.

The 40 bundled recordings are 128-beat excerpts of Creative Commons tracks in ten genres: House, Techno, Trance, Drum & Bass, Breakbeat, Electro, Dubstep, Hip Hop, Downtempo and Hardcore. Their BPMs are estimates; correct them with **SOURCE BPM** and mark the first downbeat with **SET GRID** before trusting scores.

## 6. Checking a match

**Check my match** (coach, `Enter`) scores how well the two decks are matched right now, from the last few seconds of playback.

It refuses, with a notice, when:

| Situation | Notice |
| --- | --- |
| A deck isn't playing | "Play both decks, match the pitch, then check your mix." |
| Both decks have played together for less than 3 seconds (counted from the last start, or the last change of tempo, pitch, instruments, track, position or cue) | "Let both decks run together for at least 3 seconds before checking. Listen for drift." |
| Pro decks without a recording on both decks | "Load a real track into both decks before checking a Pro mix." |
| A deck has no instruments | "Add an instrument to both decks so you can hear the match." |
| Lesson 8, score of 85 or more but no handover yet | Asks for the crossfader handover ([section 8](#8-learning-path-page)). |

The score, out of 100:

- starts at 100;
- loses 16 points per BPM between the two decks' tempos;
- loses 0.24 points per millisecond the beats are apart, averaged over the last four seconds (the **tempo** drill ignores this part; the **phrase** drill measures it against the 16-beat phrase instead of the beat).

The coach then shows the score, **That's the pocket.** (85 or more) or **You're getting closer.**, a tip, and "Tempo: *x* BPM apart · Phase: *y* ms". The tip depends on what went wrong: drift (adjust the pitch), a small offset (nudge the late deck), or, in the phrase drill, kicks that agree in different phrases.

Every score goes into your history: the last 50 are kept on this device, for the coach's stats and the Training page. In a lesson, 85 or more completes the lesson.

A result stays in the coach until the next check, a new round, a lesson, drill or mode change, or a Randomize tempo, Change track, loop or CHAOS! change on either deck.

## 7. Star runs

A Star run is a 60-second endurance test. Like real turntables, each deck's speed wanders on its own, up to ±1%, changing direction every few seconds; the wobble starts small and grows during the first half. The drift is **not shown**: neither the BPM screen nor the pitch fader moves. You hear it as the kicks start to flam.

- **Where:** Star mode runs one all the time; in Pro decks, **★ Star run** starts one on the loaded tracks.
- **Clock:** counts only while both decks play. Pausing a deck pauses the clock and the drift.
- **In sync** means the beats are within 25 ms and the tempos within 0.3 BPM.

While a run is going, the coach shows the meter: **Drop the needle on both decks** (before you start), **LOCKED IN** or **DRIFTING…**, seconds left, a progress bar with the time in sync, and "In sync *a* s · streak *b* s · best *c* s".

The run ends after 60 seconds, or earlier with **Finish the run** (only after 10 seconds: "Easy, superstar. Keep both decks playing for at least 10 seconds before you bow out."). The result:

- **Score** = 60% the share of time in sync + 40% how close the decks stayed overall;
- a message, and "In sync *a* s of *b* s · longest lock *c* s · *d* ms apart on average".

After a run, **Check my match** only says the run is over and points to **New run** or **★ New star run**. **★ Stop star run** (Pro) cancels a run without a score. Star runs count in your history like checks.

## 8. Learning path page

Eight lessons, from two kicks to a real transition. The page shows "*n* / 8 complete" and a card per lesson:

| # | Name | Badge | Mode | Starts with |
| --- | --- | --- | --- | --- |
| 1 | Meet the beat | FOUNDATION | Foundation | two kicks |
| 2 | Catch the drift | TEMPO | Foundation | two kicks |
| 3 | Find the pocket | PHASE | Loop builder | kick, closed hat |
| 4 | Build the groove | RHYTHM | Loop builder | kick, closed hat, snare, perc |
| 5 | Under the surface | FOCUS | Loop builder | kick, closed hat, snare, clap, bass, perc, synth |
| 6 | Eyes closed, ears open | BY EAR | By ear | kick, closed hat, snare, bass; BPM hidden |
| 7 | Into the real world | PRO DECKS | Pro decks | the first two recordings |
| 8 | Own the transition | EXPERT | Pro decks | the first two recordings; BPM hidden |

Each card has its number, badge (**✓ COMPLETE** once done), name, a one-line description and a button:

| Button | When | Does |
| --- | --- | --- |
| **Start lesson ↗** | Unlocked, not complete | Starts the lesson: switches to its mode with its material, shows the Practice page, and puts the lesson's instruction in the notice bar and the coach. |
| **Practice again ↗** | Complete | The same. |
| **Complete lesson *n*** | Locked | Disabled. A lesson unlocks when the one before it is complete. |

A lesson is complete when **Check my match** scores 85 or more while it runs. **Lesson 8** also needs a handover: while both decks play, move the crossfader from one end (the last 10%) to the other, taking at least 3 seconds (hold `Shift`+`H` or `Shift`+`G`, which glides end to end in 6 s).

A lesson ends when you start another lesson, a drill or a mode (mode bar or `1`–`5`). Going to another page doesn't end it.

At the bottom, "Want to explore at your own pace?" with **Back to the decks →** (goes to the Practice page).

## 9. Training page

Drills for one skill at a time.

**Stats:** **PRACTICE CHECKS** (how many scores are saved), **AVERAGE SCORE**, **PERSONAL BEST**, **LESSONS COMPLETE** (*n*/8).

**Drills**, each with **Start drill ↗**:

| Drill | Name | Mode | How it starts | Scored on |
| --- | --- | --- | --- | --- |
| TEMPO | Catch the tempo | Loop builder | two loops at different tempos | tempo only |
| PHASE | Lock the phase | Loop builder | equal tempos, deck B shifted by about a quarter beat | tempo and beat alignment |
| BLIND | Trust your ears | By ear | as By ear, BPM hidden | tempo and beat alignment |
| PHRASE | Find the one | Loop builder | equal tempos, deck B shifted by four beats | tempo and 16-beat phrase alignment |

Starting a drill shows the Practice page with the drill's instruction in the notice bar and the coach, and **New challenge** in the heading (resets both decks to a fresh start for the drill). In the phase and phrase drills **Randomize tempo** is disabled and Change track and the loop pickers keep the tempo.

**Your recent sessions** shows the last 12 scores as bars, newest first, numbered from the oldest saved score (#1). Before the first check: "Your first match is waiting. Check a match in Practice to start your story."

## 10. Focus session

A full-screen view with nothing but the two decks' essentials, for practicing without distractions. Open it with **Focus session ⛶** or `` ` ``. The browser goes full screen where it can.

| Control | Does |
| --- | --- |
| **Exit focus ✕** | Leaves Focus session. So do `Esc`, `` ` ``, and leaving full screen with the browser's own key. |
| **DECK A** / **DECK B**: **▶ Play** | Starts the deck (disabled while it plays). |
| **Ⅱ Pause** | Pauses the deck (disabled while it's paused). |
| Pitch | The deck's pitch fader with all its controls (section [4.3](#pitch-fader-title-pitch)). |
| Volume | The deck's volume. |

The top line reminds you: "SPACE PLAYS BOTH · ? KEYS · ESC EXITS". Leaving restores the desk exactly as it was, playback included. Only error messages appear here.

## 11. Keyboard help

**?** (top bar, `?` key, or **⌨ Keyboard shortcuts** in the classic look) opens a dialog titled **Hands on. Ears open.** It first shows the five things a first beatmatch needs.

| Control | Does |
| --- | --- |
| **Show more** / **Show less** | Shows the whole keyboard map and the keys of the current view, or goes back to the short version. |
| **Back to the groove** | Closes the dialog. |
| **×** | Closes the dialog. |

The dialog always opens on the short version. Its full content is specified in KEYBOARD.md, [Keyboard help](KEYBOARD.md#78-keyboard-help).

## 12. Skin studio page

Skins change how the app looks; they never change what a control does.

### 12.1 Now wearing

| Part | Does |
| --- | --- |
| Picture | The current skin as a Winamp window ("No picture for this skin" when there's none). |
| Name and description | The skin's name and a line about it. |
| **Download it for Winamp or Webamp ↓** | Built-in skins: downloads its `.wsz` file. |
| **See it in the Winamp Skin Museum ↗** | Skins loaded from the museum: opens its museum page. |
| **↺ Back to Millennium Chrome** | Your own or museum skins: switches back to the default skin. |
| **LOOK**: **Original pixels**, **Comfort**, **Comfort + HD** | Winamp skins: exactly as the author drew it; gentler contrast, saturation and textures; or Comfort plus pixel art redrawn four times finer with smooth lettering (the default). Remembered on this device. |
| Skin DNA | Winamp skins: the skin's colors, letters, digits, buttons, slider knobs and analyser colors, as the app uses them. Display only. |

### 12.2 Built-in skins

Two cards: **Millennium Chrome** (the default) and **Strawberry Mochi**. Clicking a card puts that skin on at once; the active one reads **✓ ACTIVE**, the other **APPLY ↗**.

### 12.3 Winamp Skin Museum

Three numbered steps explain how to borrow any skin from [skins.webamp.org](https://skins.webamp.org/): open the museum, copy a skin's address, paste it here. Step 2 shows two example addresses: cuteamp, "or this one", tricorder.

| Control | Does |
| --- | --- |
| **skins.webamp.org ↗** | Opens the museum in a new tab. |
| Link field ("Paste a skins.webamp.org link here") | Where the link goes. `Enter` loads it. |
| **Load skin** | Downloads the skin and puts it on. Reads **Loading…** meanwhile. An empty field gets "Paste a skin link first…". |
| **Use this example** | Fills the field with the first example link (cuteamp). |
| **Or this one** | Fills the field with the second example link (tricorder). |

A line under the field says how it went ("Loaded “*name*”. Enjoy the view!" or what went wrong).

### 12.4 Make a skin of your own

| Control | Does |
| --- | --- |
| **How to make a bit.cheer skin ↗** | Opens the skin guide in a new tab. |
| **↥ Import a skin file** | Loads a `skin.toml`, a ZIP with `skin.toml` and images, or a Winamp `.wsz` from your computer. |
| **↓ Download template** | Downloads a ZIP with an example `skin.toml` and a README. |

The page ends with credits for the skins and links to the museum and the credits page.

A chosen skin is remembered on this device; a museum or imported skin is kept with it.

## 13. Dropdown lists

Every dropdown (pitch range, Wheel / keys, genre, track, loop, sound, add module, add instrument, output mode…) opens a list in the skin's own style. Click an entry to choose it. From the keyboard: `Enter`, `Space`, `↑` or `↓` open the list; arrows, `Home` / `End` and `Page Up` / `Page Down` move; typing jumps to a matching entry; `Enter` or `Space` choose; `Esc` or `Tab` leave without choosing.

## 14. Messages

What the notice bar says, and when. Errors are marked *(error)*.

| Message | When |
| --- | --- |
| "Cue point saved. Press CUE to return to it." | **SET** |
| "Current position marked as beat one. Grid checks now use this downbeat." | **SET GRID** |
| "This drill keeps tempos equal. Use New challenge for a fresh offset." | Randomize tempo in Star mode (or by key in the phase and phrase drills) |
| "These tracks are too far apart to randomize by at least 1 BPM within ±8% pitch…" *(error)* | Randomize tempo on recordings too far apart |
| "No other playable track in this genre. Import another file or choose another genre." | Previous, Next or Change track with nothing else in the genre |
| "The playable library is loading. You can also import your own files." | Pro decks before the library has arrived |
| "Loading *track*…", then "*track* loaded. Use CUE to find your first downbeat." | Loading a bundled recording |
| "Adding *file* to this session…", then "*file* loaded. BPM estimated *x*; correct it with the track BPM field if needed." | Importing or loading your own file |
| "Import accepts files up to 100 MB…" *(error)* | Import of a larger file |
| "Choose a track shorter than *n* minutes at this audio sample rate…" *(error)* | A file too long to load |
| "Play both decks, match the pitch, then check your mix." and the other check refusals | See [section 6](#6-checking-a-match) |
| "Easy, superstar…", "Run's over. Take a bow…" | See [section 7](#7-star-runs) |
| "Foundation keeps to two kicks. Press 2 for the Loop builder to add elements." | `=` in Foundation |
| The lesson's or drill's instruction | Starting a lesson or drill |
| "Waiting for microphone permission…", "Microphone listening locally. Give it 6 seconds of a clear rhythm. Click again to stop.", "Microphone request cancelled." | The microphone button |
| "Microphone access requires HTTPS or localhost and browser support." *(error)* | Microphone where the browser can't |
| "Skin loaded: *name*" | **↥ Import a skin file** |
| "Your skin kit is downloaded. Edit skin.toml, add optional images, then import the ZIP." | **↓ Download template** |
| "This output has fewer available channels. Switched back to stereo mix." | Audio outputs, after a device change |
| "Browser storage is full or unavailable. This session still works; progress cannot be saved." | Saving fails |

## 15. What the app remembers

On this device (in the browser's storage), across visits:

- the skin (including a museum or imported skin) and its look;
- each mode's module arrangement, and each deck's **Wheel / keys** step;
- folded consoles, folded (windowshade) Winamp windows, the analyser style and the elapsed/remaining time choice;
- completed lessons and the last 50 scores;
- the best Snake score (phone screen).

For this visit only: imported tracks, the chosen music folder, and "Load anyway" on the phone screen (until the tab is closed).

Not remembered: what's on the decks, tempos, pitch, volumes, EQ, composer edits, crossfader, master volume, outputs.

## 16. Known gaps

Places where the interface doesn't quite agree with itself, found while writing this specification:

1. **No New challenge button outside drills.** Foundation, Loop builder and By ear offer a new challenge only through `N`, although KEYBOARD.md's principle is that every key does what an on-screen button does.
2. **"All four practice modes."** The Learning path page says "All four practice modes are always open"; there are five.
3. **Star mode's tempo refusal.** Randomize tempo isn't disabled in Star mode, and its notice speaks of "this drill" and **New challenge**, while Star mode calls it a run and its button is **New run**.
4. **"The track BPM field."** The notice after loading your own file names the field differently from its label, **SOURCE BPM**.
5. **Mode card versus digit key.** Clicking the current mode's card restarts it; pressing its digit does nothing.
6. **Hide BPM and the pitch.** Hide BPM hides tempos but not the pitch percentage, from which the tempo can be worked out.
7. **By ear and the live window.** In By ear the console hides the waveform, beat lights and time, but the live Winamp window still shows the time and the analyser.
8. **Shuffle in fixed-tempo drills.** The live window's Shuffle does nothing in the phase and phrase drills, without the hint or notice the button and key give.
9. **Star runs in lesson 7.** A ★ Star run scoring 85 or more during lesson 7 completes the lesson, like a check.
