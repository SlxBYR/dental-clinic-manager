# 明智口腔诊所管理系统

本项目是一个面向小型牙科诊所的本地桌面管理工具，用于管理患者档案、处置记录、预约日程、处置项目目录、本地备份、云端同步和应用更新检测。

当前版本：`v1.1.8`

数据版本：`5`

## 技术栈

| 类别 | 方案 |
| --- | --- |
| 前端 | React 19、TypeScript |
| 构建 | Vite、Tailwind CSS、PostCSS |
| 桌面端 | Electron |
| 图标 | lucide-react |
| 中文搜索 | tiny-pinyin |
| 数据存储 | localStorage |
| 打包 | electron-builder |

## 运行方式

```bash
cd "/Users/azxdemo/Documents/New project/dental-clinic-manager"
npm install
npm run dev -- --host 127.0.0.1 --port 3000
```

开发预览地址：

```text
http://127.0.0.1:3000/
```

构建前端：

```bash
npm run build
```

启动 Electron 开发环境：

```bash
npm run electron
```

构建桌面安装包：

```bash
npm run electron:build
```

项目内也保留了发布脚本：

```bash
./build-release.sh
```

## 目录结构

```text
dental-clinic-manager/
  App.tsx                         应用入口、侧边栏、页面路由
  appTypes.ts                     顶层页面类型
  constants.ts                    默认目录、存储 key、版本号、Release 接口
  types.ts                        患者、处置、预约、备份和同步类型
  electron-main.js                Electron 主进程
  pages/                          总览、患者列表、患者详情、预约管理
  modals/                         新增/编辑患者、处置、预约、设置、确认弹窗
  components/                     通用按钮、侧边栏入口
  features/contribution/          首页处置贡献墙数据聚合
  features/tooth/                 牙位图与牙位选择逻辑
  services/clinicService.ts       本地数据读写和业务服务
  services/dataMigrations.ts      数据迁移、预约 ID 生成、导入校验
  utils/                          日期和状态样式工具
  public/                         应用图标、牙位图等静态资源
  scripts/                        图标生成脚本
  push-update.sh                  只推送源码相关内容的 GitHub 脚本
```

## 当前功能

### 总览

- 展示总患者数和今日预约数。
- 展示今日预约列表。
- 今日无预约时提供“新建预约”入口。
- 点击预约行进入对应患者详情。
- 可在列表中切换预约状态，已取消预约不可继续切换。
- 展示近 26 周处置完成贡献墙，处置越多当天格子颜色越深。

### 患者管理

- 新增患者档案。
- 按姓名、电话、拼音或拼音首字母搜索。
- 新增患者时展示相似姓名，点击可直接进入已有患者档案。
- 同一电话号码可以对应多个独立患者，并归入同号码患者组。
- 患者列表可标记同号码组人数。
- 支持修改姓名、电话、性别和年龄。
- 删除患者时，同步删除明确关联该患者 `patientId` 的全局预约，不误删同号码其他患者预约。

### 处置记录

- 为患者添加处置记录。
- 处置项目来自设置中的项目目录。
- 新增和编辑处置时，默认价格跟随当前目录价格变化，仍允许手动改价。
- 牙位可以为空。
- 牙位选择使用图片底图和浮动按钮，支持恒牙、乳牙、全口、上颌、下颌。
- 同一颗牙的恒牙和乳牙按钮互斥选择。
- “全口”“上颌”“下颌”只选择恒牙。
- 支持编辑和删除处置记录。
- 编辑处置记录时自动生成修改日志，只记录实际发生变化的字段。
- “修改记录”入口以弹窗方式展示修改时间、字段、修改前和修改后值。

### 预约管理

- 每条预约都有独立唯一 `id`。
- 支持新建、编辑、删除和取消预约。
- 取消预约会保留记录，状态变为“已取消”。
- 新建和编辑时进行冲突检查。
- 当前数据模型没有医生或资源字段，因此冲突检查范围是同一日期、同一时间段内不能有另一条未取消预约。
- 修改预约时会排除自身 `id`，避免自己和自己冲突。
- 预约状态包括：`pending` 待诊、`completed` 完成、`cancelled` 已取消。

### 设置与数据

