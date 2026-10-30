# Keyboard control mode — specification

bit.cheer is a beatmatching school, and beatmatching is a hands-on skill: you listen, move a pitch fader a hair, listen again, nudge, listen again. This specification describes how every practice view is played from the keyboard, so you can keep your eyes closed and your hands on the keys.

The keyboard map lives in [`src/keyboard.js`](../src/keyboard.js). Elm carries out each key the same way as the button it stands for ([`src/Main.elm`](../src/Main.elm), `keyAction`). [`tests/keyboard.test.mjs`](../tests/keyboard.test.mjs) checks that the [complete key table](#11-complete-key-table) below and the code agree, so this document and the app can't drift apart.

Contents

1. [Quick start: five keys](#1-quick-start-five-keys)
2. [Principles](#2-principles)
3. [The keyboard map](#3-the-keyboard-map)
4. [Where keys go: focus rules](#4-where-keys-go-focus-rules)
5. [Deck keys](#5-deck-keys)
6. [Session keys](#6-session-keys)
7. [Views](#7-views): [Foundation](#71-foundation-01), [Loop builder](#72-loop-builder-02), [By ear](#73-by-ear-03), [Star mode](#74-star-mode-04), [Pro decks](#75-pro-decks-05), [Focus session](#76-focus-session), [Lessons and drills](#77-lessons-and-drills), [Keyboard help](#78-keyboard-help), [Learning path, Training, Skin studio](#79-learning-path-training-and-skin-studio)
8. [Feedback](#8-feedback)
9. [Not on the keyboard](#9-not-on-the-keyboard)
10. [Other keyboard layouts](#10-other-keyboard-layouts)
11. [Complete key table](#11-complete-key-table)
12. [For developers](#12-for-developers)

---

## 1. Quick start: five keys

Deck A is the reference; deck B is the one you match. These five keys are enough for a whole beatmatch:

| Key | Does |
| --- | --- |
| `Space` | Play / pause both decks |
| `↑` `↓` | Deck B's pitch up / down, one step per press (hold to keep going) |
| `←` `→` | Nudge deck B back / forward. Hold to slow it down or speed it up until you let go |
| `Enter` | Check my match |
| `N` | Next round (a new challenge, a new run…) |

Press `?` at any time to see every key on screen.

## 2. Principles

1. **Two hands, two decks.** The left hand plays deck A, the right hand plays deck B, and the mixer keys sit between them (`T` `Y` `G` `H` `B` `N`), like a mixer between two turntables.
2. **The same shape under each hand.** Each deck has three rows of four keys: pitch on top, transport in the middle, volume and the deck's track key at the bottom. What you learn on one hand works on the other. The index fingers rest on `F` and `J`, the keys with the little bumps, and those two keys play the decks.
3. **Left is less, right is more.** In every row, the key further left goes down, back or slower; the key further right goes up, forward or faster. The outer keys of the pitch row move ten times as far as the inner ones.
4. **Shift is finer.** Holding Shift turns every move into a fine move (0.01% pitch, a smaller nudge, 1% volume). On the two keys that don't move anything, Shift gives the key's second job: `Shift`+cue saves the cue, `Shift`+track key goes the other way.
5. **A key is its button.** Every key does exactly what its on-screen button does, under the same rules: a drill that fixes the tempo refuses the tempo key with the same notice as the button, a Star run can't finish before ten seconds, and so on. Keys never unlock anything the buttons can't do.
6. **Hold for continuous moves.** Pitch and volume keys repeat while held. Nudge keys bend the speed while held. Crossfader keys glide while held. Every other key acts once per press, however long you hold it.
7. **Keys by position.** Keys are matched by where they are on the keyboard (`KeyboardEvent.code`), not by the letter printed on them, so the hand shapes stay intact on AZERTY, QWERTZ and Italian keyboards. This document names keys by their US caps; see [other keyboard layouts](#10-other-keyboard-layouts).
8. **The browser keeps its shortcuts.** Nothing here uses Ctrl, Alt, Cmd or Meta. Any key pressed with one of them goes to the browser untouched.

## 3. The keyboard map

```text
          DECK A (left hand)        MIX          DECK B (right hand)
        ┌─────┬─────┬─────┬─────┐ ┌─────┬─────┐ ┌─────┬─────┬─────┬─────┐
 pitch  │  Q  │  W  │  E  │  R  │ │  T  │  Y  │ │  U  │  I  │  O  │  P  │
        │ −10 │ −1  │ +1  │ +10 │ │ TAP │ MID │ │ −10 │ −1  │ +1  │ +10 │
        ├─────┼─────┼─────┼─────┤ ├─────┼─────┤ ├─────┼─────┼─────┼─────┤
 trans- │  A  │  S  │  D  │  F  │ │  G  │  H  │ │  J  │  K  │  L  │  ;  │
 port   │ CUE │BACK │ FWD │PLAY │ │ ◀ A │ B ▶ │ │PLAY │BACK │ FWD │ CUE │
        ├─────┼─────┼─────┼─────┤ ├─────┼─────┤ ├─────┼─────┼─────┼─────┤
 volume │  Z  │  X  │  C  │  V  │ │  B  │  N  │ │  M  │  ,  │  .  │  /  │
        │ 0%  │VOL− │VOL+ │TEMPO│ │ BPM │ NEW │ │TEMPO│VOL− │VOL+ │ 0%  │
        └─────┴─────┴─────┴─────┘ └─────┴─────┘ └─────┴─────┴─────┴─────┘

 Space   play / pause both         ↑ ↓ ← →   deck B: pitch and nudge
 Enter   check my match            `         Focus session on / off
 1 – 5   practice mode 01 – 05     =         add an element to both decks
 ?       keyboard help             Esc       close / leave / let go
```

`TEMPO` reads `NEXT` in Pro decks (the track key loads the next track there). The keys mirror each other: the index fingers play (`F`, `J`) and the little fingers cue (`A`, `;`), while the middle keys run left to right on both hands (`S` `D` and `K` `L` are both back, then forward).

## 4. Where keys go: focus rules

Shortcuts work wherever the page has the keyboard. A focused control keeps only the keys it needs; every other key still reaches the decks, so clicking a button or a slider with the mouse never "steals" the keyboard.

| Focused element | Keys it keeps | Everything else |
| --- | --- | --- |
| Nothing (the page) | none | shortcuts |
| A text, search or number field (folder filter, source BPM, skin link) | every key, so you can type | `Esc` lets go of the field |
| A dropdown (pitch range, genre, track, add module…) | every key (the skin's list opens with `Enter`, `Space`, `↑` or `↓` and handles its own keys while open) | `Esc` lets go of the dropdown |
| A slider: pitch fader, volume, crossfader, EQ, level, pan | `↑` `↓` `←` `→`, `Page Up` `Page Down`, `Home` `End` (they move that slider) | shortcuts |
| The jog wheel | the arrows (`←` `→` nudge it), `Home` `End` (start / end of the track) | shortcuts |
| A button or toggle **reached with Tab** | `Space` and `Enter` press it | shortcuts |
| A button or toggle **clicked with the mouse**, or focused by the app (the `?` button after the help closes) | none | shortcuts, `Space` and `Enter` included |
| A link reached with Tab | `Enter` follows it | shortcuts |
| The keyboard help dialog | `Tab` / `Shift`+`Tab` move between its two buttons; `Space` and `Enter` press them | only `?` and `Esc` (both close it) |

A button counts as reached with Tab only when the focus arrived there by a `Tab` or `Shift`+`Tab` press. A keyboard-only user can still Tab to any button and press it with `Space`, while someone who just clicked **Randomize tempo** and then presses `Space` plays both decks instead of randomizing again. (The browser's `:focus-visible` can't make this distinction: it switches on for any focused button as soon as a key is pressed.)

`Esc` with a control focused simply lets go of it (the control loses focus); press it once more and nothing else happens. `Page Up` and `Page Down` are never shortcuts: they still scroll the page.

## 5. Deck keys

Deck keys work on the practice page in all five modes and in Focus session, except the track key, which only works on the practice page.

| Deck A | Deck B | Press | With Shift | Held |
| --- | --- | --- | --- | --- |
| `Q` | `U` | Pitch down **ten steps** | Pitch down 0.01% | repeats |
| `W` | `I` | Pitch down **one step** | Pitch down 0.01% | repeats |
| `E` | `O` | Pitch up **one step** | Pitch up 0.01% | repeats |
| `R` | `P` | Pitch up **ten steps** | Pitch up 0.01% | repeats |
| `A` | `;` | **Cue**: stop and return to the saved cue point | **Set cue**: save the current position as the cue | once |
| `S` | `K` | **Nudge back** by 0.04 beat | Nudge back by 0.01 beat | after 250 ms, slow the deck down 4% (Shift: 1%) until released |
| `D` | `L` | **Nudge forward** by 0.04 beat | Nudge forward by 0.01 beat | after 250 ms, speed the deck up 4% (Shift: 1%) until released |
| `F` | `J` | **Play / pause** | same | once |
| `Z` | `/` | **Pitch to 0%** (the track's own tempo) | same | once |
| `X` | `,` | **Volume down** 5% | Volume down 1% | repeats |
| `C` | `.` | **Volume up** 5% | Volume up 1% | repeats |
| `V` | `M` | **Track key**, see the [views](#7-views) | its second job, see the views | once |

The arrows are a second set of keys for deck B, the deck the lessons ask you to match:

| Key | Press | With Shift | Held |
| --- | --- | --- | --- |
| `↑` / `↓` | Deck B pitch up / down one step | 0.01% | repeats |
| `←` / `→` | Nudge deck B back / forward (as `K` / `L`) | finer | bends, as `K` / `L` |

### Pitch steps

- **One step** is the deck's **Wheel / keys** setting under its pitch fader: Fine 0.01%, Normal 0.05% (the default) or Coarse 0.25%. The same setting drives the mouse wheel and the arrow keys on a focused fader, so all three always agree.
- **Ten steps** (`Q` `R` `U` `P`) is ten times that: 0.1%, 0.5% or 2.5%. Use them to get close, then the inner keys to settle.
- **Shift** always moves exactly 0.01%, the finest step, whichever key and setting.
- Pitch keys never stop at the end of the fader. A press that would go past the pitch range widens it to the next size (±2 → ±4 → ±8 → ±16 → ±32 → ±50%); ±50% is the limit.
- Pitch here is classic varispeed, exactly as with the fader: the tempo and the musical pitch move together.

### Nudge and bend

A tap moves the deck's playhead by 0.04 beat (about 20 ms at 120 BPM), the same as its on-screen nudge buttons; with Shift, 0.01 beat. Keep the key down for more than 250 ms and the deck also bends: it plays 4% slower (back) or faster (forward) for as long as the key is held, then returns to its pitch the moment you let go, like pushing or braking a vinyl platter. Shift bends by 1%. The jog wheel lights up while it bends. Holding back and forward on the same deck cancels out. Switching to another window releases every held key.

### Cue

`A` / `;` do what **CUE** does: stop the deck and return it to its saved cue point (the start of the track until you save one). `Shift`+`A` / `Shift`+`;` do what **SET** does: save the current position as the cue point. A common drill: set a cue on a kick of deck B, press cue, then press `J` exactly on a kick of deck A.

## 6. Session keys

| Key | Does | Where |
| --- | --- | --- |
| `Space` | Play / pause both decks: if either deck plays, both pause; otherwise both play | practice, Focus session |
| `Enter` | **Check my match** (scores the last seconds of playback in the coach); during a Star run, **Finish the run** | practice |
| `N` | The view's **next round**, see each view | practice |
| `B` | **Hide / show the BPM**, the same as the **Hide BPM** toggle | practice |
| `T` | **Tap tempo**, the same as the **TAP** button (the result shows in the Tap tempo module) | practice |
| `G` | Crossfader toward deck A while held: end to end in 2 s, or 6 s with Shift | practice, Focus session |
| `H` | Crossfader toward deck B while held, as `G` | practice, Focus session |
| `Y` | Crossfader to the middle | practice, Focus session |
| `=` | **Add an element to both decks**, the same as **+ Add an element to both decks** (Loop builder, By ear, Star mode) | practice |
| `` ` `` | **Focus session** on / off | practice, Focus session |
| `1` … `5` | Practice mode 01 Foundation, 02 Loop builder, 03 By ear, 04 Star mode, 05 Pro decks (the numbers on the mode bar) | practice, Learning path, Training, Skin studio |
| `?` | Open / close the keyboard help | everywhere |
| `Esc` | Close the keyboard help; else leave Focus session; else let go of the focused control | everywhere |

Notes:

- The crossfader keys do nothing while **Audio outputs** sends the decks to separate hardware channels, because the software crossfader is bypassed then (its slider is disabled too).
- A digit for another mode starts that mode, exactly like clicking it on the mode bar: the decks stop and fresh material loads. The digit of the mode you're already in does nothing on the practice page (so a stray press never throws away a match), and from Learning path, Training or Skin studio it just brings you back to that mode's decks without starting over.

## 7. Views

Each practice mode is a view of the same two decks, so the [deck keys](#5-deck-keys) and [session keys](#6-session-keys) work in all of them. This section lists what is particular to each view: the track key (`V` / `M`), the next-round key (`N`), and anything a key does differently or not at all.

### 7.1 Foundation (01)

Two clean kick drums, 120 and 124 BPM to begin with. Match the speed with pitch, then bring each hit together with nudge.

| Key | In Foundation |
| --- | --- |
| `V` / `M` | **Randomize tempo** of deck A / B: a new tempo within ±4% of the other deck and at least 1 BPM from where it was, pitch back to 0 |
| `Shift`+`V` / `M` | **Change track**: a new kick loop on that deck at its own tempo, pitch back to 0 |
| `N` | **New challenge**: a fresh pair of kicks with new tempos, 2–5 BPM apart; both decks stop |
| `=` | Nothing to add: Foundation is kick-only. A notice suggests pressing `2` for the Loop builder |

A typical round, eyes closed: `Space` to start both decks; listen for which kick runs ahead; `I` / `O` (or `↓` / `↑`) until the double hit stops drifting; `K` / `L` to lay the kicks on top of each other; `Enter` to check; `N` for the next pair.

### 7.2 Loop builder (02)

Layered loops: kick and closed hat at first, up to twenty instruments per deck in the composer.

| Key | In Loop builder |
| --- | --- |
| `V` / `M` | **Randomize tempo** of that deck: within ±8% of the other deck, at least 1 BPM away |
| `Shift`+`V` / `M` | **Change track**: a new loop with other instruments at the deck's own tempo, pitch back to 0 |
| `N` | **New challenge**: fresh loops and tempos (2–8 BPM apart) on both decks, both with deck A's current instruments |
| `=` | **Add an element to both decks** (the next instrument in the bank; nothing once both decks have all twenty) |

The composer itself (choosing instruments, steps, level, pan, solo, CHAOS!) is reached with `Tab`, see [not on the keyboard](#9-not-on-the-keyboard).

### 7.3 By ear (03)

The tempo readouts, elapsed time, waveforms and beat lights are hidden. Everything works as in the Loop builder.

| Key | In By ear |
| --- | --- |
| `V` / `M`, `Shift`+`V` / `M`, `N`, `=` | as in the Loop builder |
| `B` | **Show the BPM** (and the other visual aids) for a peek; press again to hide them |

Training tip: the keys give you everything a blind match needs, so you never have to look at the screen. Use `Shift` with the pitch keys for the last tiny corrections.

### 7.4 Star mode (04)

A 60-second endurance run: the decks start at the same tempo, then drift on their own like real turntables (up to ±1%, invisible on the BPM screen and the fader). The run clock only runs while both decks play.

| Key | In Star mode |
| --- | --- |
| `Enter` | **Finish the run** once both decks have played together for 10 seconds (before that, a notice asks you to keep going). After the run, a notice points you to `N` for a new one |
| `N` | **New run**: fresh loops, the run starts over |
| `V` / `M` | Refused with the run's notice: Star mode keeps the tempos equal, and the drift is the challenge |
| `Shift`+`V` / `M` | **Change track**: another loop on that deck, still at the shared tempo |
| `=` | **Add an element to both decks** |

Here the hold-to-bend nudge (`K` / `L`, `S` / `D`) is the main tool: when a deck creeps ahead, hold back on it for a moment instead of tapping repeatedly.

### 7.5 Pro decks (05)

Real recordings, one track picker per deck.

| Key | In Pro decks |
| --- | --- |
| `V` / `M` | **Next track** in the deck's genre (the same as **Next ▶**); the deck keeps playing or stays paused, and its pitch returns to 0 |
| `Shift`+`V` / `M` | **Previous track** (the same as **◀ Previous**) |
| `N` | **★ Star run**: start one on the loaded tracks; during a run, stop it; after a run, start a new one |
| `Enter` | **Check my match**: both decks need a real track loaded, as with the button |
| `B` | Hide / show the BPM, including the SOURCE BPM field |
| `=` | Does nothing: there is nothing to add to a recording |

`A` / `;` with `Shift` (set cue) matter most here: mark the first kick of each track, then use cue and play to start them on the beat. Choosing a genre, picking a specific track, importing a file, browsing a folder and **SET GRID** are reached with `Tab`.

### 7.6 Focus session

Both decks reduced to play, pitch and volume, full screen. The keys are the ones whose effect you can hear or see in this view.

| Key | In Focus session |
| --- | --- |
| Deck keys | all of them except the track key (`V` / `M`) |
| `↑` `↓` `←` `→` | deck B pitch and nudge |
| `Space` | play / pause both decks |
| `G` `H` `Y` | crossfader |
| `` ` `` or `Esc` | leave Focus session (the layout and the playback stay as they were) |
| `?` | the keyboard help, showing only these keys |
| Not here | `Enter`, `N`, `B`, `T`, `=`, `1`–`5` and the track key: the coach, the BPM screen and the track names aren't shown in Focus session. Leave it first |

Leaving full screen with the browser's own key (`Esc` or `F11`) also leaves Focus session.

### 7.7 Lessons and drills

Lessons (Learning path) and drills (Training) run in the views above, so the same keys apply. The differences:

- `N` is **New challenge** in a drill: both decks reset to a fresh starting point for that drill. In a lesson, `N` does what it does in the lesson's view (a new challenge, or a ★ Star run in the Pro lessons).
- In the phase and phrase drills the tempo is fixed: `V` / `M` are refused with the drill's notice, as the disabled **Randomize tempo** buttons are.
- `Enter` scores the match with the drill's rules (tempo, phase, blind or phrase) or the lesson's rules; a score of 85 completes a lesson.
- Lesson 8 asks for a crossfader handover from one end to the other over at least 3 seconds while both decks play: hold `Shift`+`H` (or `Shift`+`G`), which glides end to end in 6 seconds. Without Shift the glide takes 2 seconds, too quick on its own.
- `1`–`5` start a practice mode, which ends the lesson or drill, exactly like the mode bar.

### 7.8 Keyboard help

`?` opens a dialog with the three letter rows drawn as key caps in the skin's style (deck A, the mixer keys, deck B), the Shift and track-key meanings for the current view, and the other keys of the current view. In Focus session it lists only Focus session's keys and leaves the unused caps blank.

While it is open, `Tab` and `Shift`+`Tab` move between its two buttons, `Space` / `Enter` press them, and `?` or `Esc` close it. On the practice page, closing returns the keyboard focus to the `?` button in the top bar.

### 7.9 Learning path, Training and Skin studio

These pages are for reading and choosing, not for playing, so they have no shortcuts of their own; use `Tab` and `Space` / `Enter` on their buttons. Only the keys that move around the app work here: `1`–`5` (back to a practice mode), `?` (help) and `Esc`.

## 8. Feedback

- **Glow.** When a key acts, the control it stands for glows for a moment (a ring in the skin's accent color), so you can see which button each key is. Keys whose control isn't on screen (a hidden module, Focus session) still work.
- **Notices.** A key the current view refuses answers with the same notice its button would give (for example "This drill keeps tempos equal…").
- **Sound.** Everything else you hear: that is the point.

## 9. Not on the keyboard

Some controls are about setting things up rather than beatmatching. They have no shortcut; reach them with `Tab` and use `Space` / `Enter`, the arrows on sliders, or the dropdown keys:

- the composer (instruments, the sixteen steps, level, pan, solo, Generate pattern, CHAOS!, + Add next);
- module layout (Hide / Open, ×, + Add module…), EQ, loop, VU, waveform zoom (`−` / `+` buttons) and the jog wheel's own keys;
- the pitch range and Wheel / keys dropdowns, master volume, split cue, audio outputs;
- track picker details (genre, track, Load, Change track, Import, Browse folder, the folder browser, SOURCE BPM, SET GRID);
- the microphone tempo listener, the external track discovery links, and the skin's live Winamp window (click its buttons).

## 10. Other keyboard layouts

Keys go by position, so on other layouts press the key **in the same place** as the US key named here. The letters A–Z are in the same place on Italian keyboards; these are the caps that differ:

| US cap (position) | Italian | German (QWERTZ) | French (AZERTY) |
| --- | --- | --- | --- |
| `Q` / `W` (deck A pitch −10 / −1) | Q / W | Q / W | A / Z |
| `A` (deck A cue) | A | A | Q |
| `Z` (deck A pitch 0) | Z | Y | W |
| `Y` (crossfader middle) | Y | Z | Y |
| `M` (deck B track key) | M | M | , |
| `;` (deck B cue) | ò | ö | M |
| `,` / `.` (deck B volume) | , / . | , / . | ; / : |
| `/` (deck B pitch 0) | - | - | ! |
| `=` (add an element) | ì | ´ | = |
| `` ` `` (Focus session) | \ | ^ | ² |
| `1`–`5` (modes) | 1–5 | 1–5 | & é " ' ( (Shift not needed) |

The help key is the exception: it is the `?` character itself, wherever your layout puts it (Shift+' on Italian, Shift+ß on German, Shift+, on French). On AZERTY, `?` shares its key with deck B's track key; Shift on that key goes to the track key (previous track or change track), so open the help with the `?` button in the top bar there.

## 11. Complete key table

This table is the specification of record: [`tests/keyboard.test.mjs`](../tests/keyboard.test.mjs) reads it and fails if it differs from [`src/keyboard.js`](../src/keyboard.js). *Position* is the `KeyboardEvent.code`; *Works in* lists the keyboard contexts (the `data-keys` attribute on the app shell): `practice` (the practice page), `focus` (Focus session), `page` (Learning path, Training, Skin studio) and `help` (the keyboard help is open). *Action* is the action id that `src/keyboard.js` sends and `keyAction` in `src/Main.elm` carries out.

| Key | Position | Works in | Action | Deck | Direction |
| --- | --- | --- | --- | --- | --- |
| `Q` | `KeyQ` | practice focus | pitch (ten steps) | A | down |
| `W` | `KeyW` | practice focus | pitch | A | down |
| `E` | `KeyE` | practice focus | pitch | A | up |
| `R` | `KeyR` | practice focus | pitch (ten steps) | A | up |
| `A` | `KeyA` | practice focus | cue | A | |
| `S` | `KeyS` | practice focus | nudge | A | back |
| `D` | `KeyD` | practice focus | nudge | A | forward |
| `F` | `KeyF` | practice focus | play | A | |
| `Z` | `KeyZ` | practice focus | pitchZero | A | |
| `X` | `KeyX` | practice focus | volume | A | down |
| `C` | `KeyC` | practice focus | volume | A | up |
| `V` | `KeyV` | practice | track | A | |
| `U` | `KeyU` | practice focus | pitch (ten steps) | B | down |
| `I` | `KeyI` | practice focus | pitch | B | down |
| `O` | `KeyO` | practice focus | pitch | B | up |
| `P` | `KeyP` | practice focus | pitch (ten steps) | B | up |
| `J` | `KeyJ` | practice focus | play | B | |
| `K` | `KeyK` | practice focus | nudge | B | back |
| `L` | `KeyL` | practice focus | nudge | B | forward |
| `;` | `Semicolon` | practice focus | cue | B | |
| `M` | `KeyM` | practice | track | B | |
| `,` | `Comma` | practice focus | volume | B | down |
| `.` | `Period` | practice focus | volume | B | up |
| `/` | `Slash` | practice focus | pitchZero | B | |
| `↑` | `ArrowUp` | practice focus | pitch | B | up |
| `↓` | `ArrowDown` | practice focus | pitch | B | down |
| `←` | `ArrowLeft` | practice focus | nudge | B | back |
| `→` | `ArrowRight` | practice focus | nudge | B | forward |
| `Space` | `Space` | practice focus | playBoth | | |
| `G` | `KeyG` | practice focus | crossfade | | toward A |
| `H` | `KeyH` | practice focus | crossfade | | toward B |
| `Y` | `KeyY` | practice focus | crossfadeCenter | | |
| `` ` `` | `Backquote` | practice focus | focus | | |
| `Enter` | `Enter` | practice | check | | |
| `Enter` (keypad) | `NumpadEnter` | practice | check | | |
| `N` | `KeyN` | practice | new | | |
| `B` | `KeyB` | practice | hideBpm | | |
| `T` | `KeyT` | practice | tap | | |
| `=` | `Equal` | practice | addElement | | |
| `1` | `Digit1` | practice page | mode (Foundation) | | |
| `2` | `Digit2` | practice page | mode (Loop builder) | | |
| `3` | `Digit3` | practice page | mode (By ear) | | |
| `4` | `Digit4` | practice page | mode (Star mode) | | |
| `5` | `Digit5` | practice page | mode (Pro decks) | | |
| `Esc` | `Escape` | practice focus page help | escape | | |
| `?` | the `?` character | practice focus page help | help | | |

Messages from `src/keyboard.js` to Elm have the form `{ type: 'key', action, deck, dir, big, value, shift }` (only the fields the action needs). Nudge and crossfader keys also act in `src/main.js` while they are held: the bend goes straight to the audio engine, and the glide sends small `crossfade` steps with a `value`.

## 12. For developers

- **Adding or changing a key:** change `BINDINGS` in `src/keyboard.js`, the matching `keyAction` branch in `src/Main.elm` if the action is new, this document (the view sections and the [complete key table](#11-complete-key-table)), and the help dialog (`helpView` / `keyboardMap` in `src/Main.elm`). `npm test` fails until the table and the code agree.
- **Contexts:** Elm renders `data-keys` on the app shell from `keyContext`; `src/main.js` reads it on every key press, so a key always sees the current view.
- **Focus rules:** `controlKeeps` in `src/keyboard.js` implements [section 4](#4-where-keys-go-focus-rules). The pitch fader and jog wheel handle their own arrow keys in `src/main.js` before it.
- **Held keys:** `src/main.js` tracks held nudge and crossfader keys by position, releases them on key up, and releases all of them when the window loses focus.
- **Tests:** `tests/keyboard.test.mjs` (the map, the focus rules, this table) and the keyboard tests in `tests/e2e.spec.js` (real key presses in Chromium).
