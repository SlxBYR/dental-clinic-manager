# SQLite 后续拆表方案

当前 SQLite 只做 key-value 存储：

```sql
CREATE TABLE kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`clinicData` 保存完整 `ClinicData` JSON。这一阶段的目标是先把主数据从 localStorage 迁移到 Electron 的 `userData` 数据库文件中，同时避免一次性重写所有业务读写逻辑。

## 后续目标

第二阶段可以把完整 JSON 拆成关系表，提高查询、报表和同步能力。

建议表：

| 表 | 说明 |
| --- | --- |
| `patients` | 患者基础档案，主键 `id`。 |
| `patient_groups` | 同号码患者组，可按 `patientGroupId` 聚合。 |
| `treatments` | 处置记录，主键 `id`，外键 `patient_id`。 |
| `treatment_change_logs` | 处置修改日志，外键 `treatment_id`。 |
| `appointments` | 全局预约，主键 `id`，外键 `patient_id`。 |
| `catalog_categories` | 处置目录分类。 |
| `catalog_items` | 处置目录项目。 |
| `settings` | 诊所名称、备份接口、同步接口等非业务设置。 |
| `sync_meta` | 设备 ID、最后同步时间、远端版本等同步元信息。 |

## 建议迁移顺序

1. 保留 `kv_store.clinicData` 作为兜底快照。
2. 新增关系表和 `schema_version`。
3. 首次启动时从 `clinicData` JSON 写入关系表。
4. 所有写操作同时写关系表和 `clinicData` 快照。
5. 报表和列表优先改为读取关系表。
6. 验证稳定后，`clinicData` 从主数据降级为兼容导出快照。

## 风险点

- 预约和患者历史快照当前存在冗余，拆表时应明确以 `appointments` 为事实来源。
- 处置修改日志需要保留顺序和原始字段值，不能在迁移时丢失。
- 云同步如果仍使用整包覆盖，需要在拆表后继续生成兼容 `ClinicData`。
- 如果改为增量同步，需要为主要表增加 `created_at`、`updated_at`、`deleted_at` 和设备来源字段。
