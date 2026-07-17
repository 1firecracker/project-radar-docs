# Deep Research Skill 运行规范

这份文档不再讨论“为什么要做 deep research skill”，而是直接定义它应该如何运行。目标是把它收敛成一份后续可以直接改写为 `SKILL.md` 的流程规范。

## 1. 适用任务

`deep-research` 只用于这类任务：

用户选择打开了deepresearch开关

## 2. 核心原则

`deep-research` 必须遵守下面这些原则：

1. 先对齐需求，再开始调研。
2. 主线程先拆“步骤”，再把每个步骤拆成多个 `subtask`。
3. 每个 `subtask` 只能负责一个细分、具体、边界清晰的任务。
4. `subtask` 的主产物是任务执行结果，不是引用清单。
5. `finds` 只用于承载需要来源支撑的关键发现。
6. 每个步骤完成后必须由主线程执行一次 `reflection`。
7. 传给 `reflection` 的任务描述必须像 `subtask` 一样结构化，至少包含 `[目标]`、`[范围内]`、`[范围外]`、`[期望产出]`、`[验收标准]`。
8. 所有步骤都通过后，主线程才统一汇总成一篇文章。
9. 最终文章只保留文内 `<cite>`，不默认追加完整 `References`。

## 3. 标准流程

### Step 1. 检查需求是否明确

在进入调研前，先检查用户需求是否存在以下不明确项：

- 研究对象不明确
- 时间范围不明确
- 地域范围不明确
- 比较维度不明确
- 输出形式不明确
- 用户目标或验收标准不明确

只要这些问题会影响调研路径，就必须先调用 `ask_user` 与用户对齐，不能直接开始搜集资料。

### Step 2. 拆解为步骤级流程

当需求明确后，主线程先把整体任务拆成若干步骤。每个步骤都必须是可独立验收的工作单元，而不是简单的工具动作。

步骤设计要求：

- 每一步有明确目标
- 每一步有明确范围
- 每一步有预期产出
- 每一步有验收标准

示例：

- 步骤 1：明确研究对象与比较框架
- 步骤 2：收集并核实步骤 A 所需的事实材料
- 步骤 3：完成横向比较与差异分析
- 步骤 4：统一写成文章

不要把步骤写成：

- 搜索一下
- 打开网页
- 看看资料

### Step 3. 每个步骤拆成多个 `subtask`

进入某一个步骤后，再把该步骤拆成多个 `subtask`。每个 `subtask` 只能负责一个具体任务，例如：

- 核实一个事实
- 研究一个子主题
- 比对一个维度
- 收集一组来源
- 提炼一个对比结论所需的证据

`subtask` 的边界要求：

- 单一目标
- 明确输入
- 明确输出
- 不承担整篇报告
- 不替主线程做总汇总

主线程负责分配 `subtask`，子任务负责完成自己那一段工作。

### Step 4. `subtask` 返回执行结果与关键发现

每个 `subtask` 返回时，必须同时包含：

- `execution_result`
- `finds`

其中：

- `execution_result` 是这个子任务真正完成了什么、得到了什么结果
- `finds` 不是完整结果，只用于记录那些需要来源支撑、需要被后续文章直接引用的关键发现

也就是说，不能把 `finds` 当成 `subtask` 的全部输出。笨蛋才会把“结果”写没了，只剩一堆引用。

### Step 5. 关键发现必须使用 `<cite>`

所有进入 `finds` 的关键发现，都必须带文内 `<cite>`，格式固定为：

```xml
<cite index="1" title="github.com" url="https://github.com/openclaw/openclaw/blob/main/src/prompt.ts?plain=1">[1]</cite>
```

`cite` 最小必填字段：

- `index`
- `title`
- `url`

约束：

- 每条关键发现至少跟一个 `<cite>`
- `cite` 的可见文本默认写成 `[1]`、`[2]` 这类编号
- 编号可以在 `subtask` 内局部使用，最终文章中由主线程统一重排

### Step 6. 每个步骤完成后执行 `reflection`

当某一个步骤下的所有 `subtask` 都完成后，主线程先汇总该步骤结果，然后必须调用一次 `reflection`。

但 `reflection` 本身也必须被写成一个结构化工作包，不能只给一句泛泛的检查提示。否则反思任务本身就没有明确边界，前端展示出来也会像一条随手备注，不像一个可验收步骤。

`reflection` 的检查重点固定为：

- 该步骤的来源是否可信
- `<cite>` 是否完整
- 关键结论是否真的被证据支撑
- 是否存在来源冲突
- 是否存在明显证据缺口

如果 `reflection` 未通过：

- 不允许直接进入下一步
- 必须回到当前步骤继续补充、修正或重新取证

`reflection` 的粒度是“每个步骤完成后”，不是“每个 `subtask` 完成后”。

调用 `reflection` 时，建议主线程按以下结构编写任务描述：

- `[目标]`：本次反思要审查哪个步骤、要做什么判断
- `[范围内]`：允许检查哪些步骤级材料、结论、引用、冲突和缺口
- `[范围外]`：不负责重写全文、不负责推进下一步骤、不负责重新跑整轮调研
- `[期望产出]`：通过 / 不通过、证据充分性、风险与补查建议
- `[验收标准]`：主线程判断该步骤是否收口的依据

