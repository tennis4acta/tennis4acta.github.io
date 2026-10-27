---
name: generate-draw
description: '生成网球分组抽签或直接淘汰赛签表。用户提供球员/双打组合名单、[种子编号]、小组数量 N、晋级数量 J，要求随机分组、种子回避、BYE 或输出 scoreboard YAML 时使用。工具位于 skills/generate_draw。'
argument-hint: '球员名单、种子编号、小组数量 N、晋级数量 J、输出文件；可选赛事名称'
user-invocable: true
---

# 分组抽签与 YAML 生成

## 入口

先读根目录 `AGENTS.md`、`ai_tools/scoreboard.md` 和 [工具说明](../../../skills/generate_draw/README.md)。使用 [现有脚本](../../../skills/generate_draw/generate_draw.js)，不要在聊天中凭空手排随机结果或复制另一套抽签算法。

## 流程

1. 确认名单、小组数量 N 和输出路径；N > 0 时须确认晋级人数 J，不能自行推定。名称可省略，其他规则按工具已记录的默认值生成。双打每对作为一个字符串，建议用 `&`。
2. 名单可逐行或用英文/中文逗号、分号分隔。识别末尾 `[正整数]`，拒绝重复种子和同名参赛者，允许缺号。输出姓名保留 `Harper Liu [1]` 这样的种子标记，小组、实名签表和 `seeds` 使用一致名称；不为旧的已开赛赛事自动补标记。遇到错误应报告，不静默改名或重编号。
3. 从仓库根目录运行：

   ```powershell
   node skills/generate_draw/generate_draw.js --players players.txt --groups 4 --advance 2 --name "Event" --output _data/events/new-event.yml
   ```

   短名单可用 `--text "Amy [1]; Ben [4]; Carol; Dan"`。N = 0 时省略 `--advance`，直接生成淘汰赛。
4. N > 0：检查组数、最小组人数与 J，保证人数差至多 1，种子分散且位于组内名单前面。多出名额随机分配；首层种子按顺位分组，先确定各组种子名额并优先保障高顺位种子的“种子轮空”，首层之后逐层随机分配到这些名额，不使用固定反向或蛇形。8 种子分 5 组时 A/B 各仅 1 位种子，后三位种子随机进入 C/D/E；两位组内种子末轮相遇。种子轮空指少遇种子，不是比赛 BYE。
   J = 2 时核对生成的固定 `rules.draw`：优先给高种子组第一名轮空；10 人出线时五个组第一加随机一个组第二轮空，12 人出线时前四种子组第一轮空；同组两人分处不同半区。随机结果写入 YAML 后固定，不在刷新时重抽。其他 J 保持默认签表行为。
5. N = 0：确认 `groups: {}`、非空实名 `rules.draw`、`rules.advance: 0`；BYE 按种子优先分配。缺号只影响原始编号，不制造空参赛者。
6. 不覆盖既有 YAML 或比分，未经要求不重新抽签已确认赛事。工具不写比分，不登录 GitHub，不获取或记录令牌。
7. 核对输出与默认规则。修改工具时运行抽签测试及记分板回归，同步 `workflow.md`、`ai_tools/scoreboard.md` 和相关说明。
8. 报告输出路径、各组人数或签表规模、种子与 BYE 安排，以及固定默认规则；需要正式赛事页面时转用 `generate-tennis-scoreboard` skill 接入。

## 验证

```powershell
node --test skills/generate_draw/generate_draw.test.js
node scripts/test-tournament.js
git diff --check
```

不要将模拟验证声称为真实 GitHub 写入；只生成配置时不触碰共享记分板代码。小组赛种子保护以组内名单和晋级名次为准，并非对实际选手跨阶段的绝对回避承诺。