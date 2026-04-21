# 《Brain Vault 云端数据库 (Supabase) 架构全书 v2.1》
*(注：本文档为全链路对接版，包含了应对海量视频与 AI 状态锁的最新结构，请以此版本为准进行 Web 端开发。)*

## 一、 核心数据库表结构 (Schema)

目前云端共涉及三张核心表。Web 端开发在调用 Supabase JS Client 时，请严格对齐以下数据类型与状态约定。

### 1. `assets` (资产元数据表 - Web 端主要读图/视频流)
记录原始文件的物理信息、云端位置及 AI 引擎的解析状态。

| 字段名 | 类型 (PostgreSQL) | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `uuid` | `text` | 无 (本地生成) | **主键**。本地 Python 计算生成的唯一标识。 |
| `file_name` | `text` | 无 | 原始文件名。 |
| `file_path` | `text` | 无 | 原始文件存放路径（本地物理路径，Web 端仅作展示参考）。 |
| `extension` | `text` | 无 | 文件后缀（如 `.pdf`, `.mp4`）。Web 端据此判断渲染何种播放器/查看器。 |
| `file_size` | `bigint` | 无 | **[v2.1 新增]** 文件物理体积（字节数）。 |
| `md5` | `text` | 无 | 物理哈希，用于查重。 |
| `access_level` | `text` | `'private'` | 文件的全局访问等级。 |
| `asset_type` | `text` | `'knowledge'` | **[v2.1 新增]** 区分普通知识库 (`knowledge`) 与严格保险库 (`vault`)。 |
| `is_synced` | `integer` | `0` | **[v2.1 新增]** `0`=未同步，`1`=已同步。Web 端仅需查询 `is_synced = 1` 的数据。 |
| `is_enriched` | `integer` | `0` | **[v2.1 新增]** `0`=未解析，`1`=已完成 OCR/语音深度提取。 |
| `needs_enrichment` | `integer` | `1` | **[v2.1 新增]** `1`=需要解析，`0`=不重要无需解析。 |
| `cloud_url` | `text` | `NULL` | **[v2.1 新增]** **核心字段**。Google Drive 或其他网盘的分享直链，Web 端图片/视频的 src 来源。 |

### 2. `asset_chunks` (神经元碎片表 - Web 端主要用于检索与 AI 重构)
存储从本地文档剥离出的文本片段、视频关键帧字幕、语音转写文本，或 Web 端录入的随心记。

| 字段名 | 类型 (PostgreSQL) | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `uuid`或`text` | `gen_random_uuid()` | **主键**。碎片的唯一标识。 |
| `content` | `text` | 无 | 文本内容（素材片段、OCR 结果、听写结果）。 |
| `asset_uuid` | `text` | 无 | **外键**。关联 `assets.uuid`。Web 端可通过此字段追溯该段文本出自哪个视频/文档。 |
| `user_id` | `uuid` | `auth.uid()` | 所属用户 ID。关联 `auth.users`。 |
| `visibility` | `text` | `'private'` | 公私标签。取值：`private` 或 `public`。 |
| `created_at` | `timestamptz` | `now()` | 创建时间。用于搜索排序。 |
| `tags` | `text` | 无 | 预留的标签字段。 |
| `is_synced` | `integer` | `0` | **[v2.1 新增]** 碎片的同步状态锁。 |

### 3. `profiles` (用户权限表)
管理用户的角色，决定其在前端是否能看到超级看板或控制面板。

| 字段名 | 类型 (PostgreSQL) | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | 无 | **主键**。对应 `auth.users.id`。 |
| `email` | `text` | 无 | 用户邮箱。 |
| `role` | `text` | `'user'` | 角色。`superadmin` 拥有全部权限。 |

---

## 二、 数据访问安全策略 (RLS) 与权限铁律

Web 端开发在调用数据时，会自动受制于 Supabase 的 Row Level Security (RLS)。请确保前端逻辑处理好无权限时的空态展示。

* **读取 (SELECT)**:
    * `visibility = 'public' OR user_id = auth.uid()`
    * (任何人能看公开数据，本人只能看本人的私密数据)。
* **写入 (INSERT/UPDATE)**:
    * `auth.role() = 'authenticated' AND user_id = auth.uid()`
    * (必须登录，且只能给自己名下存数据。Web 端产生的“随心记”必须遵循此规则)。
* **超级管理员 (ALL)**:
    * 指定的 UID 享有无视 RLS 的绿灯特权。

---

## 三、 Web 端开发交互规范 (The Contract)

在开发 Web 端 UI 与交互时，请严格遵守以下与本地 Python 引擎的“协同契约”：

1.  **关于 `cloud_url` 的使用**：
    由于本地引擎不再上传物理文件到 Supabase Storage（为节省云成本），而是将大文件推至 Google Drive 等网盘，**Web 端预览文件时，必须读取 `assets` 表的 `cloud_url` 字段作为链接**。请勿尝试读取 `file_path`，那是客户端物理机的绝对路径，Web 端无法访问。
2.  **处理未解析的数据 (`is_enriched = 0`)**：
    Web 端在展示视频或图片资产时，如果发现 `is_enriched = 0`，请在 UI 上展示类似 *“AI 正在后台拼命提取文字与语音中...”* 的加载态，而不是提示数据为空。
3.  **云端写入优先携带 UUID**：
    如果 Web 端提供了“手动新建笔记”的功能，插入 `asset_chunks` 时尽量让 Supabase 自动生成 UUID (`gen_random_uuid()`)，并务必确保插入数据时携带当前登录的 `auth.uid()` 给 `user_id` 字段。
4.  **向量化准备 (pgvector)**：
    考虑到后续 Web 端需要接入高维语义检索，当前的 `content` 字段将作为 Embedding 模型的输入源。前端无需在浏览器内进行向量计算，而是将搜索词发往云端 Edge Function 或交给后端处理。