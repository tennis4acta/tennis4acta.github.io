# 分组抽签工具

将球员或双打组合名单抽签为记分板可直接读取的 `.yml`。需要 Node.js 18 或以上，不需另装运行依赖。开发和更改记录见 [workflow.md](../../workflow.md)。

## 输入

每位球员或每对组合一行，也可混用英文/中文逗号、分号。双打用 `&` 或 `/` 连接姓名，整对视为一个参赛者，不要用逗号分隔同队两人。

```text
Amy [1]
Ben [4]
Carol & Dan
Eve & Frank
Grace
```

- 姓名末尾 `[1]` 表示种子，编号为正整数；`[2]` 与 `[02]` 为重复编号，会报错。
- 允许缺号，按实际编号相对顺序排序，不为缺号预留空选手。输出保留 `Harper Liu [1]` 这样的完整标记；小组名单、实名签表和 `seeds` 映射使用一致名称，编号统一为十进制整数。
- 同名选手/组合拒绝；`BYE` 为保留名，`|` 和方括号不能作为普通姓名字符。
- 空行和空分隔项忽略；Windows UTF-8 BOM、CRLF 可直接读取。输入文件须为 UTF-8，不自动检测其他编码。

## 使用

从仓库根目录执行。以下为用法示例，不会自动创建正式赛事页面。

### 小组赛

```powershell
node skills/generate_draw/generate_draw.js --players players.txt --groups 4 --advance 2 --name "Tennis event" --output _data/events/new-event.yml
```

也可直接给文本：

```powershell
node skills/generate_draw/generate_draw.js --text "Amy [1]; Ben [4]; Carol; Dan; Eve" --groups 2 --advance 2 --output draw.yml
```

`--groups N` 必填；N > 0 时 `--advance J` 也必填。J 不能超过最小组人数；J = 0 表示只进行小组赛。组数不能超过参赛人数，不会生成空组。组名依次为 A…Z、AA、AB…。

小组人数差不超过 1；多出名额归属随机，不固定给 A 组。首层种子按顺位分散到各组；先按容量和种子数确定各组可容纳的种子名额，种子数无法均分时优先让高顺位种子所在组少放额外种子（“种子轮空”，不表示少打一场比赛）。首层之后，每层种子随机分配到该层已确定的名额中，不固定正向、反向或蛇形。8 位种子分 5 组时，A/B 各 1 位种子，后三位种子随机分到 C/D/E。非种子随机填充；容量限制优先满足，不生成超员或空组。组内种子按顺位列在前面，恰好两位时最后一轮相遇；超过两位时不承诺所有种子互相末轮相遇。

每组前 2 名出线时，工具同时生成固定 `rules.draw`，保存首轮轮空和同组半区回避，不依赖浏览器重新随机：

- 先按小组种子顺序保护各组第一名，轮空不足时优先给高种子组第一名。
- 5 组、10 人出线：16 签，6 个轮空；5 个组第一全部轮空，额外 1 个轮空从 5 个组第二中等概率随机选择。
- 6 组、12 人出线：16 签，4 个轮空；前四个种子组的第一名（A1～D1）轮空。
- 同组两人分处不同半区。5 组时可在 5～8 号种子位区间内调整 E1，以同时满足随机轮空、前四种子位保护和同组回避。
- 其他组数每组出线 2 人时，也优先给组第一轮空；余下轮空在满足半区约束的组第二之间随机分配。每组非 2 人出线时沿用记分板默认自动签表，不应用上述专用分配。

保护的是组别和出线名次，不把实际种子选手的低排名改成高排名。已确认签表不应重新生成，旧 YAML 不会被自动改写。

### 直接淘汰赛

```powershell
node skills/generate_draw/generate_draw.js --text "Amy [1]; Ben [4]; Carol; Dan; Eve" --groups 0 --name "Knockout" --output knockout.yml
```

至少需要两位/对参赛者。N = 0 时忽略 J，输出 `groups: {}`、`rules.advance: 0` 及实名首轮 `rules.draw`。标准签表补至 2 的幂，BYE 优先按种子编号从小到大分配，剩余 BYE 给随机非种子；不会生成 `BYE vs BYE`。

缺号种子按相对排序紧凑占据种子位。例如仅有 1、4 号种子时，他们占据两个最高优先级位置；原编号仍保留在 `seeds` 中。

### 标准输入

`--players -` 从标准输入读取 UTF-8。PowerShell 管道输入中文时需先确认管道使用 UTF-8；中文名单优先使用 UTF-8 文件，避免 shell 编码改变姓名。

## 输出和默认规则

- `--output` 必填，后缀必须为 `.yml`，已有文件拒绝覆盖。
- 输出到 `_data/events/` 时文件名必须是小写英文/数字/连字符的 ID；存在同 ID 比分文件时拒绝生成。
- `name` 默认 `Tennis event`，可用 `--name` 指定。
- `points` 为 `{ win: 1, loss: 0, wo_loss: 0 }`。
- `tiebreakers` 为 `[points, h2h, set_diff, game_diff]`。
- `third_place: true`，`show_set_column: true`。
- `score_hint` 为 `6-4 / 6-4 3-6 [10-8]`。
- 顶层 `seeds` 为姓名到原编号的映射，仅供核对；记分板不按此字段改写比赛结果或晋级名次。
- 不输出已弃用的 `show_order`，不生成比分、不自动发布或调用 GitHub API。

YAML 可放入 `_data/events/<id>.yml`，再使用现有 `event.html` include 接入页面。具体规则和操作见 [记分板文档](../../ai_tools/scoreboard.md)。正式使用前应确认默认规则符合赛事要求；不要在开赛后重新抽签覆盖名单。

种子标记属于输出姓名的一部分，也参与比分键匹配。不要给已经录入比分的正式赛事事后添加或删除标记；旧版无标记配置不会自动迁移。

## 验证

```powershell
node --test skills/generate_draw/generate_draw.test.js
node scripts/test-tournament.js
```

测试覆盖混合分隔符、双打、缺号/重复种子、无效参数、人数平衡、随机多出名额、种子优先轮空、生产记分板集成和文件保护。若环境已有 `js-yaml`，还会独立解析输出；缺少该库时该项跳过，不为测试自动安装依赖。