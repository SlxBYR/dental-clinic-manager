# Tauri 移动端与桌面端重构步骤

## 目标

将当前 Electron + Vite + React 牙科诊所管理系统重构为 Tauri 2 架构，使同一套前端业务代码可运行在 macOS、Windows、Linux、Android 和 iOS。重构重点是替换 Electron 主进程、preload IPC、Node SQLite 存储、桌面打包脚本，并补齐移动端布局、权限、数据存储和发布流程。

## 当前项目现状

- 前端：Vite + React + TypeScript + Tailwind，入口为 `index.tsx`、`App.tsx`。
- 桌面容器：Electron，入口为 `electron-main.js`，通过 `preload.cjs` 暴露 `window.electronSqliteStore`。
- 本地数据：`clinicService` 优先使用 `ElectronSqliteStore`，失败后回退到 `localStorage`。
- SQLite：当前由 Electron 主进程使用 Node `node:sqlite` 初始化和查询。
- 打包：`electron-builder`、`build-release.sh`、`electron-builder.fresh.cjs`、`build/installer.nsh`。
- RAG：当前在渲染层实现本地关键词检索，外部知识库通过 HTTP JSON 拉取。

## 迁移原则

- 先保留现有 React 页面和业务服务，优先替换宿主层。
- 保持 `KeyValueStore` 抽象，新增 `TauriSqliteStore`，不要让业务代码直接依赖 Tauri API。
- 移动端先做单机本地数据可用，再做云同步、多设备冲突处理。
- 医疗数据默认本地加密保存；外部 AI、RAG 和同步都必须保持显式授权。
- 每个阶段都保持桌面端可运行，避免一次性替换 Electron 后失去验证路径。

## 阶段 1：建立 Tauri 基础工程

1. 安装 Tauri 2 所需环境：Rust、Node.js、平台 SDK。移动端需要额外安装 Android Studio/SDK/NDK；iOS 需要 macOS + Xcode。
2. 在现有 Vite 项目内初始化 Tauri：

```bash
npm install -D @tauri-apps/cli
npm run tauri init
```

3. 新增 `src-tauri/`，保留现有 `src` 结构不变。本项目目前源码在根目录，可先继续使用根目录前端入口，后续再选择是否整理到 `src/`。
4. 配置 `src-tauri/tauri.conf.json`：

```json
{
  "productName": "DentalSystem",
  "identifier": "com.dental.clinic",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:3000",
    "frontendDist": "../dist"
  }
}
```

5. 在 `package.json` 增加脚本：

```json
{
  "scripts": {
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "tauri:android:dev": "tauri android dev",
    "tauri:android:build": "tauri android build",
    "tauri:ios:dev": "tauri ios dev",
    "tauri:ios:build": "tauri ios build"
  }
}
```

6. 第一阶段验收：`npm run tauri:dev` 能打开桌面窗口，React 页面正常渲染，但存储可暂时回退到 `localStorage`。

## 阶段 2：替换 Electron IPC

当前 Electron 暴露的接口：

```ts
window.electronSqliteStore.get(key)
window.electronSqliteStore.set(key, value)
window.electronSqliteStore.status()
window.electronSqliteStore.listPatients(query)
```

Tauri 应改为前端调用 Rust command：

```ts
import { invoke } from '@tauri-apps/api/core';

await invoke('sqlite_get', { key });
await invoke('sqlite_set', { key, value });
await invoke('sqlite_status');
await invoke('list_patients', { query });
```

重构步骤：

1. 新增 `services/storage/tauriSqliteStore.ts`，实现同一个 `KeyValueStore` 接口。
2. 将 `services/storage/types.ts` 中的 `ElectronSqliteStoreBridge` 泛化为平台存储 bridge 类型，减少 Electron 命名。
3. 在 `clinicService.initialize()` 中按优先级选择：

```text
TauriSqliteStore -> ElectronSqliteStore -> LocalStorageStore
```

