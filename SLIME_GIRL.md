# 史莱姆少女 · Slime Girl

A hand-built Minecraft **Bedrock / GeckoLib** character: a chibi slime girl with translucent blue
gel hair, an oversized black sleeve dress, thigh-high boots, and a small cube slime she carries.
参考设定图还原的 Q 版史莱姆少女：半透明蓝色果冻长发、黑色宽袖连衣裙、过膝长靴，外加一只随身的方块史莱姆。

| file | what |
|---|---|
| `slime_girl.bbmodel` | editable Blockbench project — 5.0 format, bedrock, per-face UV, two embedded textures, all 7 clips |
| `slime_girl.geo.json` | game-ready geometry (`geometry.slime_girl`, format 1.12.0) |
| `slime_girl.animation.json` | 7 clips (`animation.slime_girl.*`, format 1.8.0) |
| `slime_girl.png` | 128x128 base atlas |
| `slime_girl_glow.png` | 128x128 emissive atlas, identical UVs |
| `docs/slimegirl_front.png` · `slimegirl_side.png` · `slimegirl_34.png` · `slimegirl_atlas.png` | rasterised previews |
| `examples/slime_girl/` | drop-in Bedrock client entity + render controller |
| `build_slimegirl.js` · `tools/sg_*.js` | everything is generated: `node build_slimegirl.js` rebuilds all five artifacts |

## 1. 造型 / The design

**比例.** 头 14 单位、身体 14 单位、连呆毛总高 39 单位（2.44 格），脚底在 y = 0。这是设定图里
Q 版比例的直接换算：头几乎占到整体一半，脸宽 14 单位。

**脸.** 5x3 像素的深蓝色大眼睛，带一道纯白高光和一圈青色反光；上面是 1 像素的眉毛，下面是腮红
和 2x1 的微笑。眼睛、眉毛、腮红、嘴巴都是**独立骨骼**，所以动画可以单独移动或替换它们。

**果冻长发.** 全部由 2 单位的立方体簇拼成：刘海 6 条（下缘高低错落）、两侧各一条 6 段的发柱
（下面接 5 段逐级前移的渐细滴落）、脑后一条发板 + 3 条垂到小腿的发尾，再加呆毛和 4 块漂浮的
大像素方块。发丝一共占 22 个骨骼级立方体簇，所以每一缕都能独立滞后于头部。

**服装.** 黑色连衣裙 = 髋部块（裙摆）+ 胸部块（上衣），下摆前 3 后 3 共 6 片百褶，胸口两条细带，
一圈立领；袖口是明显大于手臂的宽袖，腕上有黑色绑带；腿上是过膝长靴，靴口与裙摆之间露出大腿。

**果冻感.** 半透明质感靠三件事同时做到：蓝色调色板里连续的 9 级明暗、每块贴图上按噪声铺出的
色块、以及边缘处的亮水线和底部暗色积水。眼睛高光、果冻里的亮点和方块史莱姆内核是自发光层。

## 2. 骨骼与动画 / Rig and clips

* 32 骨骼 / 124 立方体，包围盒 `x -12..11, y 0..40, z -11..11`（约 2.44 格高），双脚落在 y = 0。
* 骨骼树：`root → body → {hips → leg_l/leg_r, chest → {head → {bangs, sidehair_l/r, backhair, ahoge,
  ear_l/r, eye_l/r, brow_l/r, blush, mouth, 4 个漂浮方块, 6 个果冻团}, arm_l/arm_r}}`。
* 位移单位是模型单位（16 = 1 格），旋转是角度，缩放是倍率。

| clip | 时长 | 循环 | 内容 |
|---|---|---|---|
| `idle` | 4.0 s | 是 | 呼吸起伏、身体轻摆、发丝/果冻团带相位滞后飘动 |
| `move` | 1.0 s | 是 | 一次挤压—弹跳—落地—回稳，头发整体上扬后落下 |
| `attack` | 1.25 s | 否 | 后仰蓄力 → 前冲伸手 → 长袖甩动 → 回收 |
| `skill` | 1.6 s | 否 | 漂浮方块与果冻团向内收拢 → 爆发放大 → 回落 |
| `spawn` | 1.4 s | 否 | 从 y -8 的塌形状态弹起并压低后回正 |
| `death` | 1.2 s | 否 | 下沉、倒向一侧、整体压扁并维持 |
| `sit` | 1.6 s | 否 | 下蹲坐地，双腿前折，双手撑在身侧 |

