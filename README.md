# README

## 1. 应用概览

Dental Clinic Manager 是一个牙科诊所本地管理工具，主要用于管理患者档案、处置记录、预约日程、处置项目目录和本地数据备份。应用采用 React + TypeScript + Vite 构建前端，并通过 Electron 打包为桌面应用。

当前实现是典型的单页应用结构：大部分 UI、页面状态和交互逻辑集中在 `App.tsx`，持久化逻辑集中在 `services/clinicService.ts`，数据存储使用浏览器 `localStorage`，没有后端服务或数据库。

## 2. 技术栈

| 类别 | 使用内容 |
| --- | --- |
| 前端框架 | React 19、TypeScript |
| 构建工具 | Vite |
| 桌面壳 | Electron |
| UI 样式 | Tailwind CSS、本地 PostCSS 构建、工具类样式 |
| 图标 | lucide-react |
| 拼音搜索 | tiny-pinyin |
| 数据持久化 | localStorage |
| 打包 | electron-builder |

## 3. 主要功能模块

### 3.1 总览 Dashboard

位置：`App.tsx` 的 `Dashboard` 组件。

功能：

- 展示总患者数。
- 展示今日预约数量。
- 提供快速入口：新增患者、查看今日日程。
- 展示今日预约列表。
- 点击预约行可进入患者详情。
- 点击预约状态可在“待诊”和“完成”之间切换。

修改可行性：高。该模块主要是展示层和少量状态切换逻辑，改动集中在 `Dashboard` 组件和 `clinicService.updateAppointmentStatus`。

### 3.2 患者管理

位置：`App.tsx` 的 `PatientList`、`AddPatientModal`、`PatientDetail` 组件。

功能：

- 新增患者档案。
- 使用姓名、电话、拼音首字母搜索患者。
- 按最近更新时间排序患者。
- 查看患者详情。
- 编辑患者基本信息。
- 删除患者档案。

修改可行性：中高。列表、搜索、新增、编辑都集中在 React 组件中，较容易调整；但患者电话被用作唯一 ID，若要改成独立患者 ID，需要同时修改数据结构、预约关联和服务层方法。

### 3.3 处置记录管理

位置：`App.tsx` 的 `PatientDetail`、`AddTreatmentModal`、`EditTreatmentModal`、`ToothSelector`、`Tooth`，以及 `clinicService` 的 treatment 相关方法。

功能：

- 为患者添加处置记录。
- 从处置项目目录选择分类和项目。
- 自动带出处置项目默认价格，并允许修改收费价格。
- 选择牙位，支持单选、多选、拖动选择、全口、上颌、下颌。
- 编辑处置记录。
- 删除处置记录。

修改可行性：中。业务功能完整但组件较集中，尤其添加和编辑处置记录存在较多重复逻辑。小改动可直接做；若要加入复杂牙位规则、图片牙位图或收费计算，建议先拆分组件与表单逻辑。

### 3.4 日程预约管理

位置：`App.tsx` 的 `ScheduleManager`、`AddAppointmentModal`，以及 `clinicService` 的 appointment 相关方法。

功能：

- 为患者新增预约。
- 单日查看预约。
- 按日期范围查看预约。
- 按时间排序。
- 切换预约状态。
- 点击预约跳转患者详情。

修改可行性：中高。预约读取和状态切换逻辑清晰；但当前没有预约冲突检查、取消预约、修改预约、删除预约，也没有把全局预约和患者预约历史完全同步维护。扩展这些能力时需要改服务层数据结构。

### 3.5 系统设置与数据备份

位置：`App.tsx` 的 `SettingsModal`，以及 `clinicService` 的 settings/import/export/catalog 方法。

功能：

- 修改诊所名称。
- 导出所有本地数据为 JSON。
- 从 JSON 导入数据并覆盖当前数据。
- 管理处置项目目录。

修改可行性：中。基础设置和导入导出容易调整；导入校验目前较弱，仅检查 `patients` 和 `appointments` 字段，若要用于正式数据迁移，建议增加 schema 校验、版本号和错误提示。

### 3.6 处置项目目录管理

位置：`SettingsModal` 内的 catalog tab，默认数据在 `constants.ts`。

功能：

- 默认内置根管治疗、树脂充填、修复与种植、外科与牙周等分类。
- 添加分类。
- 删除分类。
- 添加项目。
- 编辑项目名称和价格。
- 删除项目。
- 保存目录到 localStorage。

