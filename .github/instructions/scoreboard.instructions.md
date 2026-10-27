---
description: "维护实时记分板、赛事配置和使用文档时，同步更新统一设计与使用记录。"
applyTo: "js/tournament.js,css/tournament.css,_includes/event.html,_data/events/**,events/**,score_board/**,ai_tools/scoreboard.md,scripts/test-tournament.js,_config.yml,.github/skills/generate-tennis-scoreboard/**,skills/generate_draw/**,.github/skills/generate-draw/**,workflow.md,AGENTS.md"
---

# 记分板文档同步

- 修改记分板前先阅读 `ai_tools/scoreboard.md`，以实际代码为准核对相关设计和使用约定。
- 修改记分板行为、配置结构、默认值、算法、操作流程或验证方式时，必须在同一次变更中同步更新该文档的对应章节、最后更新日期和变更记录。
- 用户操作变化同时更新 `score_board/howto.md`；配置约定变化同时核对 `_data/events/demo.yml` 和赛事生成 skill。
- `score_board/score_system.md` 仅保留历史参考，不作为新的维护入口。内部 `ai_tools` 目录保持排除在 Jekyll 发布之外。
- 仅新增常规赛事名单或修改无关网站配置时，不必机械改动技术记录；出现新的赛制约定或限制时才补充。
- 不改写既有真实比分，不记录令牌或其他凭据。测试记录必须区分实际执行、模拟验证、历史记录和未验证流程。
- 后续实质性设计、开发与更改同步记录到 `workflow.md`；仓库 agent/skill 入口变化同步更新 `AGENTS.md`。