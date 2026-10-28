# 银壶：GitHub Pages + Supabase

本部署将网页发布至 GitHub Pages，数据库使用 Supabase PostgreSQL，图片使用私有 Storage 桶，通过 Edge Function 访问。
日历、累计计数、思维、装备状态、映相窗口和封面在访客之间共享。保留现有产品的匿名公共读写方式；知道网址的访客都可以新增、编辑、软删除共享记录。没有账号隔离或口令锁。

## 不上传本地浏览器数据

`npm run export:github` 生成新的源代码快照，只枚举代码与页面素材，不携带 Git 历史。
它排除缓存、预览数据库、浏览器资料、凭据、导出文件和旧原始大树模型。
优化树、月亮、鹿头、迪斯科球等页面模型保留。GitHub 版本不需要 Git LFS。
云端模式不打开原有思维/映相 IndexedDB，不提供旧日历导入，并使用单独的云端计数器待发送队列。
迁移文件只创建结构，数据库从空记录、零计数开始，不复制 Sites 旧数据库或本机数据库。

## 当前部署

- GitHub 仓库：https://github.com/candy-fish/YINHU
- Pages 地址：https://candy-fish.github.io/YINHU/
- Supabase：candy-fish's Org / YINHU，Free 方案，新加坡区域。
- 只上传经过排除检查的源码快照，不上传其他 GitHub 账号、不携带本地浏览器数据。

## 首次上线

1. 在目标 GitHub 账号创建仓库 `YINHU`。GitHub Free 的 Pages 需要公开仓库；付费账号可按其套餐使用私有仓库。
2. 创建一个空的 Supabase 项目，或通过已连接的 Supabase 插件选定一个空项目。不要把密码、管理密钥或访问令牌发到聊天或提交进仓库。
3. 在 Supabase SQL Editor 执行 `supabase/migrations/20261028000100_shared_workspace.sql`；部署 `supabase/functions/blackdoor/index.ts`，名称 `blackdoor`，关闭平台 JWT 校验（见 config.toml），函数自行验证请求的公开 publishable API key。匿名共享 API 由该函数提供，底层表开启 RLS，anon/authenticated 无直接表权限。服务端 secret key 只由 Supabase 注入函数运行环境。
4. 如果通过 GitHub Actions 部署后端，在仓库 Secrets 中设置 `SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD`，Variables 设置 `SUPABASE_PROJECT_REF`，手动运行 Deploy shared backend。不要在同一数据库同时用 SQL Editor 和未登记的 CLI 迁移重复创建表。
5. 仓库 Variables 设置 `BLACKDOOR_API_BASE`，值为 `https://<project-ref>.supabase.co/functions/v1/blackdoor`，只包含公开 URL。当前项目的公开地址和 publishable key 保存在 deployment.public.json，可直接构建；它们不授予底层表或私有桶访问权限。
6. 运行 `npm run export:github`。将打印的快照目录作为一个全新 Git 仓库，使用 `main` 分支上传到 YINHU。不要直接推送当前开发仓库的旧历史；其中有 GitHub 超限的原始树模型。
7. 仓库 Settings → Pages → Build and deployment → Source 选择 GitHub Actions。推送 main 后将运行 Deploy GitHub Pages。完成后使用部署任务实际返回的网址。

后续使用 CLI 推送代码需要你自己的 GitHub 登录。连接器若不能创建仓库或启用 Actions/Pages，应先在 GitHub 完成对应设置。
插件连接和账号授权完成前，只有本地代码与构建产物，不代表已经上线。

## 验证

```powershell
npm ci
npm run test:cloud
$env:BLACKDOOR_BASE_PATH = '/YINHU/'
$env:BLACKDOOR_API_BASE = 'https://<project-ref>.supabase.co/functions/v1/blackdoor'
npm run build:pages
```

没有配置数据库时可运行 `npm run build:pages -- --preview` 仅生成预览产物；预览不能当作通过线上验收。
接口 `<BLACKDOOR_API_BASE>/api/health` 应返回 `ok: true`。
上线验收使用两个浏览器分别新增记录、刷新读取、修改及验证冲突；为验收新建的记录应在结束后软删除。
关闭网络时保存必须报错并保留输入，不应声称已保存成功。

## 现有 Sites 版本

`npm run build`、`npm run build:deploy` 与原 Sites/D1/R2 路径继续保留，默认不开启 Supabase。
Supabase 和 Sites 是两套独立的线上存储；此发布不迁移其现有内容。
