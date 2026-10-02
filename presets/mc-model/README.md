# MC 生物建模 · Agent Preset

在官方 `ptc` preset 基础上派生的 Agent 预设：**工具面完全等于 PTC，只替换人设**。

| 项 | 值 |
|---|---|
| preset id | `mc-model` |
| 安装位置 | `%USERPROFILE%\.dsh\.agent-presets\mc-model\` |
| 来源 | `@deepseek-ai/dsh-agent-presets` 随包 `presets/ptc`（0.1.5-rc.2） |
| 与 ptc 的差异 | 仅 `persona` 行；其余 18 行逐字未改 |

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

工具、技能、计划模式、压缩、子代理与工作流行与 PTC 一致：模型仍通过 `run_code` 的 PTC SDK 组合多步操作，`tool-workflow` 保持禁用。

## 安装

```bash
mkdir -p ~/.dsh/.agent-presets/mc-model
cp presets/mc-model/agent.cordis.yml ~/.dsh/.agent-presets/mc-model/
cp presets/mc-model/preset.yml       ~/.dsh/.agent-presets/mc-model/
```

preset 名单在每次列出时扫描用户根目录，无需重启即可在新建会话的预设选择器中出现（`order: 2`，与 PTC 同级）。

## 校验

```bash
cd ~/.dsh/profiles/web/node_modules
node --input-type=module -e '
import { scanRoot } from "@deepseek-ai/dsh-agent-presets";
const base = new URL("file:///C:/Users/Administrator/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/");
console.log(await scanRoot({ path: "C:/Users/Administrator/.dsh/.agent-presets", trust: "user" }, base));
'
```

预期 `mc-model` 行 `broken: none`。

## 维护

上游 `ptc` 升级后重新比对：本目录的 `agent.cordis.yml` 除 `persona` 外应与官方 `presets/ptc/agent.cordis.yml` 一致。规范文本只存在于这一处，改规则就改 `persona.prefix`。