- 修改诊所名称。
- 导出处置、患者、预约、目录和设置数据为 JSON。
- 导入 JSON 前会执行迁移和结构校验。
- 导入成功前会把本机旧数据保存到预导入备份 key。
- 维护处置项目目录，包括分类和项目的新增、编辑、删除。
- 配置备份接口，并通过 `POST` 发送完整备份数据。
- 配置云端同步接口，通过同步 Key 执行拉取和上传。
- 配置 GitHub Release 接口，支持打开设置时自动检测和手动检测更新。

## 数据存储

应用当前使用 `localStorage` 持久化数据。

| Key | 用途 |
| --- | --- |
| `dental_clinic_data_v2` | 主业务数据 |
| `dental_clinic_backup_settings_v1` | 服务器备份配置 |
| `dental_clinic_cloud_sync_settings_v1` | 云端同步配置 |
| `dental_clinic_release_settings_v1` | Release 更新检测配置 |
| `dental_clinic_data_v2_pre_import_backup` | 导入前本机备份 |

核心数据模型在 `types.ts`：

- `ClinicData`：全量数据容器，包含 `dataVersion`、患者表、预约表和处置目录。
- `Patient`：患者档案，使用独立 `id`，同号码通过 `patientGroupId` 分组。
- `TreatmentRecord`：处置记录，包含项目、价格、牙位、备注和 `changeLogs`。
- `TreatmentChangeLog`：处置修改日志，包含修改时间、字段、修改前后值。
- `GlobalAppointment`：全局预约记录，使用独立 `id` 并通过 `patientId` 关联患者。

## 数据迁移与导入校验

迁移逻辑集中在 `services/dataMigrations.ts`，当前目标数据版本为 `5`。

迁移会处理：

- 旧患者数据补齐独立患者 `id`。
- 同号码患者补齐 `patientGroupId`。
- 旧预约补齐独立 `id`。
- 标准化预约状态为 `pending`、`completed` 或 `cancelled`。
- 将全局预约同步为患者预约快照。
- 旧处置记录补齐 `changeLogs: []`。
- 旧处置修改日志补齐必要字段。
- 缺失目录时补默认处置目录。

导入校验会检查：

- 患者列表是否为对象结构。
- 预约列表是否按日期分组。
- 患者、处置、预约必要字段是否存在。
- 字段类型是否合理。
- 预约 `id` 是否缺失或重复。
- 处置修改日志结构和日志 `id` 是否有效。
- 预约关联的患者是否存在。

## 接口约定

### 服务器备份

设置中填写备份接口后，应用会发送：

```http
POST <backup endpoint>
Content-Type: application/json
Authorization: Bearer <token>
```

请求体：

```json
{
  "app": "DentalClinicManager",
  "generatedAt": "2026-06-29T00:00:00.000Z",
  "clinicName": "DentalClinic",
  "version": 5,
  "data": {}
}
```

`data` 为完整 `ClinicData`。

### 云端同步

云端同步接口由服务器根据 `key` 映射到具体仓库或对象路径。前端只负责发起约定请求。

拉取：

```json
{
  "app": "DentalClinicManager",
  "action": "pull",
  "key": "<sync key>"
}
```

上传：

```json
{
  "app": "DentalClinicManager",
  "action": "push",
  "key": "<sync key>",
  "payload": {}
}
```

服务器返回拉取数据时，可以直接返回 `ClinicData`，也可以返回 `{ "data": ClinicData }` 或 `{ "payload": { "data": ClinicData } }`。

### GitHub Release 检测

默认接口：

```text
https://api.github.com/repos/SlxBYR/dental-clinic-manager/releases/latest
```

应用读取 `tag_name` 或 `name` 作为最新版本号，并与 `APP_VERSION` 比较。

## GitHub 提交流程

普通提交：

```bash
git status --short
git add <本次相关文件>
git commit -m "feat: describe change"
git push origin main
```

项目提供了 `push-update.sh`：

```bash
./push-update.sh "feat: describe change"
```

脚本只暂存源码相关路径，不包含 `release/`、`dist/`、`node_modules/` 等构建产物。

## 版本规则

- 应用展示版本来自 `constants.ts` 的 `APP_VERSION`。
- npm 包版本来自 `package.json` 和 `package-lock.json`。
- 发布脚本输出文件名在 `build-release.sh`。
- 数据结构发生变化时，更新 `DATA_VERSION` 并补充迁移逻辑。
- 仅 UI 或文档变化时，通常只更新 `APP_VERSION` 和 npm 包版本。

