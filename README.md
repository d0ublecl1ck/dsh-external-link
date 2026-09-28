# dsh-external-link

> Stop clicking a link and watching it open in a window inside DSH. Anchor clicks in the DSH web GUI go to your OS default application instead — including `http://localhost`, which the Electron shell otherwise treats as its own surface.

`dsh-plugin` · MIT · macOS / Windows / Linux · zero configuration

## When you need it

- You work in a UI project and click `http://localhost:5173` in a chat. DSH Desktop opens a bare in-app window instead of your browser.
- You click a documentation link and want it in the browser you actually browse in — with your tabs, extensions and logins.
- You click a `mailto:` or `tel:` link and want the OS handler, not a dead anchor.

## What it does

| Where | Behaviour |
|---|---|
| Anchor click on `http` / `https` / `mailto` / `tel` | Handed to the OS default application (`open` on macOS, `start` on Windows, `xdg-open` on Linux) |
| Anchor click on a same-origin link | Left alone — in-app navigation still works |
| Any other scheme (`file:`, `javascript:`, `data:`, relative paths) | Left alone |
| `window.open` from application code (not an anchor click) | Not intercepted |

## Install

```sh
dsh plugin --profile web add github:d0ublecl1ck/dsh-external-link
```

Reload the DSH window (or restart DSH). The host half mounts `POST /external-link/open`; the browser half starts intercepting clicks as soon as the page is loaded.

Uninstall:

```sh
dsh plugin --profile web remove dsh-external-link
```

## How it works

```
anchor click
  → capture-phase listener in the browser half
  → POST /external-link/open            (only off-origin http/https/mailto/tel)
  → connection trust fence              (unauthenticated callers get 401)
  → platform opener                     (open / start / xdg-open)
  → your default browser
```

The click never reaches the Electron shell's window handler, which is what keeps `http://localhost` out of an in-app window.

## Why not the built-in setting?

DSH ships a preference — Settings → General → **Open chat links in** (`ui-chat.linkOpening`) with *In-App Sidebar* and *Default Browser*. It is only rendered when the in-app browser sidebar plugin (`@deepseek-ai/dsh-client-ui-sidebar-browser`) is loaded, and the *Default Browser* option still goes through the shell's own window handler, so `http://localhost` lands back in an in-app window.

| Approach | Covers localhost | Needs the in-app browser | Where the link opens |
|---|---|---|---|
| `ui-chat.linkOpening = new-tab` | No | Yes | Shell window handler (external for `https`, in-app for `http://localhost`) |
| [dsh-pathlink](https://www.npmjs.com/package/dsh-pathlink) | No | No | Adds Ctrl+click for paths and links |
| [dsh-browser](https://github.com/CJYLZS/dsh-browser) | — | Ships one | Its own in-app browser |
| [dsh-external-links](https://github.com/Lion-Li-git/dsh-external-links) | Windows only | No | Windows WebView2 shell (DSH EAC) |
| **dsh-external-link** | Yes | No | OS default application, on every platform |

## Safety boundary

- The route accepts four schemes and nothing else; `file:`, `javascript:` and malformed values are rejected with `400`.
- Requests are checked by the DSH connection trust fence, so an unauthenticated caller cannot make the host spawn an opener.
- No configuration, no telemetry, no network access of its own — the plugin's only side effect is handing one URL to the OS.
- Same-origin links are never intercepted, so the application's own navigation cannot be broken by a click interceptor.
- Not covered: `window.open` calls that do not come from an anchor click.

## Files

```
index.js          host half — POST /external-link/open + platform opener
client.js         browser half — capture-phase anchor click interceptor
cordis.patch.yml  bundle layer — inserts the external-link row
package.json      dsh.bundle + dsh.client manifest
examples/         real verification transcripts
```

## Verification

```sh
# install into a throwaway profile and boot it — a plugin that throws on load
# makes the boot fail, which is the only real activation check
dsh plugin --profile <scratch> add github:d0ublecl1ck/dsh-external-link
dsh --profile <scratch> --dump-config | grep -A3 '== dsh-external-link'
dsh --profile <scratch>
```

In a real profile, mount the route and probe it:

```sh
dsh plugin --profile web add github:d0ublecl1ck/dsh-external-link
curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"url":"http://127.0.0.1:9/x"}' http://127.0.0.1:43129/external-link/open; echo   # 401 = mounted and fenced
```

Real transcripts (manifest / shape / install / compose / activate ladder, route probes, scheme rejection) are in [`examples/verification.md`](examples/verification.md).

## License

MIT