建议追加这批步骤上下文：

- `step_goal`
- `expected_output`
- `acceptance_criteria`
- `integrated_findings`
- `open_issues`

推荐模板：

```text
[目标]：审查“步骤 N”的阶段性结论是否足够可靠，并判断是否可以进入下一步。
[范围内]：
1. 核查 integrated_findings 中每条关键结论是否有可信来源与足够 `<cite>` 支撑。
2. 核查 subtask 汇总后是否仍存在来源冲突、证据缺口或结论跳跃。
3. 对照该步骤的 acceptance_criteria，判断当前结果是否达标。
[范围外]：
1. 不重写最终文章。
2. 不扩展到下一步骤的新研究。
3. 不只复述 subtask 结果，必须做步骤级审查判断。
[期望产出]：
1. 给出通过 / 不通过结论。
2. 指出当前步骤最关键的已证实发现、主要风险与证据缺口。
3. 若未通过，给出明确补查方向。
[验收标准]：
1. 必须明确说明该步骤是否可以进入下一步。
2. 必须指出哪些结论证据充分，哪些结论证据不足。
3. 必须指出缺失的来源类型、冲突点或待补证据。

步骤上下文：
- step_goal: ...
- expected_output: ...
- acceptance_criteria: ...
- integrated_findings: ...
- open_issues: ...
```

不要写成这种过于空泛的形式：

```text
步骤 1 结论的完整性与证据支撑情况。重点：是否明确了前身、定位、功能清单。
```

### Step 7. 所有步骤通过后统一成文

只有当所有步骤都完成，并且每个步骤都已经通过 `reflection`，主线程才进入最终汇总。

最终汇总的要求：

- 统一吸收所有步骤的执行结果
- 只保留真正需要写进文章的关键发现
- 把局部编号统一整理成全局 `<cite>`
- 输出一篇完整文章，而不是把若干 `subtask` 原样拼起来

## 4. 角色分工

### 主线程职责

- 检查需求是否明确
- 必要时调用 `ask_user`
- 拆解步骤
- 为每个步骤分发 `subtask`
- 汇总 `subtask` 结果
- 在每个步骤结束后调用 `reflection`
- 统一写出最终文章

### `subtask` 职责

- 只完成一个细分任务
- 返回明确的 `execution_result`
- 在 `finds` 中输出需要保留的关键发现
- 为每条关键发现附上 `<cite>`

### `reflection` 职责

- 检查步骤级结果是否可信
- 检查步骤级结果是否足够进入下一步
- 基于结构化任务描述做步骤级验收
- 给出“通过 / 不通过”的判断与原因

## 5. 输出契约

### 5.1 `subtask` 输出

固定模板如下：

```text
<subtask_result>
- task:
- execution_result:
- finds:
  - finding:
    <cite index="1" title="..." url="...">[1]</cite>
- open_issues:
</subtask_result>
```

字段要求：

- `task`：该子任务负责的内容
- `execution_result`：该子任务完成了什么，得到了什么结果
- `finds`：只记录需要保留引用的关键发现
- `open_issues`：尚未解决的问题、证据不足处、冲突点

### 5.2 步骤级汇总

固定模板如下：

```text
步骤汇总：
- step_goal:
- subtask_results_summary:
- integrated_findings:
- source_check_status:
- conflicts_or_gaps:
- reflection_result:
```

字段要求：

- `subtask_results_summary`：汇总这个步骤下所有 `subtask` 的执行结果
- `integrated_findings`：汇总这个步骤下真正需要进入最终文章的关键发现
- `source_check_status`：说明来源检查状态
- `conflicts_or_gaps`：说明冲突与证据缺口
- `reflection_result`：明确该步骤是否可以进入下一步

### 5.3 最终文章

最终文章固定结构如下：

```text
1. 背景与目标
2. 分步骤结论
3. 综合分析
4. 风险 / 未确认项
```

约束如下：

- 正文中直接保留 inline `<cite>`
- 不默认生成完整 `References`
- 来源展示依赖文内 `cite`
- 最终文章必须是完整文章，不是过程记录

示例：

```text
该产品在 2025 年之后开始强调企业级私有化部署能力 <cite index="3" title="Official Blog" url="https://example.com/blog">[3]</cite>。
```

## 6. 工具使用约束

这份 skill 主要依赖以下能力：

- `ask_user`：只在需求不明确且会影响执行路径时使用
- `create_subtask`：用于执行步骤内的细分任务
- `reflection`：用于步骤完成后的可信性检查

其他工具如 `web_search`、`fetch_url`、`knowledge_base`、`document_parser`、`read_file` 都属于步骤执行阶段的材料获取手段，不是这份 skill 的主流程骨架。

## 7. 文档目的

这份文档的目的只有一个：

- 定义 `deep-research` 应该如何运行

它不是论文草案，不是产品介绍，也不是“为什么要做 research agent”的讨论文。后续如果要真正创建 skill，应基于这份规范继续收敛成正式 `SKILL.md`。
