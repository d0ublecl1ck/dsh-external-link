# Verification

Everything below was run against DSH Desktop 0.1.7-rc.2 (macOS, arm64, profile `web`) on 2026-09-28. Nothing here is illustrative.

## 1. Bundle ladder (`verify-dsh-plugin.mjs`)

```console
$ DSH_BIN=<dsh> DSH_HOME=<dsh home> node verify-dsh-plugin.mjs --plugin-dir <repo>
PASS G1 manifest - name=dsh-external-link patch=./cordis.patch.yml
PASS G2 shape - named apply export, no default export
PASS G3 install - added to profile dsh-verify-65e0b8
PASS G4 compose - layer present; 1 inserted row(s) composed
PASS G5 activate - profile booted and every plugin activated (exit 0)

verified: <repo>
```

G5 boots a real profile; a plugin that throws in `apply` fails this gate. The host half
therefore declares no hard `inject` — it attaches the route with `ctx.inject(["webServer",
"connection"], …)` so a profile without the web transport stays a no-op instead of parking in
PENDING. Before that change G5 failed with:

```console
FAIL G5 activate - profile exited with code 1
  Plugins waiting for services (1):
  external-link (required)  webServer, connection
```

## 2. Install into the running profile

```console
$ dsh plugin --profile web add /path/to/dsh-external-link
dsh-desktop pnpm runner: excluded 4 generation projection(s) from pnpm
dependencies:
+ dsh-external-link link:/path/to/dsh-external-link
Done in 305ms using pnpm v10.34.5
dsh-desktop pnpm runner: restored 4 generation projection(s) after pnpm
```

Composition, from `dsh --profile web --dump-config`:

```yaml
# == dsh-external-link
- id: external-link
  name: dsh-external-link
  __dshPluginOwner:
    packageName: dsh-external-link
    version: 0.1.0
```

## 3. Route probes

The host row mounts on its own; only a page reload is needed for the browser half.
Route presence is probed without credentials:

```console
$ curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' \
    -d '{"url":"http://127.0.0.1:9/x"}' http://127.0.0.1:43129/external-link/open
401                                  # mounted, rejected by the connection trust fence
$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:43129/definitely-not-a-route
404                                  # control: an absent route really is 404
```

With a valid browser-session cookie:

```console
file:// rejected      -> 400 {"code":"bad-request","message":"url must be an http, https, mailto or tel URL"}
not-a-url rejected    -> 400 {"code":"bad-request","message":"url must be an http, https, mailto or tel URL"}
javascript: rejected  -> 400 {"code":"bad-request","message":"url must be an http, https, mailto or tel URL"}
https accepted        -> 200 {"ok":true}
```

The `https` call opened a tab in the OS default browser.

## 4. Browser half is served

```console
$ curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
    'http://127.0.0.1:43129/plugins/??dsh-external-link/client.js&rev=<rev>'
200 text/javascript; charset=utf-8
```

and the module appears in the page roster:

```json
{ "id": "dsh-external-link", "url": "plugins/??dsh-external-link/client.js&rev=<rev>", "immediately": true }
```

## Reproduce

```sh
# 1. install into a throwaway profile and boot it; a plugin that throws on load
#    makes the boot fail, so a clean exit is the activation check
dsh plugin --profile <scratch> add /path/to/dsh-external-link
dsh --profile <scratch> --dump-config | grep -A3 '== dsh-external-link'
dsh --profile <scratch>

# 2. install into your own profile
dsh plugin --profile web add /path/to/dsh-external-link

# 3. probe the route, then reload the DSH window and click an off-origin link
curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"url":"http://127.0.0.1:9/x"}' http://127.0.0.1:43129/external-link/open; echo
```