修改可行性：高。目录结构简单，改默认项目或 UI 都比较直接；如果要支持项目编码、医保分类、成本价、折扣等字段，需要同步修改 `TreatmentItem` 类型和相关表单。

### 3.7 数据持久化

位置：`services/clinicService.ts`。

功能：

- 读取 localStorage 初始化数据。
- 对旧数据做简单迁移，缺少 catalog 时补默认目录。
- 保存患者、预约、处置目录、诊所名称。
- 导入导出完整 JSON。

修改可行性：中。服务层封装比较集中，便于改造；但它是内存对象 + localStorage 的单例模式，适合单机轻量使用，不适合多端同步、并发编辑或数据量很大的场景。

## 4. UI 风格总结

整体 UI 是现代后台管理系统风格，偏医疗管理工具：

- 主色为青绿色/蓝绿色，常用于主按钮、当前导航、高亮状态和牙位选中态。
- 背景以浅灰 `slate` 系为主，内容区使用白色卡片和浅边框。
- 左侧深色固定侧边栏，右侧为主内容区。
- 大量使用圆角卡片、阴影、表格、标签、状态胶囊和模态弹窗。
- 图标来自 lucide-react，风格统一、线性、简洁。
- 字体层级较大，适合桌面端操作，移动端适配不是当前重点。
- 页面文案为中英混排，例如“总览 Dashboard”“患者管理 Patients”。
- 表单控件尺寸偏大，适合桌面诊所场景快速点击。
- 牙位选择器使用简化牙齿 SVG 和 FDI 编号，交互直观。

风险与注意点：

- 当前 UI 依赖本地 Tailwind 构建，适合 Electron 离线打包；修改样式后应运行 `npm run build` 确认 CSS 正常产出。
- 页面主要按桌面端诊所前台/医生工作站设计，移动端和窄窗口不是当前实现重点。
- 主要交互集中在表格、卡片和弹窗中，继续扩展前建议先统一表格行动列、空状态和状态标签规则。

## 5. 文件功能说明

| 文件/目录 | 功能 |
| --- | --- |
| `App.tsx` | 应用主入口组件，包含导航、页面切换、Dashboard、患者列表、患者详情、预约管理、牙位选择、设置弹窗和各类表单弹窗。当前绝大部分业务 UI 和交互逻辑都在此文件中。 |
| `services/clinicService.ts` | 本地数据服务层。负责从 localStorage 初始化数据、保存数据、患者 CRUD、处置记录 CRUD、预约新增/查询/状态更新、处置目录管理、诊所名称、导入导出。 |
| `types.ts` | 定义核心业务类型，包括 `Patient`、`TreatmentRecord`、`TreatmentItem`、`TreatmentCategory`、`Appointment`、`GlobalAppointment`、`ClinicData`。 |
| `constants.ts` | 定义默认处置项目目录 `DEFAULT_CATALOG` 和 localStorage key `STORAGE_KEY`。 |
| `components/Button.tsx` | 通用按钮组件，封装 `primary`、`secondary`、`danger`、`ghost` 四种样式和 `sm`、`md`、`lg` 三种尺寸。 |
| `index.tsx` | React 应用挂载入口，将 `App` 渲染到 `#root`。 |
| `index.html` | HTML 入口文件，加载 Tailwind CDN、importmap、root 容器和 `index.tsx`。 |
| `electron-main.js` | Electron 主进程入口，创建桌面窗口，开发时加载 `ELECTRON_START_URL`，生产时加载 `dist/index.html`。 |
| `vite.config.ts` | Vite 配置，包含 React 插件、3000 端口、路径别名 `@`、环境变量注入。 |
| `tsconfig.json` | TypeScript 配置，启用 React JSX、bundler module resolution、允许 JS、noEmit。 |
| `package.json` | 项目元信息、依赖、开发脚本、Electron 打包配置。 |
| `package-lock.json` | npm 锁定文件，用于固定依赖版本。 |
| `metadata.json` | 应用描述元数据，说明应用名称、功能描述和 frame 权限。 |
| `.env.local` | 本地环境变量文件。当前 Vite 配置会读取 `GEMINI_API_KEY`，但源码中未看到实际调用。 |
| `.gitignore` | Git 忽略规则。 |
| `dist/` | Vite 构建产物，属于生成文件，不建议手动修改。 |
| `node_modules/` | npm 依赖目录，属于安装产物，不应纳入业务修改范围。 |

## 6. 模块与函数修改可行性

### 6.1 `App.tsx`

