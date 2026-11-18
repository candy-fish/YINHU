# 旅行地图（映相第二层，本地草稿）

从映相左侧的门进入 `travel.html`。页面仅展示居中的夜间地球，显示直径缩为初版的 0.8 倍。地球以约每秒 0.69° 缓慢自转，城市灯光分区域呼吸与闪动，明暗对比增强，陆地和海洋底色保持稳定。

支持鼠标和单指左右拖动旋转，拖动时暂停自转，松开后继续；键盘左右方向键也可旋转。地球保持初始倾角，竖向拖动不改变倾斜。没有缩放、标记或其他界面内容。空闲时最多约 30 帧/秒，页面隐藏时暂停，系统减少动态效果时停止自转与灯光变化。

修改 `travel.js` 后运行 `npm run build:images-travel`。完整本地构建也会生成地球渲染 bundle。贴图和渲染器均由本地提供，页面无需在线地图服务。

贴图：NASA Earth Observatory，Black Marble 2016 彩色全球夜间灯光图，3600 × 1800 像素。

- 来源：https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/
- 原图：https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg
- 本地文件：`../assets/earth-night-2016.jpg`
