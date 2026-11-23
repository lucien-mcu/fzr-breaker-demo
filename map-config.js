/**
 * 地图配置（保留兼容）。
 * 实际瓦片源在 app.js 的 TILE_PROVIDERS 中：
 *   高德 → 高德备线 → ArcGIS 街道图 → OpenStreetMap
 * 某个源被手机网络拦截时会自动切下一个；地图左上角也可以手动切换。
 * 如果要接天地图，在 TILE_PROVIDERS 里加一项并填入自己的 tk 即可。
 */
window.FZR_MAP_CONFIG = {
  provider: 'amap',
  tiandituKey: ''
};