| 组件/函数 | 当前职责 | 修改可行性 | 备注 |
| --- | --- | --- | --- |
| `App` | 顶层状态、侧边栏、页面切换、设置弹窗 | 中 | 状态集中，页面少时可维护；继续扩展建议拆分路由或页面组件。 |
| `refreshData` | 通过 `refreshKey` 触发重新读取服务层数据 | 高 | 简单可靠；若改成全局状态管理，需要替换此刷新机制。 |
| `handlePatientClick` | 选中患者并切换到患者视图 | 高 | 逻辑简单。 |
| `renderContent` | 根据当前视图和选中患者渲染页面 | 中 | 继续增加页面时建议拆分路由。 |
| `SidebarItem` | 侧边栏导航项 | 高 | 纯 UI 组件，容易调整。 |
| `Dashboard` | 总览卡片和今日预约表 | 高 | 展示逻辑清晰，可增加统计卡片或收入汇总。 |
| `PatientList` | 患者搜索、排序和列表展示 | 中高 | 拼音搜索依赖 tiny-pinyin；更复杂搜索建议抽出为工具函数。 |
| `isMatch` | 姓名、电话、拼音首字母匹配 | 高 | 可扩展到全拼、备注、模糊搜索。 |
| `getLastUpdate` | 计算患者最近更新时间 | 中 | 当前基于治疗日期和预约日期，精度有限。 |
| `PatientDetail` | 患者详情页、tab、编辑/删除、处置和预约入口 | 中 | 组件较大，新增 tab 或复杂表单前建议拆分。 |
| `handleSaveInfo` | 保存患者基本信息 | 高 | 当前不能修改电话/性别；如要支持需改数据关联。 |
| `handleConfirmDelete` | 删除患者档案 | 中 | 当前不会清理全局预约表中的关联预约，建议修复后再扩展。 |
| `confirmDeleteTreatment` | 删除处置记录 | 高 | 调用服务层删除，逻辑清楚。 |
| `ScheduleManager` | 预约单日/范围查询与状态切换 | 中高 | 易加筛选；编辑/删除预约需补服务层方法。 |
| `Tooth` | 单颗牙 UI | 高 | 可替换 SVG、颜色、尺寸。 |
| `ToothSelector` | 牙位选择和拖动多选 | 中 | 基础逻辑可维护；若加入乳牙、缺失牙、象限规则，建议单独模块化。 |
| `ModalBase` | 通用弹窗容器 | 高 | 纯 UI 容器，适合继续复用。 |
| `SettingsModal` | 设置、导入导出、处置目录维护 | 中 | 功能较多，建议拆成 `DataSettings` 和 `CatalogSettings`。 |
| `ConfirmationModal` | 删除确认弹窗 | 高 | 纯 UI 组件。 |
| `AddPatientModal` | 新增患者表单 | 高 | 表单简单；可加手机号格式校验。 |
| `AddTreatmentModal` | 新增处置记录表单 | 中 | 与编辑表单重复度高，建议抽出共用 TreatmentForm。 |
| `EditTreatmentModal` | 编辑处置记录表单 | 中 | 使用 `setTimeout` 跳过初次 effect，不够稳健；重构时可改成显式初始化状态。 |
| `AddAppointmentModal` | 新增预约表单 | 高 | 可扩展备注、医生、时长；冲突检查需服务层支持。 |

### 6.2 `services/clinicService.ts`

