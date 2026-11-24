# 旅行地图（映相第二层）

从映相左侧的门进入 `travel.html`。页面展示居中的夜间地球，底部铺设低矮月面前景，模拟站在月球表面观察地球。地球显示直径经过三次 0.8 倍缩小，为初版的 0.512 倍，以约每秒 0.69° 缓慢自转，城市灯光分区域呼吸与闪动，明暗对比增强，陆地和海洋底色保持稳定。右上角无文字的返回图标可回到映相主页面。

支持鼠标和单指左右拖动旋转，拖动时暂停自转，松开后继续；键盘左右方向键也可旋转。地球保持初始倾角，竖向拖动不改变倾斜。空闲时最多约 30 帧/秒，页面隐藏或打开涂色地图时暂停，系统减少动态效果时停止自转与灯光变化。

左上角颜料盘打开全球行政区划图。地点信息按国家/地区、省州、下一级行政区显示，附带对齐的经纬度。指针位置使用地图投影反算坐标，键盘聚焦时使用该行政区的标注坐标。右上角的双层方框返回地球。

页面底部始终呈现三排色块：上排 18 档灰度、中排 18 档饱和度、下排 18 种主色。点击右下角笔形图标后，分块平滑连接为三条连续色条，分别拖动调明暗、饱和度和色相。饱和度条随当前主色和明度更新，从灰色过渡到鲜艳颜色。左侧大色块和 HEX 代号实时预览调色结果，可输入任意六位十六进制颜色；橡皮工具可清除地区颜色。所有滑条均支持键盘调节。关闭绘制模式时恢复分块展示。

支持拖动平移、滚轮/双指/无底色按钮缩放，以及键盘方向键移动、加减键缩放；行政区可通过键盘聚焦后按 Enter 或空格填色。缩放直接更新 SVG viewBox，边界按当前屏幕分辨率绘制，避免 CSS 整体图层放大导致的模糊。

颜色使用现有 YINHU Supabase 项目的独立 `travel-colors` Edge Function 与 `blackdoor_travel_regions` 表共享，不使用浏览器本地存储作为数据源。按行政区独立保存，版本冲突时显示其他设备最新颜色，保存失败会撤回临时填色。地图打开时每 12 秒刷新，页面重新获得焦点时也刷新。函数内检查站点 publishable key，数据表开启 RLS 并撤销浏览器角色直接读写权限，仅服务端访问。

行政区数据：Natural Earth v5.1.1 Admin 1，4,596 个一级行政区，保留岛屿与多边形孔洞。使用等距圆柱投影；为网页展示简化细节，地区 ID 保持不变。

底图保留黑白线稿风格。放大至 3 倍时，按视野加载下一级行政边界，子区可独立查看和填色。目前覆盖 172 个国家和地区，共 67,090 个子区；没有合适细分数据的地区保留原有层级。中国采用 CTAmap 的地级行政区及直辖市区县数据，其余来源与许可见 `map-sources.html`。细分数据位于 `../assets/admin2/`，使用与 Natural Earth 底图相同的投影。

- 数据说明：https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/
- 官方 GeoJSON：https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_states_provinces.geojson
- 本地地图文件：`../assets/world-admin1.json`
- 重新准备：下载原始行政区 GeoJSON 到 `.cache/travel-map/admin1-source.json`，海岸与国界分别缓存为 `.cache/travel-map/ne_10m_coastline.json`、`.cache/travel-map/ne_10m_admin_0_boundary_lines_land.json`，运行 `node scripts/prepare-travel-map.mjs`。原始数据位于官方仓库 `geojson/` 目录。
- 验证：`node --test tests/travel-colors.test.mjs`。

修改 `travel.js` 后运行 `npm run build:images-travel`。完整本地构建也会生成地球渲染 bundle。贴图和渲染器均由本地提供，页面无需在线地图服务。

贴图：NASA Earth Observatory，Black Marble 2016 彩色全球夜间灯光图，3600 × 1800 像素。

- 来源：https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/
- 原图：https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg
- 本地文件：`../assets/earth-night-2016.jpg`

月面前景：使用内置 imagegen 生成的透明背景月壤素材 `../assets/lunar-foreground.png`，作为固定在底部的正交平面与地球在同一 WebGL 帧内合成，不拦截地球的拖动操作。

生成提示词（内置 imagegen，透明背景）：

> Create a photorealistic lunar surface foreground cutout asset for a website. Very wide panoramic 3:1 aspect ratio. The lower 65% is solid continuous lunar terrain extending all the way to left/right/bottom edges with NO transparency inside the terrain. The upper 35% is truly transparent empty sky, not black. Horizon is gently convex: near x0 at 50% image height, rises gradually toward center to 32% image height, slopes gradually to x100 at 50%. A natural subtle irregular ridge silhouette, no towering peaks. View from a person standing on the Moon, eye level low above dusty gray regolith, looking toward distant low lunar hills. Fine gritty powder, scattered tiny stones and shallow eroded craters, foreground detailed but not cluttered. Lunar surface lit softly by a low grazing light from upper left, subdued cool neutral gray, deep small crater shadows, realistic photographic texture, no blue glow, no sunlight flare. Dark understated material, retain visible surface detail. IMPORTANT only terrain asset: no Earth, no planet, no star field, no astronauts, no spacecraft, no text, no borders, no other objects. The sky must be transparent alpha, crisp natural horizon. This will be placed as a narrow foreground strip at bottom of a black scene of Earth seen from Moon.