4. Electron 仍保留一段时间，方便对比验证；Tauri 桌面端通过 `window.__TAURI_INTERNALS__` 或封装函数判断可用。
5. 第二阶段验收：Tauri 桌面端能读取、写入、重启后保留数据；Electron 旧版本仍不受影响。

## 阶段 3：迁移 SQLite 和加密逻辑到 Rust

当前 `electron-main.js` 承担了 SQLite schema、迁移、加密、患者列表查询。Tauri 中应移动到 `src-tauri/src/`。

建议 Rust 模块拆分：

```text
src-tauri/src/
  main.rs
  commands.rs
  db/
    mod.rs
    schema.rs
    kv_store.rs
    patient_query.rs
    migrations.rs
  crypto/
    mod.rs
  app_state.rs
```

迁移步骤：

1. 把 `electron-main.js` 中的 SQL schema 迁移到 Rust `schema.rs`。
2. 用 `tauri-plugin-sql` 或 Rust 原生 `rusqlite/sqlx` 实现 SQLite 访问。
3. 将 `kv_store`、`settings`、`patients`、`treatments`、`appointments` 相关读写做成 Rust 函数。
4. 将 `safeStorage` 替换为跨平台策略：
   - 桌面端：优先系统密钥链或 Tauri Stronghold。
   - 移动端：优先平台安全存储；如使用 Stronghold，要设计密码/设备密钥初始化流程。
5. 数据库路径统一使用 Tauri app data 目录，不再使用 Electron `app.getPath('userData')`。
6. 第三阶段验收：旧 Electron SQLite 数据可导入或自动迁移；Tauri 新库能完整保存患者、处置、预约、设置。

## 阶段 4：移动端 UI 适配

当前 UI 是桌面管理后台布局，移动端不能只靠 WebView 运行，需要调整交互。

重点改造：

1. 侧边栏改为响应式导航：
   - 桌面：保留左侧 sidebar。
   - 手机：底部 tab 或抽屉菜单。
   - 平板：可使用窄 sidebar。
2. 患者列表和详情改为主从分离：
   - 桌面：列表 + 详情并行。
   - 手机：列表页跳转详情页，详情页顶部返回。
3. 表格、统计卡片、RAG 结果改为单列卡片流。
4. 所有弹窗改为移动端全屏 sheet 或页面级表单，避免小屏上输入框被键盘遮挡。
5. 牙位选择器需要单独做触控优化：
   - 增大点击热区。
   - 支持双指缩放或分区放大。
   - 避免 hover-only 状态。
6. 第四阶段验收：iPhone SE 尺寸、普通 Android 手机、iPad/平板、桌面宽屏都没有遮挡、横向溢出和不可点击控件。

## 阶段 5：平台能力替换

| 当前能力 | Electron 实现 | Tauri 替代方案 |
| --- | --- | --- |
| 主窗口 | `BrowserWindow` | `tauri.conf.json` window 配置 |
| IPC | `ipcMain` + `ipcRenderer` | Tauri `invoke` command |
| SQLite | Node `node:sqlite` | `tauri-plugin-sql` 或 Rust SQLite crate |
| 安全存储 | Electron `safeStorage` | Stronghold / 平台密钥链 |
| 单实例 | `app.requestSingleInstanceLock()` | `tauri-plugin-single-instance`，仅桌面 |
| HTTP | 浏览器 `fetch` | 前端 `fetch` 或 Tauri HTTP plugin |
| 文件导入 | `<input type="file">` | 桌面可用 dialog plugin；移动端优先系统文件选择能力 |
| 打包 | `electron-builder` | `tauri build`、Android Studio、Xcode |

移动端注意事项：

- 不要依赖 Node API、`fs`、`path`、`Buffer`、Electron preload。
- 文件访问必须通过 Tauri plugin 或移动系统授权。
- 后台任务、自动同步、通知在 iOS/Android 上权限和生命周期不同，需要单独设计。
- 本地 AI 或向量库如果体积大，应拆成可选能力，避免移动端包体过大。

## 阶段 6：RAG 和 AI 的跨平台处理

当前 RAG 检索在前端内存中完成，能直接在 Tauri WebView 中运行。需要处理的是持久化、文件导入和隐私。