本项目当前约定：每次更新文件后都递增应用版本号。

## 可行性方案

这一部分基于旧 README 中的“未来更新”条目，并结合当前源码状态重新评估。

### 已完成或基本完成

| 方向 | 当前状态 | 说明 |
| --- | --- | --- |
| 拆分 `App.tsx` | 已完成 | 页面、弹窗、功能模块已拆到 `pages/`、`modals/`、`features/`。 |
| 预约独立 `id` | 已完成 | 新旧预约均有 `id`，后续操作基于 `id`。 |
| 预约修改、删除、取消 | 已完成 | `ScheduleManager` 和 `clinicService` 已支持。 |
| 预约冲突检查 | 部分完成 | 当前检查同日期同时间；医生/资源维度尚未建模。 |
| 删除患者同步清理预约 | 已完成 | 按 `patientId` 删除，不按电话误删同号码患者。 |
| 同号码患者分组 | 已完成 | 通过 `patientGroupId` 兼容家属共用电话。 |
| 导入校验与迁移 | 已完成 | 已有集中式迁移和校验。 |
| 本地 Tailwind 构建 | 已完成 | 样式由本地 Tailwind/PostCSS 生成，无 CDN 依赖。 |
| 处置修改日志 | 已完成 | 编辑处置时写入审计日志。 |

### 建议继续做的高价值改进

| 优先级 | 方向 | 可行性 | 建议方案 |
| --- | --- | --- | --- |
| P0 | 抽取共用 `TreatmentForm` | 高 | `AddTreatmentModal` 与 `EditTreatmentModal` 仍有大量重复表单逻辑，建议抽成 `features/treatment/TreatmentForm.tsx`，新增和编辑只传初始值与提交回调。 |
| P0 | 预约医生/资源模型 | 中 | 在 `GlobalAppointment` 增加 `doctorId` 或 `resourceId`，设置页增加资源维护，冲突检查升级为同时间同医生/资源冲突。需要数据迁移。 |
| P1 | 更可靠的本地数据库 | 中 | localStorage 适合轻量单机，但容量、事务、查询能力有限。建议优先迁移到 IndexedDB；如果要做 Electron 正式桌面版，可考虑 SQLite。 |
| P1 | 云同步冲突处理 | 中 | 当前云同步是覆盖式 pull/push。建议增加 `updatedAt`、设备标识、数据版本和冲突预览，避免误覆盖。 |
| P1 | 自动更新闭环 | 中 | 现有 Release 检测只能提示更新。可增加下载链接、版本说明展示、安装包校验；Electron 自动更新需要签名和发布渠道。 |
| P2 | 统计与财务报表 | 高 | 当前已有处置金额和日期，可先做按日/月统计、项目收入排行、患者复诊统计。 |
| P2 | 导入预览和恢复入口 | 高 | 目前导入前会保存备份 key，但没有 UI 恢复入口。建议在设置中增加“恢复导入前备份”。 |
| P2 | UI 响应式优化 | 中 | Electron 窗口最小宽度较大，但部分表格和弹窗仍偏桌面。可逐步补充横向滚动、紧凑模式和小屏布局。 |

### 推荐实施顺序

1. 抽取 `TreatmentForm`，减少新增和编辑处置的重复代码。
2. 增加预约医生/资源字段，并把冲突检查从“时间唯一”升级为“资源维度唯一”。
3. 为所有主数据补齐 `createdAt`、`updatedAt`，为云同步冲突处理打基础。
4. 设置页增加导入前备份恢复入口。
5. 增加统计报表页面。
6. 评估 IndexedDB 或 SQLite 迁移，先做数据访问层抽象，再替换存储实现。

### 风险提示

- 目前所有数据仍在浏览器本地存储中，清浏览器数据或应用数据会导致丢失；正式使用前应依赖导出备份或服务器备份。
- 云端同步接口只是前端协议，真正的数据隔离、鉴权、对象存储、版本保留和恢复策略必须由服务器实现。
- Release 检测依赖 GitHub API；网络不可达或仓库地址错误时只会给出失败提示，不会自动安装更新。
- 处置记录修改日志只记录从当前版本开始的编辑行为，迁移旧数据时不会凭空生成历史日志。
