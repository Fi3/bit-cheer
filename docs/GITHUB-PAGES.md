# Publish Bit Cheer with GitHub Pages

Bit Cheer builds to a static `dist/` directory. GitHub Pages can serve the Elm frontend, Rust WebAssembly engine, AudioWorklets, skins, and bundled music without an application server.

## Enable deployment

1. Put this repository in your GitHub account or organization. Keep `.github/workflows/deploy.yml`, `package-lock.json`, `elm.json`, `engine/`, `src/`, and `public/` in the repository. Generated `dist/`, `public/elm.js`, and `public/engine.wasm` stay ignored: the workflow builds them.
2. Open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
3. Push to `main` or `master`, or open **Actions → Deploy Bit Cheer to GitHub Pages → Run workflow**. If your default branch has another name, change the workflow's branch list.
4. Wait for both the **build** and **deploy** jobs to succeed. The deployment's **github-pages** environment links to the live site. The URL is also shown in **Settings → Pages**.

The workflow installs Node.js 22, Rust 1.94.1 with `wasm32-unknown-unknown`, and the locked npm dependencies (including Elm 0.19.1). It runs `npm test`, builds all three language layers with `npm run build`, and publishes the `dist/` artifact. The build job has read-only repository access; deployment receives the Pages and identity-token permissions needed by GitHub's official actions. No personal access token is required.

These steps follow [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite's Pages deployment guide](https://vite.dev/guide/static-deploy.html#github-pages).

## Repository paths and custom domains

The workflow determines the base path from the repository name:

| Repository | Public URL | Build base |
| --- | --- | --- |
| `alice/bit-cheer` | `https://alice.github.io/bit-cheer/` | `/bit-cheer/` |
| `alice/alice.github.io` | `https://alice.github.io/` | `/` |

The compiled JavaScript, Elm image and credits links, CSS graphics, catalog audio, WebAssembly, and worker URLs all use that base. The app's tabs do not require a server-side route fallback.

For a custom domain, configure the domain in **Settings → Pages**, then set the repository Actions variable **VITE_BASE_PATH** to `/` under **Settings → Secrets and variables → Actions → Variables**. For another intentional subdirectory, set that variable to the desired leading-and-trailing-slash path, such as `/practice/`. Run the deployment workflow again after changing it.

## Build and preview locally

Install Node.js 22, Rust through rustup, and the WebAssembly target. Then run:

```sh
rustup target add wasm32-unknown-unknown
npm ci
npm test
VITE_BASE_PATH=/bit-cheer/ npm run build
VITE_BASE_PATH=/bit-cheer/ npm run preview -- --port 4173
```

Open `http://localhost:4173/bit-cheer/`. For a root-domain deployment, use `VITE_BASE_PATH=/` for both commands.

To inspect a Pages build without replacing an existing root preview, choose a separate output directory:

```sh
VITE_BASE_PATH=/bit-cheer/ BUILD_OUT_DIR=/tmp/bit-cheer-pages-dist npm run build
VITE_BASE_PATH=/bit-cheer/ BUILD_OUT_DIR=/tmp/bit-cheer-pages-dist npm run preview -- --port 4174
```

This writes and serves `/tmp/bit-cheer-pages-dist` while leaving `dist/` untouched. The supported Vite CLI `--base` option can also override the base for a direct Vite build.

## Audio on the published site

GitHub Pages provides HTTPS, which is required for AudioWorklet and microphone features outside localhost. Keep **Enforce HTTPS** enabled when using a custom domain. Start playback with a button or keyboard action; browsers require user interaction before starting audio. Microphone input asks for browser permission when selected.

Imported tracks remain in the browser's session library and are not uploaded to GitHub. Device/output selection and the number of exposed hardware channels still depend on the browser and operating system. Pages hosting does not add output channels or change those controls.

## If deployment fails

- **Pages setup error:** confirm **Settings → Pages → Source** is **GitHub Actions**, then rerun the workflow.
- **Blank screen or missing audio/graphics:** verify the workflow's base matches the published URL, including its repository segment. Rebuild after changing `VITE_BASE_PATH`; do not move a build compiled for `/` into a repository subdirectory.
- **A red build job:** open its failed step. Compilation and tests run before deployment, so an unsuccessful build does not replace the currently published site.
- **No microphone or audio context:** open the HTTPS URL, interact with the player, and check the browser's microphone/site permissions.
