# 旅行地图（映相第二层，本地草稿）

从映相左侧的门进入 `travel.html`。页面展示居中的夜间地球，底部铺设低矮月面前景，模拟站在月球表面观察地球。地球显示直径缩为初版的 0.8 倍，以约每秒 0.69° 缓慢自转，城市灯光分区域呼吸与闪动，明暗对比增强，陆地和海洋底色保持稳定。

支持鼠标和单指左右拖动旋转，拖动时暂停自转，松开后继续；键盘左右方向键也可旋转。地球保持初始倾角，竖向拖动不改变倾斜。没有缩放、标记或其他界面内容。空闲时最多约 30 帧/秒，页面隐藏时暂停，系统减少动态效果时停止自转与灯光变化。

修改 `travel.js` 后运行 `npm run build:images-travel`。完整本地构建也会生成地球渲染 bundle。贴图和渲染器均由本地提供，页面无需在线地图服务。

贴图：NASA Earth Observatory，Black Marble 2016 彩色全球夜间灯光图，3600 × 1800 像素。

- 来源：https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/
- 原图：https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg
- 本地文件：`../assets/earth-night-2016.jpg`

月面前景：使用内置 imagegen 生成的透明背景月壤素材 `../assets/lunar-foreground.png`，作为固定在底部的正交平面与地球在同一 WebGL 帧内合成，不拦截地球的拖动操作。

生成提示词（内置 imagegen，透明背景）：

> Create a photorealistic lunar surface foreground cutout asset for a website. Very wide panoramic 3:1 aspect ratio. The lower 65% is solid continuous lunar terrain extending all the way to left/right/bottom edges with NO transparency inside the terrain. The upper 35% is truly transparent empty sky, not black. Horizon is gently convex: near x0 at 50% image height, rises gradually toward center to 32% image height, slopes gradually to x100 at 50%. A natural subtle irregular ridge silhouette, no towering peaks. View from a person standing on the Moon, eye level low above dusty gray regolith, looking toward distant low lunar hills. Fine gritty powder, scattered tiny stones and shallow eroded craters, foreground detailed but not cluttered. Lunar surface lit softly by a low grazing light from upper left, subdued cool neutral gray, deep small crater shadows, realistic photographic texture, no blue glow, no sunlight flare. Dark understated material, retain visible surface detail. IMPORTANT only terrain asset: no Earth, no planet, no star field, no astronauts, no spacecraft, no text, no borders, no other objects. The sky must be transparent alpha, crisp natural horizon. This will be placed as a narrow foreground strip at bottom of a black scene of Earth seen from Moon.
