# bit.cheer

**Train your ears. Find your groove.** A two-deck beatmatching school that runs in your browser, dressed in real Winamp skins. Play it at **[bit-cheer.com](https://bit-cheer.com)**.

Two decks, a crossfader, and a coach that tells you when your kicks sit together. Start with two lonely kick drums and work your way up to real tracks. Everything runs on your machine: your music, your mic, your progress and your skins never leave it.

## What's inside

- **Five practice modes:** Foundation (two kicks), Loop builder (twenty instruments and 24 named chill loops), By ear (no numbers, just ears), Star mode (60 seconds on drifting decks) and Pro decks (40 Creative Commons recordings, your own files, or a whole music folder).
- **A learning path** of eight lessons and four training drills, scored on tempo, beat and phrase.
- **Keyboard play:** each hand runs its own deck. Press `?` in the app to see the keys.
- **Skins:** Millennium Chrome and the very cute Strawberry Mochi built in, any classic skin from the [Winamp Skin Museum](https://skins.webamp.org/) one paste away, or one you make yourself.
- **Real gear:** send each deck to its own output channels and mix on a hardware mixer.

New here? The [manual](public/manual.html), also linked in the app's footer, is the friendly way in.

## Run it locally

You need Node.js 22.12 or later, Python 3 (for the tests) and [rustup](https://rustup.rs), which reads `rust-toolchain.toml` and installs the pinned Rust release with its WebAssembly target.

```sh
npm ci
npm run dev
```

Open the address Vite prints. Audio needs `localhost` or HTTPS, so opening `index.html` straight from disk won't work.

## Hack on it

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server. After editing Elm run `npm run build:elm`, after Rust `npm run build:wasm`. |
| `npm run build` | Production site in `dist/`. |
| `npm run fmt` | Format the Rust, Elm and JavaScript. |
| `npm run check` | Every linter and unit test, as CI runs them. |
| `npm run test:e2e` | The browser suite in Chromium. |

It's an Elm UI talking through a JavaScript bridge to a Rust/WebAssembly audio engine in an AudioWorklet. [AGENTS.md](AGENTS.md) walks through the architecture and the house rules, for people and coding agents alike. Every pull request runs CI, and every merge to `main` deploys to GitHub Pages.

## Docs

- [Manual](public/manual.html): how to play.
- [UI specification](docs/UI.md) and [keyboard specification](docs/KEYBOARD.md): every control and every key.
- [Audio engine](engine/README.md): the Rust/WASM core and its interface.
- [Testing](docs/TESTING.md): the test suites and what they cover.
- [Deployment](docs/GITHUB-PAGES.md): CI, GitHub Pages and custom domains.
- [Skin guide](public/skin-guide.html): make your own skin.
- [References](docs/REFERENCES.md) and [credits](public/credits.html): where the music and the skins come from.

## License

The code is MIT licensed ([LICENSE](LICENSE)). The bundled recordings are CC BY 3.0 by their artists, the museum skins belong to their authors, and the fonts use the SIL Open Font License: details in [the references](docs/REFERENCES.md).
