# MC 生物建模 · Agent Preset

在 `ptc` 基础上派生的 Agent 预设：**工具面与 ptc 完全一致，只替换人设**。

| 项 | 值 |
|---|---|
| preset id | `mc-model` |
| 显示名 | MC 生物建模 |
| 基准 | 本部署的 `@deepseek-ai/dsh-web-app/presets/ptc.patch.yml`（agent-presets 0.1.7-rc.2） |
| 安装位置 | `%DSH_HOME%\profiles\web\cordis.patch.yml`（profile patch 内的 `- insert:` 声明行） |
| 与 ptc 的差异 | 仅 `persona` 行；其余 19 行逐字未改 |

## 安装方式：这个部署不读 `.agent-presets` 目录

本机 harness（0.1.7-rc.2）组合的是 `@deepseek-ai/dsh-agent-preset-registry`，它按**声明**注册 preset，源码与 README 都明确写着「注册表不扫描目录，也不接受 preset 路径」。老版的 `@deepseek-ai/dsh-agent-presets`（目录扫描型）在这个部署里**根本没有被组合**。

因此把文件放进 `~/.dsh/.agent-presets/mc-model/` 是**无效**的：目录会被静默忽略。preset 必须在 profile patch 里插入一行 `@deepseek-ai/dsh-agent-preset`，正如 `dsh-liangshen` 对其自带组合所做的那样。

正确做法见 `install.sh`：把 `mc-model.insert.yml` 追加到 `profiles/<profile>/cordis.patch.yml` 末尾。

`agent.cordis.yml` + `preset.yml` 也保留在 `~/.dsh/.agent-presets/mc-model/`，作为**目录扫描型** harness（旧 `@deepseek-ai/dsh-agent-presets`）的后备；对本部署它不生效，留着只是可移植性，不参与加载。

## 它带来什么

`persona.prefix` 携带完整的 **Minecraft 生物建模审美规范 v1.0（DeepSeek V4.1 Flash 专用版）**，17 节硬性约束：

- Minecraft 风格优先于现实感；块状结构（Cube/Cuboid）作为轮廓基础
- 最小色块必须纯色：禁渐变、禁空气刷、禁模糊、禁照片纹理
- 用色块关系表现体积与材质（黏液、腐烂、果冻、金属、感染组织）
- 主色 / 辅色 / 强调色 / 极少量高亮色的有限配色体系
- 远距离轮廓可辨识；明确视觉层级；默认中低复杂度
- 未获要求不得擅自添加皇冠、装甲、武器、翅膀、尾巴、饰品、魔法阵、机械结构等
- 可爱 / 恐怖 / 感染三种情绪只用结构与色块表达，不靠堆细节
- 10 步设计流程（先拆分设计，再写代码）
- 完成后的 A~E 组「MC 美术审查」清单

工具、技能、计划模式、压缩、子代理与工作流行与 ptc 逐行相同：模型仍通过 `run_code` 的 PTC SDK 组合多步操作，`tool-workflow` 与 `tool-ralph` 保持禁用。

## 校验

`agent.cordis.yml` 是同一套插件行的**独立可读副本**，用于审阅与版本化；真正生效的是 profile patch 里的声明行，两者内容一致。

```bash
# 1. 组合层：该行是否进入配置树
dsh --profile web --dump-config | grep -A 5 "id: preset-mc-model"

# 2. 运行时：注册表返回的名单里 broken 必须为 NONE
```

第 2 项不能靠 `dump-config` 或启动日志判断——两者都不会检出坏行（已用含不存在插件的对照 preset 实测确认）。真正的判定来自 `agentPresets/list` RPC：挂载或激活失败会以 `broken` 字段返回，正常时为 `NONE`。同一组阴性对照中，坏 preset 确实被标记为
`nonexistent-row (...): never started`，所以 `NONE` 是有意义的通过信号。

## 维护

上游 ptc 升级后，重新以 `dsh-web-app/presets/ptc.patch.yml` 为基准比对：除 `persona` 外应逐行一致。规范文本只存在于 `persona.prefix` 一处，改规则就改那里，然后同步 profile patch 与这里的副本。

注意 `persona.prefix` 是模板：`{{model}}`、`{{cwd}}` 会在提示词渲染时严格解析，正文里不要出现其他 `{{...}}` 组合。
