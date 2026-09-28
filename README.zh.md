# dsh-external-link

> 别让链接在 DSH 里再开一个内置窗口。DSH 网页界面里点超链接，交给操作系统的默认程序打开——包括 `http://localhost`，Electron 壳本来会把它当成自家页面。

`dsh-plugin` · MIT · macOS / Windows / Linux · 零配置

## 什么时候需要它

- 做前端时点聊天里的 `http://localhost:5173`，DSH Desktop 弹一个光秃秃的内置窗口，而不是你的浏览器。
- 点一条文档链接，希望它开在你真正在用的浏览器里——带着你的标签页、扩展和登录态。
- 点 `mailto:` / `tel:` 链接，希望交给系统处理，而不是毫无反应。

## 它会做什么

| 位置 | 行为 |
|---|---|
| 点击 `http` / `https` / `mailto` / `tel` 链接 | 交给系统默认程序（macOS `open`、Windows `start`、Linux `xdg-open`） |
| 点击同源链接 | 放行——应用内跳转照常 |
| 其它协议（`file:`、`javascript:`、`data:`、相对路径） | 放行 |
| 应用代码里的 `window.open`（非锚点点击） | 不拦截 |

## 安装

```sh
dsh plugin --profile web add github:d0ublecl1ck/dsh-external-link
```

刷新 DSH 窗口（或重启 DSH）。宿主半注册 `POST /external-link/open`，浏览器半在页面加载完成后立即开始拦截点击。

卸载：

```sh
dsh plugin --profile web remove dsh-external-link
```

## 工作原理

```
锚点点击
  → 浏览器半的捕获阶段监听
  → POST /external-link/open          （仅非同源的 http/https/mailto/tel）
  → connection 信任栅栏                （未认证调用返回 401）
  → 平台打开器                         （open / start / xdg-open）
  → 你的默认浏览器
```

点击不再走到 Electron 壳的窗口处理器——这正是 `http://localhost` 不再进内置窗口的原因。

## 为什么不直接用内置设置？

DSH 自带一个偏好项：设置 → 通用 → **网页链接默认打开方式**（`ui-chat.linkOpening`），可选「应用内侧边栏」和「默认浏览器」。它只在加载了内置浏览器侧边栏插件（`@deepseek-ai/dsh-client-ui-sidebar-browser`）时才显示，而「默认浏览器」这一项仍然走壳自己的窗口处理器，所以 `http://localhost` 还是回到内置窗口。

| 方案 | 覆盖 localhost | 需要内置浏览器 | 链接开在哪 |
|---|---|---|---|
| `ui-chat.linkOpening = new-tab` | 否 | 是 | 壳的窗口处理器（`https` 走外部，`http://localhost` 走内置） |
| [dsh-pathlink](https://www.npmjs.com/package/dsh-pathlink) | 否 | 否 | 给路径与链接加 Ctrl+点击 |
| [dsh-browser](https://github.com/CJYLZS/dsh-browser) | — | 自带一个 | 它自己的内置浏览器 |
| [dsh-external-links](https://github.com/Lion-Li-git/dsh-external-links) | 仅 Windows | 否 | Windows WebView2 壳（DSH EAC） |
| **dsh-external-link** | 是 | 否 | 各平台的系统默认程序 |

## 安全边界

- 路由只接受四种协议；`file:`、`javascript:`、畸形值一律 `400`。
- 请求经 DSH connection 信任栅栏校验，未认证调用无法让宿主启动打开器。
- 无配置、无遥测、自身不发起网络请求——唯一副作用是把一个 URL 交给操作系统。
- 永不放行同源链接，点击拦截不会破坏应用自身的跳转。
- 不覆盖：非锚点点击产生的 `window.open`。

## 文件结构

```
index.js          宿主半 —— POST /external-link/open + 平台打开器
client.js         浏览器半 —— 捕获阶段锚点点击拦截
cordis.patch.yml  bundle 层 —— 插入 external-link row
package.json      dsh.bundle + dsh.client 清单
examples/         真实验证记录
```

## 验证

```sh
# 装进一次性 profile 并启动——插件加载时抛错会让启动失败，这是唯一的真实激活校验
dsh plugin --profile <scratch> add github:d0ublecl1ck/dsh-external-link
dsh --profile <scratch> --dump-config | grep -A3 '== dsh-external-link'
dsh --profile <scratch>
```

然后在真实 profile 里挂载路由并探针：

```sh
dsh plugin --profile web add github:d0ublecl1ck/dsh-external-link
curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"url":"http://127.0.0.1:9/x"}' http://127.0.0.1:43129/external-link/open; echo   # 401 = 已挂载且被栅栏拦下
```

真实记录（manifest / shape / install / compose / activate 五道门、路由探针、协议拒绝）见 [`examples/verification.md`](examples/verification.md)。

## License

MIT