| 方法 | 当前职责 | 修改可行性 | 备注 |
| --- | --- | --- | --- |
| `getInitialData` | 从 localStorage 读取数据并做简单迁移 | 中 | 可增加版本迁移和 schema 校验。 |
| `saveData` | 写入 localStorage | 高 | 若换数据库，这里会变成异步。 |
| `getClinicName` | 获取诊所名称 | 高 | 简单 getter。 |
| `updateClinicName` | 保存诊所名称 | 高 | 简单 setter。 |
| `exportData` | 导出完整 JSON 字符串 | 高 | 可扩展脱敏、压缩、版本号。 |
| `importData` | 导入 JSON 并覆盖数据 | 中 | 当前校验偏弱，建议增强。 |
| `getCatalog` | 获取处置目录 | 高 | 当前返回内部数组引用，严格来说可能被外部直接改动。 |
| `updateCatalog` | 覆盖处置目录 | 高 | 逻辑简单。 |
| `getAllPatients` | 返回所有患者数组 | 高 | 可加入排序参数。 |
| `getPatient` | 按电话获取患者 | 高 | 如果患者 ID 改造，此处需要同步。 |
| `addPatient` | 新增患者，电话唯一 | 中高 | 若支持重复电话或独立 ID，需要改数据结构。 |
| `updatePatient` | 合并更新患者字段 | 中 | 修改 phone 作为 key 的场景需要额外迁移。 |
| `deletePatient` | 删除患者 | 中 | 当前未同步删除全局预约中的相关记录。 |
| `addTreatment` | 新增处置记录 | 中 | ID 用时间字符串，极端情况下可能冲突；可改 UUID。 |
| `updateTreatment` | 更新处置记录 | 高 | 简单数组定位与合并。 |
| `deleteTreatment` | 删除处置记录 | 高 | 简单 filter。 |
| `addAppointment` | 新增全局预约和患者预约历史 | 中 | 当前无冲突检查，也无预约 ID。 |
| `updateAppointmentStatus` | 更新某日某患者某时间的预约状态 | 中 | 用 date+phone+time 定位，若同人同时间重复预约会有歧义。 |
| `getAppointmentsByDate` | 获取单日预约 | 高 | 简单读取。 |
| `getAppointmentsByRange` | 获取日期范围预约 | 中高 | 数据量大时可优化索引或分页。 |

### 6.3 其他模块

| 文件/模块 | 修改可行性 | 说明 |
| --- | --- | --- |
| `types.ts` | 中高 | 类型集中，便于扩展；但字段改动会影响服务层和表单。 |
| `constants.ts` | 高 | 默认目录和存储 key 易改；修改 `STORAGE_KEY` 会导致旧数据不可见，需迁移。 |
| `components/Button.tsx` | 高 | 通用按钮封装简单，适合扩展 variant、loading、icon。 |
| `electron-main.js` | 中高 | 窗口尺寸、菜单、打包加载路径容易调整；安全策略建议改为 `contextIsolation: true` 并关闭 `nodeIntegration`。 |
| `vite.config.ts` | 中高 | 端口、别名、环境变量易改；生产化建议移除未使用的 Gemini env 注入。 |
| `index.html` | 中 | CDN 依赖影响离线桌面应用，建议改成本地依赖构建。 |
| `package.json` | 中高 | 脚本和打包配置清晰；图标路径目前指向 `public/vite.svg`，项目中未见 `public` 目录，打包图标可能需要修正。 |

## 7. 建议的后续重构方向

1. 将 `App.tsx` 拆分为 `pages/`、`components/`、`modals/`、`features/` 等目录，降低单文件复杂度。
2. 将 `AddTreatmentModal` 和 `EditTreatmentModal` 合并为共用 `TreatmentForm`。
3. 给预约增加独立 `id`，支持修改、删除、取消和冲突检查。
4. 删除患者时同步清理全局预约表。
5. 增强导入数据校验，增加数据版本和迁移机制。
6. 改为本地 Tailwind 构建，避免 Electron 离线运行时依赖 CDN。
7. 若面向正式使用，考虑将 localStorage 迁移到 SQLite、IndexedDB 或后端数据库。

## 8. UI 设计审查与具体修改建议

审查时间：2026-06-28。审查方式：运行 Vite 开发服务器，检查桌面视口和 390px 窄屏视口，并运行 `npm run build`。

### 8.1 总体判断

当前 UI 适合做桌面端牙科诊所本地管理工具的第一版。它的信息架构清楚，侧边栏、统计卡片、表格、弹窗和状态标签都符合后台管理软件的常见习惯；主色使用青绿色，也接近医疗健康产品常见语义。

不够合适的地方主要有四类：

1. 移动端/窄窗口不可用。固定 256px 侧边栏挤压主内容，390px 宽度下主区域只剩约 134px，标题和卡片被严重压缩。
2. 视觉语言偏通用 SaaS 后台，不够像诊所日常工作台。预约、待诊、完成、收费、牙位等高频医疗语义没有形成足够强的状态层级。
3. 中英混排较多，例如“总览 Dashboard”“患者管理 Patients”，会降低正式医疗软件的专业感。
4. 表格和空状态缺少操作反馈。患者列表末尾有空操作列，行点击规则不够显性；预约为空时只展示文案，没有引导新增预约。

### 8.2 必须优先修改