建议：

1. 第一版保持现有关键词检索，不在移动端引入本地向量数据库。
2. 将 `ragKnowledgeEntries` 从 `localStorage` 迁移到统一存储层，避免移动端清理 WebView 数据导致知识库丢失。
3. 外部 RAG 数据源继续使用 HTTP JSON adapter，但需要：
   - 配置 CORS 或改由 Tauri HTTP plugin 请求。
   - Token 存到安全存储，不要留在 `localStorage`。
   - 同步失败不能清空本地 RAG 条目。
4. AI 设置中的 API Key 迁移到安全存储。
5. 医疗回答继续保持“有引用才回答”的策略，移动端同样显示来源。

## 阶段 7：发布和安装包

桌面端：

1. 用 Tauri 替代 `electron-builder`。
2. 迁移图标资源到 Tauri 要求的 `src-tauri/icons/`。
3. Windows 安装器从 NSIS 脚本迁移到 Tauri bundler 支持的 MSI/NSIS 能力，确认旧 `build/installer.nsh` 中的卸载逻辑是否仍需要保留。
4. macOS 需要配置签名、公证、DMG。
5. Linux 如需发布，补充 AppImage、deb 或 rpm。

移动端：

1. Android：生成 Android 项目，配置包名、图标、权限、签名 keystore，然后构建 APK/AAB。
2. iOS：生成 Xcode 项目，配置 Bundle ID、Signing Team、权限说明、App Store 隐私声明。
3. 医疗类应用发布前需要明确数据处理、隐私政策、是否属于医疗器械软件或诊疗辅助软件。

## 阶段 8：测试计划

基础测试：

- `npm run build`
- `npm run tauri:dev`
- `npm run tauri:build`
- Android 模拟器启动和真机安装
- iOS Simulator 启动和真机安装

数据测试：

- Electron 旧数据导出后能导入 Tauri。
- Tauri 新建数据重启后仍存在。
- 患者列表搜索、拼音搜索、处置记录、预约记录完整。
- RAG 手动条目、文件条目、外部数据源同步都可用。

移动端测试：

- 小屏手机无横向滚动。
- 输入法弹出时表单仍可提交。
- 牙位选择器可触控操作。
- 数据库写入失败有错误提示，不静默丢数据。

安全测试：

- API Key 和医疗数据不进入明文 `localStorage`。
- 外部 AI 默认关闭。
- 外部 RAG Token 不出现在日志中。
- 数据导出文件需要用户主动触发。

## 建议执行顺序

| 阶段 | 目标 | 风险 |
| --- | --- | --- |
| 1 | Tauri 桌面空壳跑起来 | 低 |
| 2 | 前端存储 bridge 抽象 | 中 |
| 3 | SQLite 和加密迁移到 Rust | 高 |
| 4 | 移动端布局适配 | 中 |
| 5 | 平台插件替换 | 中 |
| 6 | RAG/AI 持久化和安全存储 | 中 |
| 7 | 桌面和移动发布 | 高 |
| 8 | 全平台测试和回归 | 高 |

## 不建议的做法

- 不建议直接在移动端继续依赖 Electron 或 Node API。
- 不建议把 SQLite 数据库账号、AI Key、RAG Token 放到前端源码或 `localStorage`。
- 不建议一次性删除 Electron；应保留到 Tauri 数据链路稳定后再清理。
- 不建议第一版移动端就做复杂离线向量库；先保证患者数据可靠、安全、可备份。

## 官方参考

- Tauri 2 快速开始：https://v2.tauri.app/start/
- Tauri 前置环境和移动端依赖：https://v2.tauri.app/start/prerequisites/
- Tauri 前端调用 Rust：https://v2.tauri.app/develop/calling-rust/
- Tauri SQL plugin：https://v2.tauri.app/plugin/sql/
- Tauri Store plugin：https://v2.tauri.app/plugin/store/
- Tauri Stronghold plugin：https://v2.tauri.app/plugin/stronghold/
- Tauri 发布文档：https://v2.tauri.app/distribute/
