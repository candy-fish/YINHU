# BlackDoor · 银壶

GitHub Pages 地址：[打开银壶](https://candy-fish.github.io/YINHU/)

新版使用 Supabase 共享数据库和图片存储，部署说明见 [DEPLOY-GITHUB.md](DEPLOY-GITHUB.md)。下文保留原 Sites 后端的开发记录。

网站由 ChatGPT Sites 托管：D1 保存共享日历及媒体元数据，R2 保存原始 GLB 和上传文件。
独立计数器的累计数字也保存在 D1，所有访客共享；刷新和跨设备访问不会重置。
当前版本公开访问、无需登录，访客可以读写共享内容。密钥锁尚未实现。
Sites 在符合条件的 ChatGPT 公测套餐内提供，仍受套餐额度及平台规则限制；不保证永久免费。

## 安装与构建

需要 Node.js >=22.13、Git，以及发布打包时的 Bash 和 tar（Windows 可使用 Git Bash）。

```powershell
npm ci
npm --prefix hosting run install:ci
npm --prefix hosting run db:generate # 仅在修改 hosting/db/schema.ts 后执行
npm run build:deploy
npm test
npm run check
```

`build:deploy` 先生成原站前端到 `dist/`，同步至 `hosting/public/`，再构建 Sites Worker。
发布包位于 `hosting/dist/`；携带轻量树模型的 6 MiB 静态分片（合计约 38 MB），原始大型 GLB 仍由 R2 提供。
轻量树保留全部三角面和原始贴图，使用 Meshopt 编码、指纹地址、校验哈希和页面预加载；
浏览器最多同时下载 3 片，分片可独立缓存，加载失败时回退至原始树模型。
`npm run optimize:tree` 可从原始 `models/tree.glb` 重新生成，`npm run verify:tree` 校验三角面、贴图及解码兼容性。
`npm run build` 生成同时带原始本地模型和轻量树的独立静态预览，
共享 API 需要下面的 Worker 预览。`hosting/public/` 在主仓库忽略，但会作为 Sites 源仓库的一部分发布。

计数器及入口的本地联调可运行 `npm run build` 后执行 `npm run preview`，
打开 `http://127.0.0.1:4174/transition/transition.html`。
这个预览使用真实的本地 Workers/D1 模拟器，并自动应用尚未执行的 SQL 迁移，
数据保存在忽略的 `.cache/shared-preview/`，重启预览后仍保留，与线上数据库独立。

Mind 本地预览为 `http://127.0.0.1:4174/transition/mind/mind.html`。
点击树旁赐福进入思维阁，新增思维后单独装备，返回树可悬停金叶查看名称。
坐标仅通过“从树上取点”填入，表单只读展示固定于树模型的局部坐标；拖动只旋转树，不会选点或进入思维阁。
思维、图片及装备状态保存在当前浏览器的 IndexedDB（`blackdoor-mind`），刷新后保留，
与服务端共享数据独立；不同浏览器、地址或端口不共享这批思维数据。
发布只同步代码和页面素材，不携带当前浏览器的思维记录、上传图片、本地 D1/R2 测试数据或运行凭据。
树旁流光、丝状烟雾、贴合树皮的金色脉络及空气中的悬浮金粉共用浅金色光调；思维阁打开时暂停场景动画。

## 本地数据库与预览

“映相”独立草稿运行 `npm run preview:images`，打开 `http://127.0.0.1:4175/transition/images/images.html`。
映相页直接预览源文件；修改全息渲染器后执行 `npm run build:images-companions`。可通过 `/transition/images/images.html` 直接访问，transition 左下角的银色动态万花筒也可进入映相，尺寸与右下角日历一致。
点击万花筒后，每次仅两枚碎片前后追游，抵达后合成一条线；横线从下方汇入，竖线从上方汇入，交替形成 12 级黄绿色光阶。台阶与正向门框统一使用映相光路的粗细，以无光晕的纯色线条绘制，门中闪过实心鹿眼后直接切到黑屏进入映相。过场约 13 秒，可按 Esc 取消；减少动态效果时只保留短黑场，浏览器返回后可重播。
可编辑的 Blender 工程与建模说明位于 `art/images-companions/`，页面加载本地骨架模型，以菲涅尔、鳞片贴图和循环字符贴图叠加全息效果。
悬停光路的左、右两侧可沿时间轴漫游，也支持键盘、滚轮、触摸滑动及右下角进度条拖动。
鹿保持原来的视觉大小，随时间轴以四拍步态行走、转向，停下后落稳站立，稍后张望、低头吃草；缩小后的鱼摆尾随行，静止时绕鹿游动。
进度条右侧的双层方框按钮可返回 transition；返回页使用现有 `dist/` 构建，首次预览前运行 `npm run build`，需要共享数据时同时运行 `npm run preview`（4174 端口 API 由映相预览转发）。
点击标题旁的方框加号进入绘图模式，在光路上方拖出窗口，松开后设置名称、日期和封面；窗口保留自由绘制的宽高和上下位置，不再提供三档尺寸，编辑时可重新绘制。Esc 或“取消绘制”可退出，绘图前可拖动右下角进度条选择画面范围。
窗口按日期正序排列，向右越近。点击可查看占位详情、编辑或移除，照片墙暂未实现。旧版窗口尺寸和封面仍可读取。
没有记录时展示空白时间轴，不预置示例窗口。窗口及封面只保存在当前浏览器、当前来源的 IndexedDB（`blackdoor-images`），不上传、不跨设备同步。
改变预览端口或清除浏览器网站数据会影响可见数据，照片原件请另行保留。

完成部署构建后，在 `hosting` 目录对每个尚未应用的 SQL 文件执行一次：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_premium_mantis.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 127.0.0.1
```

本地和线上数据库互相独立。数据库结构通过 Drizzle 迁移管理，已经发布的迁移不改写；
后续结构变更生成新迁移，由 Sites 发布流程应用。不要在请求期间创建表。
Windows 下重新构建前先停止运行中的构建预览，避免它锁住 `hosting/dist/`。

模型需放入本地 R2 的 `app-assets/models/` 前缀，可通过下面的初始化流程导入；
本地预览临时凭据放在不跟踪的 `hosting/.dev.vars`，完成后移除并重启。

## 首次发布与模型初始化

`hosting/.openai/hosting.json` 保存唯一 Sites 项目 ID，D1 绑定为 `DB`，R2 绑定为 `BUCKET`。
复用该项目，不重复创建。通过 Sites 插件保存源代码和构建归档，先部署为私有。

1. 仅在私有初始化阶段，将 `hosting/lib/model-setup.mjs` 的 `modelSetupEnabled` 设为 `true`；
   在 Sites 运行环境设置一次性秘密 `MODEL_SETUP_TOKEN`，构建并发布该私有版本。
2. 使用 `scripts/upload-models.mjs`，通过 stdin 传入 JSON：`origin`、`token`、私有站点的
   `platformToken`，以及可选的绝对 `modelDirectory`。不得把凭据写入源代码、日志或命令参数。
3. 脚本按 8 MiB 分片上传四个原 GLB，逐个验证下载 SHA-256。模型地址为 `/models/<filename>`。
4. 将 `modelSetupEnabled` 改回 `false`，删除 Sites 的 `MODEL_SETUP_TOKEN`，重新构建、同步源代码并发布。
   使用旧凭据验证初始化仍返回 404；不能只依赖环境变量删除或重复部署旧版本来关闭入口。
5. 验证页面、共享 API 和模型，然后按本项目约定改为公开访问。交付成功部署返回的网址。

模型初始化接口位于 `/api/setup/models/<filename>`，只接受预定义模型名并验证一次性凭据。
普通媒体只写入服务端分配的 `user-media/` 路径，不能覆盖模型。原始 R2 GLB 保持不变，轻量树作为页面静态素材发布。
后续发布沿用 Sites 官方源同步、构建打包、保存版本、部署流程，避免提交凭据及本地运行状态。
发布前在主仓库执行 `node scripts/sites-source.mjs open`，再从 `hosting` 运行 Sites 官方工作流；
发布结束后执行 `node scripts/sites-source.mjs park`。独立 Sites 源仓库的 Git 元数据保存在忽略的
`hosting/.sites-runtime/source-git/`，历史不会删除；这样主仓库可以正常跟踪托管源文件，而不会误添加为子模块。
Windows 使用 Git Bash 打包时，给官方工作流进程设置 `TAR_OPTIONS=--force-local`，
以免 tar 把 `D:` 盘符误判为远程主机；Bash 所在目录必须加入该进程的 PATH。

## 共享 API

- `GET /api/counter` 返回全站累计数字，`value` 为十进制字符串，避免大数字精度丢失。
- `POST /api/counter/increments` 接收唯一 UUID `id`，原子加一；重试相同 `id` 不重复计数。
  没有清零和覆盖累计值的接口。前端每 3 秒同步一次，在页面恢复可见时立即同步；
  断网点击存入浏览器待发送队列，连接恢复后以同一操作编号重发。
- `GET /api/calendar?includeDeleted=true` 返回 `dayNotes`、`anniversaries`、`journals`；默认不含软删除记录。
- `/api/calendar/day-notes`、`anniversaries`、`journals`：POST 创建，`/<id>` PATCH 编辑、DELETE 软删除，`/<id>/restore` POST 恢复。
- 更新、删除、恢复必须带 `version`；服务端原子增加版本，冲突返回 409、`VERSION_CONFLICT` 和 `remote`。
- `POST /api/media` 创建元数据，`PUT /api/media/<id>/content` 流式上传，单文件最多 50 MiB。
  上传状态为 `pending`、`uploading`、`ready` 或 `failed`，失败后可重试同一个 ID。
- `GET /api/media/<id>/url` 返回同源下载路径；content 支持 GET、HEAD、Range。
  DELETE `/<id>` 及 POST `/<id>/restore` 只改变元数据，不永久删除文件。
- `BlackDoor.media.getTemporaryUrl()` 和 `storage.signedUrl()` 保留兼容名称，但本版本不生成有期限的签名 URL。
  存储适配器使用媒体记录 ID，而非允许客户端选择任意对象路径。

没有账号表或个人身份审计；所有记录属于一个固定共享空间，操作标记为 `shared`。
旧日历本地数据导入仍需用户在页面中确认，保留原本地内容并避免重复导入。

`npm test` 使用真实本地 Workers、D1 和 R2 模拟器验证版本冲突、校验、软删除、上传失败、模型分片、范围读取及旧数据导入。
`node scripts/verify-site.mjs` 通过隐藏的 stdin 接收 `origin`（私有验收时可加 `platformToken`），
检查页面、线上 D1、四个 GLB 的大小/范围读取/缓存及初始化关闭状态；公开验收不传登录凭据。
Windows 沙箱若阻止回环连接或依赖安装，应在允许本地连接的环境运行，不应跳过这些测试。

## GitHub Pages 与共享数据库

GitHub Pages + Supabase 的部署、数据排除规则与发布步骤见 [DEPLOY-GITHUB.md](DEPLOY-GITHUB.md)。该模式的新记录通过服务器共享，不导入当前浏览器记录。原 Sites 版本与本地预览保持独立。
