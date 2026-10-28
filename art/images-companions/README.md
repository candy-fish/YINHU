# 映相 · 鹿与鱼

`映相-全息鹿与鱼.blend` 是可编辑工程。`Images_Companions_Studio` 保留连续蒙皮的鹿、鱼、真实骨架和全息节点材质；旧模型位于隐藏的对比集合，未覆盖用户原场景。

鹿根据用户提供的视频单视角手工重建：长曲颈、微低的口鼻、向背后展开的树枝鹿角、顺着臀部垂下的尾巴，以及细长而克制的后腿折线。躯干与腿部通过体素融合成为连续表面；膝、跗与髋部使用渐变权重。颈部有三段骨骼，低头时使用 `Graze | soft neck volume` 形态键修正体积，避免肩颈被拉成折线。它是从画面重建的模型，并非视频原始模型文件。

`running_body.py` 为当前连续蒙皮增加 `Run | gathered back`、`Run | extended back`，保留 22 根骨骼和肩髋落点。网页将背部收展、身体俯仰、颈部回弹与同侧腿跳跃同步。脚本只导出鹿，并单独保存 companions 场景，不覆盖 Blender 中正在编辑的极光场景。

Blender 的 Action `映相 | 四拍慢行 · 连续蒙皮` 保存一轮 40 帧步态，默认不挂到骨架上，工程打开时为自然站姿。网页使用同一关节角度和逆运动学，随时间轴的实际移动启动或停步，然后张望、低头。鱼用独立尾骨与鳍骨游动。

全息材质分为三层：菲涅尔边缘、原创鳞片纹理 `fish-surface.png`、循环移动的原创字符纹理 `hologram-code.png`。颜色配合网页光路，为浅黄绿及少量冷青。Blender 材质中的 Mapping 位移动画使用线性插值与循环，网页由统一动画时钟驱动相同层次。

## 修改和导出

优先在现有 `.blend` 中编辑。通过 Blender MCP 执行 `export_models.py` 可将当前鹿、鱼以静置骨架导出至 `transition/images/assets/`；工程会保存，原材质及站姿会恢复。仅导出当前场景内选中的模型，不导出默认立方体或参考视频。

页面着色器源文件在 `transition/images/companions-3d.js`。修改后执行 `npm run build:images-companions`，然后刷新本地预览。`npm run build` 也会生成该独立渲染包。网页模型加载或 WebGL 不可用时保留 SVG 回退。

`build_deer.py`、`build_fish.py`、`refine_rig_hologram.py` 与 `rebuild_reference_deer.py` 是本次建模过程的源脚本，后者创建当前连续造型。`retarget_hind_legs.py`、`repair_hind_space.py` 只用于早期分段模型的一次性修正，不应用于当前重建版本。

`node --test tests/images-*.test.mjs` 验证时间轴、存储、步态、实际 GLB 蹄部落点、连续关节权重与鹿角朝向。页面仍为独立本地草稿，没有添加 transition 入口或发布。