## 3. 贴图 / Texture

一张 128x128 图集，116 块工位，全部由 `tools/sg_texture.js` 用同一套「噪声场 → 调色板阶梯」
函数画出来：每块贴图先铺材质色块，再压上重力线索（上缘亮水线、下缘积水），最后撒几个硬的 1 像素
高光。工位尺寸**不是手写的**：`tools/sg_atlas.js` 在某个面第一次出现新尺寸时自动派生一块同尺寸的工位
（名字形如 `hair@3x2`），所以每个面的投影恒为 1 像素 = 1 模型单位，不会被拉伸。校验器会复核这一点。

`slime_girl_glow.png` 用完全相同的 UV：只有眼睛高光、果冻方块里的亮点是自发光，其余透明。

## 4. 接入 / Using it

**Blockbench:** 直接打开 `slime_girl.bbmodel` —— 骨骼树、两张贴图和 7 段动画都已内嵌。

**Bedrock 资源包:** `slime_girl.geo.json` 放到 `models/entity/`，两张 PNG 放同一目录，客户端实体指向
`geometry.slime_girl` 与 `animation.slime_girl.*`。`examples/slime_girl/` 里有现成的实体定义和渲染控制器。
自发光层需要第二个材质，渲染控制器里把眼骨单独指到 glow 材质即可。

**GeckoLib:** `GeoModel` + `GeoAnimatable`，动画绑定到 `idle` / `move` / `attack` / `skill` / `spawn` /
`death` / `sit`。

## 5. 重建与校验 / Rebuild and verify

```bash
node build_slimegirl.js        # 重新生成全部产物 + build/slimegirl_report.json（有闪面就拒绝写出）
node tools/preview_slimegirl.js # 渲染正/侧/45 度预览 + 图集预览 + ASCII 轮廓
node tools/verify_slimegirl.js  # 独立校验，exit 0 = 无 FAIL
```

全部内容都是代码：`tools/lib/`（PNG 编解码、画布与调色板、UV 约定、bbmodel/geo/animation 写入、
闪面审计）、`tools/sg_atlas.js`（工位表）、`tools/sg_geometry.js`（骨骼）、`tools/sg_texture.js`（绘制）、
`tools/sg_animations.js`（7 段动画）。改一个数，重跑构建即可。

## 6. 贴图闪烁 / Texture flicker

两个面共面且朝向相同时会抢同一个深度值，逐帧闪。`tools/lib/zfight.js` 会枚举所有共面且同向的暴露
重叠面，`build_slimegirl.js` 在写出前先跑一遍，只要还剩一对就抛错。最终模型**0 对**：

* 上下相接的部件（髋部块与胸部块、裙摆与百褶）用**对接**而不是重叠——对接面朝向相反，永不闪。
* 叠在衣服上的皮肤（大腿、手臂）向内缩 0.2 单位：肉眼不可见，但平面不再重合。
* 贴在身上的装饰（眼睛、腮红、嘴巴、腰包、裙摆像素块）向外凸出 0.4~0.7 单位，并省略背面。
* 悬挂的果冻滴落每段前后错开 0.4 单位，左右错开 0.5 单位，既做出渐细也避开共面。

## 7. 已知取舍 / Honest notes

* 模型是**实体面片**，不是真正的透明渲染：果冻感靠颜色与自发光层表现，所以要真正半透明，需要在
  资源包里给发丝骨骼单独指定一个带 alpha 的材质（几何本身不需要改）。
* 17 条构建警告全部是「非整数尺寸」，都是有意为之的装饰厚度或 0.2 单位的防闪内缩，不是几何错误。
* `slime_girl.animation.json` 有 412 KB：发丝、漂浮方块和果冻团是**采样**成曲线（每段 12~16 个关键帧）
  而不是手工打点，因为相位滞后本身就是观感重点。写入器会按容差丢掉共线关键帧。
* 未验证的部分：游戏内实机表现、Blockbench GUI 里的骨骼树外观。几何、UV、动画目标、地面接触和
  贴图统计都已由 `tools/verify_slimegirl.js` 独立复核（36 项，全部通过）。
