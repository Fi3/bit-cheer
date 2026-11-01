# CI and GitHub Pages deployment

Bit Cheer builds to a static `dist/` directory. GitHub Pages serves the Elm frontend, Rust WebAssembly engine, AudioWorklets, skins, and bundled music without an application server. Two workflows keep it healthy:

| Workflow | Runs on | Does |
| --- | --- | --- |
| **CI** (`.github/workflows/ci.yml`) | every pull request; also callable | **Lint and unit tests**: `npm run lint` and `npm test`. **Browser tests (Chromium)**: `npm run test:e2e`, keeping screenshots and traces of failures for a week. |
| **Deploy Bit Cheer to GitHub Pages** (`.github/workflows/deploy.yml`) | every push to `main` (a merged pull request), or by hand | Runs CI, then builds the site for the Pages base path, then publishes it. |

A failing check stops the deploy, so the live site keeps its last good version. Dependabot (`.github/dependabot.yml`) opens one grouped update pull request a month for the pinned GitHub Actions and one for npm, and CI checks them like any other. To make GitHub refuse merges until CI passes, add a branch protection rule for `main` under **Settings → Branches** that requires the **Lint and unit tests** and **Browser tests (Chromium)** status checks.

## Enable deployment

1. Put this repository in your GitHub account or organization. Keep `.github/workflows/`, `package-lock.json`, `rust-toolchain.toml`, `elm.json`, `review/`, `engine/`, `src/`, and `public/` in the repository. Generated `dist/`, `public/elm.js`, and `public/engine.wasm` stay ignored: the workflow builds them.
2. Open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
3. Merge a pull request into `main` (or push to it), or open **Actions → Deploy Bit Cheer to GitHub Pages → Run workflow**. If your default branch has another name, change the workflow's branch list.
4. Wait for the **CI**, **build** and **deploy** jobs to succeed. The deployment's **github-pages** environment links to the live site. The URL is also shown in **Settings → Pages**.

The workflows install Node.js 22, the Rust release pinned in `rust-toolchain.toml` (with rustfmt, clippy and the `wasm32-unknown-unknown` target), and the locked npm dependencies, including Elm 0.19.1. The build job has read-only repository access; deployment receives the Pages and identity-token permissions needed by GitHub's official actions. No personal access token is required.

These steps follow [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite's Pages deployment guide](https://vite.dev/guide/static-deploy.html#github-pages).

## Repository paths and custom domains

The workflow determines the base path from the repository name:

| Repository | Public URL | Build base |
| --- | --- | --- |
| `alice/bit-cheer` | `https://alice.github.io/bit-cheer/` | `/bit-cheer/` |
| `alice/alice.github.io` | `https://alice.github.io/` | `/` |

The compiled JavaScript, Elm image and credits links, CSS graphics, catalog audio, WebAssembly, and worker URLs all use that base. The app's tabs do not require a server-side route fallback.

For a custom domain, configure the domain in **Settings → Pages**, then set the repository Actions variable **VITE_BASE_PATH** to `/` under **Settings → Secrets and variables → Actions → Variables**. For another intentional subdirectory, set that variable to the desired leading-and-trailing-slash path, such as `/practice/`. Run the deployment workflow again after changing it.

To check a custom domain, open **Actions → Diagnose GitHub Pages domain → Run workflow** (`.github/workflows/pages-diagnostics.yml`). It reports the saved Pages domain and certificate state, DNS answers, and HTTP redirect chains as seen from a GitHub runner.

## Build and preview locally

Install Node.js 22.12 or later and rustup; rustup installs the pinned Rust release from `rust-toolchain.toml`. Then run:

```sh
npm ci
npm run check
VITE_BASE_PATH=/bit-cheer/ npm run build
VITE_BASE_PATH=/bit-cheer/ npm run preview -- --port 4173
```

Open `http://localhost:4173/bit-cheer/`. For a root-domain deployment, use `VITE_BASE_PATH=/` for both commands.

To inspect a Pages build without replacing an existing root preview, choose a separate output directory:

```sh
VITE_BASE_PATH=/bit-cheer/ BUILD_OUT_DIR=/tmp/bit-cheer-pages-dist npm run build
VITE_BASE_PATH=/bit-cheer/ BUILD_OUT_DIR=/tmp/bit-cheer-pages-dist npm run preview -- --port 4174
```

This writes and serves `/tmp/bit-cheer-pages-dist` while leaving `dist/` untouched. The supported Vite CLI `--base` option can also override the base for a direct Vite build. [TESTING.md](TESTING.md) shows how to run the browser suite against such a build.

## Audio on the published site

GitHub Pages provides HTTPS, which is required for AudioWorklet and microphone features outside localhost. Keep **Enforce HTTPS** enabled when using a custom domain. Start playback with a button or keyboard action; browsers require user interaction before starting audio. Microphone input asks for browser permission when selected.

Imported tracks remain in the browser's session library and are not uploaded to GitHub. Device/output selection and the number of exposed hardware channels still depend on the browser and operating system. Pages hosting does not add output channels or change those controls.

## If something fails

- **A red CI job:** open the failed step. For browser tests, download the **playwright-results** artifact for screenshots and traces. [TESTING.md](TESTING.md) explains how to run the same checks locally.
- **Pages setup error:** confirm **Settings → Pages → Source** is **GitHub Actions**, then rerun the workflow.
- **Blank screen or missing audio/graphics:** verify the workflow's base matches the published URL, including its repository segment. Rebuild after changing `VITE_BASE_PATH`; do not move a build compiled for `/` into a repository subdirectory.
- **No microphone or audio context:** open the HTTPS URL, interact with the player, and check the browser's microphone/site permissions.