| 优先级 | 问题 | 具体修改 | 涉及文件 |
| --- | --- | --- | --- |
| P0 | 窄屏布局不可用 | 在 `App` 根布局增加响应式结构：桌面保留左侧栏，`md` 以下改为顶部栏或底部 tab；侧边栏从 `w-64` 改为 `hidden md:flex md:w-64`，主内容改为 `w-full min-w-0`。 | `App.tsx` |
| P0 | 主内容在窄屏被挤压 | 所有页面容器从固定 `p-8` 改为 `p-4 md:p-8`，统计卡片 grid 改为 `grid-cols-1 lg:grid-cols-3`，表格外层保留横向滚动。 | `Dashboard`、`PatientList`、`ScheduleManager` |
| P1 | 导航文案不够正式 | 去掉导航里的英文后缀，统一为“总览”“患者管理”“日程预约”；若需要英文，放到设置项或 README，不放在主导航。 | `SidebarItem` 调用处 |
| P1 | 预约工作流不突出 | Dashboard 增加“待诊”“已完成”“下一位患者”三类信息；预约页增加时间轴或按时间分组列表，待诊状态使用更醒目的颜色。 | `Dashboard`、`ScheduleManager` |
| P1 | 空状态没有下一步 | “今日暂无预约”“该时间段内无预约记录”下方增加“新建预约”按钮，并直接打开 `AddAppointmentModal`。 | `Dashboard`、`ScheduleManager` |
| P1 | 表格操作不明确 | 患者列表最后一列改为可见的“查看”按钮或右箭头图标；表头不要留空列。 | `PatientList` |

### 8.3 建议第二阶段修改

| 优先级 | 问题 | 具体修改 | 涉及文件 |
| --- | --- | --- | --- |
| P2 | 品牌区域占用过高 | 侧边栏顶部减少留白，把诊所名称、版本和设置入口整理成更紧凑的工具区。 | `App.tsx` |
| P2 | 卡片圆角和阴影略重 | 将主要卡片从 `rounded-xl shadow-sm/shadow-lg` 调整为 `rounded-lg shadow-sm`，减少装饰感，提升工具属性。 | 全局卡片类名 |
| P2 | 颜色语义不够系统 | 建立状态颜色规则：待诊用蓝色或琥珀色，完成用绿色，危险操作用红色，普通信息用 slate。不要用同一种青绿色承担所有含义。 | `Button.tsx`、状态标签 |
| P2 | 搜索反馈弱 | 搜索后显示“找到 n 位患者”，无结果时显示“没有匹配患者”，并提供“新增患者”。 | `PatientList` |
| P2 | 牙位选择器说明不足 | 在牙位选择器顶部增加已选牙位摘要和清空按钮，把“全口/上颌/下颌”做成分段控件。 | `ToothSelector` |
| P2 | 弹窗表单层级不统一 | 统一 modal 宽度、标题、底部按钮排列；危险操作使用独立确认文案。 | `ModalBase`、各 Modal |

### 8.4 推荐实施顺序

1. 先做响应式骨架：修复侧边栏、主内容宽度、页面 padding 和统计卡片 grid。
2. 再做文案和状态语义：去掉主导航英文后缀，统一状态标签颜色和按钮文案。
3. 然后补工作流反馈：空状态按钮、患者列表查看按钮、搜索结果数量。
4. 最后再做视觉微调：卡片圆角、阴影、侧边栏留白和表单间距。

每一步都建议执行：

```bash
npm run build
```

如果改了响应式布局，还应至少检查两个视口：

- 桌面：1280 x 720
- 窄屏：390 x 844

## 9. 在 Codex 中每次更新后提交一个 commit

推荐流程：

```bash
git status -sb
git diff
git add README.md App.tsx components/Button.tsx
git commit -m "docs: add ui review and workflow notes"
git push
```

在 Codex 里可以直接这样要求：

> 请检查本次改动，只提交和这次任务相关的文件，commit message 用 `type: summary` 格式，然后 push 到 GitHub。

注意事项：

1. 每次让 Codex 提交前，先让它运行 `git status -sb` 和 `git diff`，确认没有把无关文件提交进去。
2. 不要提交 `node_modules/`、`dist/`、`release/`、`.DS_Store`、`.env.local`。
3. 小步提交：一次 commit 只包含一个明确目的，例如 UI 响应式修复、预约空状态优化、README 更新。
4. 提交信息建议使用：

```text
feat: improve responsive clinic layout
fix: clarify patient table actions
docs: add ui review notes
chore: update build metadata
```

5. 如果 Codex 做了多类修改，要求它拆成多个 commit，而不是一个大 commit。
