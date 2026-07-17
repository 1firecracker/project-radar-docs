# 技能库

技能库是一组可复用的工作流说明书：每个技能用一个目录承载，目录里最重要的是 `SKILL.md`。`SKILL.md` 里用 YAML frontmatter 声明元数据，正文描述什么时候用、怎么用、步骤和注意事项。

## 整体运行流程

```
启动阶段
  ↓
build_agent_components()
  → 读取 conf_v3_zh.yaml
  → get_skill_registry_settings()  提取 runtime.skill_registry 配置
  → _load_skill_assets()           记录 skills 本地目录 / sandbox 目录 / allowlist
  ↓
prepare_session()（每次用例运行前）
  → _compress_skills_folder()      将 allowlist 范围内的技能压缩为 zip
  → sandbox_manager.put_file()     上传 skills.zip 到沙盒
  → 沙盒内解压到 /mnt/data/skill/
  ↓
build_skill_registry()（编译 system prompt 时调用）
  → 递归扫描 skills 目录下所有 SKILL.md（base.rglob("SKILL.md")）
  → 解析每份 SKILL.md 的 YAML frontmatter
  → 按 allowlist 过滤
  → 输出 registry 列表，注入系统提示
  ↓
模型运行时
  → 模型在 system prompt 中看到技能的 name / metadata / location
  → 需要时按 location 路径读取沙盒中对应的 SKILL.md 全文
```

## SKILL.md 文件格式

每份 `SKILL.md` 由两部分组成：

1. **YAML frontmatter**（`---` 包裹），声明结构化元数据
2. **正文**，描述技能的使用场景、操作步骤和约束

frontmatter 支持的字段：

| 字段 | 说明 |
|------|------|
| `name` | 技能名称，缺省时用目录名 |
| `description` | 一句话说明 |
| `source_type` | 来源类型（如 `sandbox_synced` / `local_only`） |
| `source_label` | 来源标签 |
| `active` | 是否启用，默认 `true` |
| `tags` | 标签列表 |

## 技能注册表输出结构

每条注册表条目长这样：

```python
{
    "name": "ppt-superpower",
    "metadata": {
        "description": "...",
        "source_type": "sandbox_synced",
        "source_label": "sandbox",
        "active": True,
        "tags": ["ppt", "slides"],
    },
    "location": "/mnt/data/skill/ppt-superpower/SKILL.md",
}
```

`location` 默认指向沙盒路径；如果 `use_sandbox_location=False`，则指向本地绝对路径。

## 当前内置技能（以仓库目录为准）

- `skills/deep-research`
- `skills/document-writing`
- `skills/ppt-asset-plan`
- `skills/ppt-export-pptx`
- `skills/ppt-page-assets`
- `skills/ppt-page-html`
- `skills/ppt-page-plan`
- `skills/ppt-page-polish`
- `skills/ppt-research-pack`
- `skills/ppt-review`
- `skills/ppt-source-analysis`
- `skills/ppt-speaker-notes`
- `skills/ppt-storyboard`
- `skills/ppt-story-refine`
- `skills/ppt-style-refine`
- `skills/ppt-style-spec`
- `skills/ppt-superpower`
- `skills/ppt-task-pack`
- `skills/ppt-template-pack`
- `skills/xlsx`

其中 `ppt-*` 系列技能覆盖 PPT 生成的完整工作流（选题分析、风格规范、页面规划、资产准备、HTML 生成、打磨、导出 PPTX 等）；`deep-research` 和 `document-writing` 用于深度研究和文档写作；`xlsx` 用于电子表格处理。

## 使用方式

1. 在配置中启用 `runtime.enable_skill_registry`
2. 可选配置 `runtime.skill_registry.skills_dir`、`runtime.skill_registry.skills_sandbox_dir`、`runtime.skill_registry.allowlist`
3. 启动时自动压缩并上传技能到沙盒，注册表注入系统提示
4. 模型按需通过 `location` 读取对应 `SKILL.md`

## deep-research 模式开关

`deep_research` 只控制是否注入“必须读取并按照 deep-research skill 执行”的运行时提示，不控制 `deep-research` skill 是否注册。
