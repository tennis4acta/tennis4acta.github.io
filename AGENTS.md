# Agent 信息与协作约定

## 角色

- 主协作 agent：GitHub Copilot，负责需求澄清、代码实现、聚焦验证及同步文档。
- 本文件记录仓库级协作约定，不代表创建了独立的运行时 agent 或后台任务。
- 默认由当前 agent 完成任务；仅在用户或适用 skill 明确要求时委派子 agent，不自行提交或推送 Git。

## 必读与维护入口

- 实时记分板：先读 [ai_tools/scoreboard.md](ai_tools/scoreboard.md)，行为或接口变化时同步更新。
- 抽签工具：实现和测试在 [skills/generate_draw](skills/generate_draw)，操作见 [README.md](skills/generate_draw/README.md)。
- 后续设计、开发、验证及更改统一追加到 [workflow.md](workflow.md)，区分设计决定、实际完成和未验证事项。
- 遵守适用的 `.github/instructions/` 指令及 skill，保留用户已有改动。

## Skills

| Skill | 入口 | 用途 |
|---|---|---|
| `generate-draw` | [.github/skills/generate-draw/SKILL.md](.github/skills/generate-draw/SKILL.md) | 解析名单与种子，分组或直接淘汰赛抽签，生成记分板 YAML |
| `generate-tennis-scoreboard` | [.github/skills/generate-tennis-scoreboard/SKILL.md](.github/skills/generate-tennis-scoreboard/SKILL.md) | 将赛事配置接入 Jekyll 页面，核对赛制与比分存储 |

新建或更改仓库 agent/skill 时，更新此表或对应角色说明；不要写入个人令牌、凭据或无法验证的能力声明。

## 工作与验证

1. 从具体实现或失败行为定位最小改动，先确认与现有接口的兼容性。
2. 修改后先运行受影响的聚焦测试，不触碰真实比分、开赛名单或令牌。
3. 抽签工具检查：`node --test skills/generate_draw/generate_draw.test.js`。
4. 记分板算法检查：`node scripts/test-tournament.js`；补丁检查：`git diff --check`。
5. 用户可见流程变化同步公开指南；内部工具、agent 说明和工作记录不发布到 Jekyll 网站。
6. 完成前更新 `workflow.md`，写明验证范围及外部依赖造成的未验证项；不把模拟 API 测试描述为真实写入通过。