# SQLite 后续拆表方案

当前 SQLite 只做 key-value 存储：

```sql
CREATE TABLE kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`clinicData` 保存完整 `ClinicData` JSON 的加密值，格式为 `enc:v1:<base64>`。加密和解密只在 Electron 主进程中进行，使用系统安全存储能力保护密钥材料；SQLite 文件中不应再出现患者姓名、电话、处置备注等明文。

## 后续目标

第二阶段如果要把完整 JSON 拆成关系表，提高查询、报表和同步能力，敏感字段必须继续加密或改用不可逆索引，不能回退到明文列。

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

1. 保留 `kv_store.clinicData` 作为加密兜底快照。
2. 新增关系表和 `schema_version`。
3. 对姓名、电话、年龄、备注、预约快照等患者相关字段使用字段级加密。
4. 搜索只保存必要的不可逆索引，例如标准化电话的 HMAC、姓名拼音的前缀 HMAC 集合。
5. 报表和列表优先读取关系表，但返回前必须在主进程内解密。
6. 验证稳定后，`clinicData` 仍保留为加密兼容导出快照。

## 风险点

- 预约和患者历史快照当前存在冗余，拆表时应明确以 `appointments` 为事实来源。
- 处置修改日志需要保留顺序和原始字段值，不能在迁移时丢失。
- 云同步如果仍使用整包覆盖，需要在拆表后继续生成兼容 `ClinicData`，并维持客户端加密后上传。
- 如果改为增量同步，需要为主要表增加 `created_at`、`updated_at`、`deleted_at` 和设备来源字段。
- 不要在 `patients`、`appointments`、`treatments` 等表重新写入明文患者信息；历史明文关系表会在启动迁移时清空。
