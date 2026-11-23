/**
 * 自动破窗器中央管理系统 —— 客户管理端网页版。
 * 与 Qt 桌面端保持同一套界面结构与视觉：顶部导航、四项概览、
 * 设备组织树、真实地图 + 车辆状态表、右侧车辆明细与操作日志。
 */
(function () {
  'use strict';

  var F = window.FZR;

  /* ------------------------------ DOM ------------------------------ */
  var loginView = document.getElementById('loginView');
  var dashboardView = document.getElementById('dashboardView');
  var loginAccount = document.getElementById('loginAccount');
  var loginPassword = document.getElementById('loginPassword');
  var loginError = document.getElementById('loginError');
  var userName = document.getElementById('userName');
  var rolePill = document.getElementById('rolePill');
  var refreshTime = document.getElementById('refreshTime');
  var sidebar = document.getElementById('sidebar');
  var sidebarMask = document.getElementById('sidebarMask');
  var searchInput = document.getElementById('searchInput');
  var treeBox = document.getElementById('tree');
  var statsBox = document.getElementById('stats');
  var mobileStats = document.getElementById('mobileStats');
  var companyChips = document.getElementById('companyChips');
  var centerCol = document.querySelector('.center-col');
  var mapProvider = document.getElementById('mapProvider');
  var mapCompany = document.getElementById('mapCompany');
  var mapSummary = document.getElementById('mapSummary');
  var vehicleTitle = document.getElementById('vehicleTitle');
  var vehicleCount = document.getElementById('vehicleCount');
  var vehicleRows = document.getElementById('vehicleRows');
  var vehicleCards = document.getElementById('vehicleCards');
  var unitCards = document.getElementById('unitCards');
  var detailBackdrop = document.getElementById('detailBackdrop');
  var detailPanel = document.getElementById('detailPanel');
  var detailTitle = document.getElementById('detailTitle');
  var detailSub = document.getElementById('detailSub');
  var detailBadge = document.getElementById('detailBadge');
  var vehicleInfo = document.getElementById('vehicleInfo');
  var unitRows = document.getElementById('unitRows');
  var unitHint = document.getElementById('unitHint');
  var detailLog = document.getElementById('detailLog');
  var upgradeDialog = document.getElementById('upgradeDialog');
  var upgradeTargetText = document.getElementById('upgradeTargetText');
  var upgradeVersion = document.getElementById('upgradeVersion');
  var breakDialog = document.getElementById('breakDialog');
  var breakPassword = document.getElementById('breakPassword');
  var breakReason = document.getElementById('breakReason');
  var breakSafety = document.getElementById('breakSafety');
  var breakSubmit = document.getElementById('breakSubmit');
  var breakError = document.getElementById('breakError');
  var toastBox = document.getElementById('toast');

  /* ------------------------------ 状态 ------------------------------ */
  var S = {
    companyId: 'ALL',
    vehicleId: '',
    userPickedVehicle: false,
    collapsed: {},
    selectedUnits: [],
    mobileTab: 'map',
    map: null,
    markers: new Map(),
    gcjMode: true,
    providerIndex: 0,
    providerBound: false,
    tileLayer: null,
    tileTimer: null,
    fallback: false,
    log: []
  };
  var toastTimer = null;

  /* ------------------------------ 工具 ------------------------------ */
  function showToast(message, ok) {
    toastBox.textContent = message;
    toastBox.className = 'toast' + (ok ? '' : ' err');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastBox.classList.add('hidden'); }, 3200);
  }

  function nowText(ts) {
    var d = ts ? new Date(ts) : new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function updateRefreshTime() {
    if (refreshTime) refreshTime.textContent = '刷新于 ' + nowText().slice(11);
  }

  function appendLog(text) {
    S.log.unshift('[' + nowText().slice(11) + '] ' + text);
    if (S.log.length > 30) S.log.length = 30;
    renderLog();
  }

  function renderLog() {
    if (!detailLog) return;
    if (S.log.length === 0) {
      detailLog.innerHTML = '<div class="empty-log">暂无操作记录</div>';
      return;
    }
    detailLog.innerHTML = S.log.slice(0, 8).map(function (line) {
      return '<div>' + line + '</div>';
    }).join('');
  }

  function companyName(id) {
    var c = F.companyById(id);
    return c ? c.name : '-';
  }

  function companyVehicles(id) {
    if (!id || id === 'ALL') return F.VEHICLES.slice();
    return F.VEHICLES.filter(function (v) { return v.companyId === id; });
  }

  /* 手机端顶部公司筛选：与左侧设备树共用同一个 companyId。 */
  function renderCompanyChips() {
    if (!companyChips) return;
    var items = [{ id: 'ALL', name: '全部公司' }].concat(F.COMPANIES);
    companyChips.innerHTML = items.map(function (c) {
      var active = S.companyId === c.id ? ' active' : '';
      return '<button class="company-chip' + active + '" data-company-chip="' + c.id +
        '" type="button">' + c.name + '</button>';
    }).join('');
  }

  companyChips.addEventListener('click', function (event) {
    var chip = event.target.closest('[data-company-chip]');
    if (chip) setCompany(chip.getAttribute('data-company-chip'), false);
  });

  /* 手机端“地图监控 / 车辆列表”切换；桌面端两栏同时显示。 */
  function setMobileTab(tab) {
    S.mobileTab = tab === 'list' ? 'list' : 'map';
    centerCol.setAttribute('data-mobile-tab', S.mobileTab);
    var buttons = document.querySelectorAll('.mobile-tab');
    for (var i = 0; i < buttons.length; i += 1) {
      var active = buttons[i].getAttribute('data-mobile-tab') === S.mobileTab;
      buttons[i].classList.toggle('active', active);
      buttons[i].setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (S.mobileTab === 'map') {
      if (S.fallback) {
        renderFallbackMap();
      } else if (S.map) {
        setTimeout(function () {
          S.map.invalidateSize();
          var vehicle = S.userPickedVehicle && S.vehicleId ? F.vehicleById(S.vehicleId) : null;
          if (vehicle) S.map.setView(pointFor(vehicle), Math.max(S.map.getZoom(), 11));
          else fitCurrentCompany();
        }, 0);
      }
    }
  }

  var mobileTabs = document.querySelectorAll('.mobile-tab');
  for (var t = 0; t < mobileTabs.length; t += 1) {
    mobileTabs[t].addEventListener('click', function () {
      setMobileTab(this.getAttribute('data-mobile-tab'));
    });
  }

  function latestSeen(units) {
    var latest = 0;
    units.forEach(function (u) { if (u.lastSeen > latest) latest = u.lastSeen; });
    return latest;
  }

  function shortTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ------------------------------ 登录 ------------------------------ */
  function attemptLogin() {
    var result = F.login(loginAccount.value.trim(), loginPassword.value);
    if (!result.ok) {
      loginError.textContent = result.message;
      return;
    }
    loginError.textContent = '';
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    userName.textContent = F.state.displayName;
    rolePill.textContent = F.state.account === 'admin' ? '管理员' : '值班员';
    S.selectedUnits = [];
    S.log = [];
    appendLog('系统已就绪，设备拓扑与状态已加载');

    if (!S.map) initMap();
    requestAnimationFrame(function () {
      if (S.map) S.map.invalidateSize();
      setMobileTab('map');
      setCompany('ALL', true);
      updateRefreshTime();
    });
  }

  function attemptLogout() {
    F.logout();
    dashboardView.classList.add('hidden');
    loginView.classList.remove('hidden');
    closeDetail();
    S.vehicleId = '';
    S.selectedUnits = [];
    loginError.textContent = '';
  }

  document.getElementById('loginBtn').addEventListener('click', attemptLogin);
  loginPassword.addEventListener('keydown', function (e) { if (e.key === 'Enter') attemptLogin(); });
  loginAccount.addEventListener('keydown', function (e) { if (e.key === 'Enter') loginPassword.focus(); });
  document.getElementById('logoutBtn').addEventListener('click', attemptLogout);

  var togglePassword = document.getElementById('togglePassword');
  if (togglePassword) {
    togglePassword.addEventListener('click', function () {
      var showing = loginPassword.type === 'text';
      loginPassword.type = showing ? 'password' : 'text';
      togglePassword.classList.toggle('showing', !showing);
      togglePassword.setAttribute('aria-label', showing ? '显示密码' : '隐藏密码');
      loginPassword.focus();
    });
  }

  var demoFill = document.getElementById('demoFill');
  if (demoFill) {
    demoFill.addEventListener('click', function () {
      loginAccount.value = 'admin';
      loginPassword.value = '123456';
      loginError.textContent = '';
      loginPassword.focus();
    });
  }

  /* ------------------------------ 地图 ------------------------------ */
  var PI = Math.PI;
  var AXIS = 6378245.0;
  var EE = 0.00669342162296594323;

  function outOfChina(lat, lng) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }
  function transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  function transformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }
  function toGcj02(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    var dLat = transformLat(lng - 105.0, lat - 35.0);
    var dLng = transformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * PI;
    var magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((AXIS * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (AXIS / sqrtMagic * Math.cos(radLat) * PI);
    return [lat + dLat, lng + dLng];
  }

  function pointFor(vehicle) {
    return S.gcjMode ? toGcj02(vehicle.lat, vehicle.lng) : [vehicle.lat, vehicle.lng];
  }

  /* 国内瓦片源按顺序自动切换：高德 → 腾讯 → OSM → Carto。
     GCJ-02（高德/腾讯）需要偏移，WGS-84（OSM/Carto）直接用原始坐标。 */
  var TILE_PROVIDERS = [
    {
      id: 'amap', name: '高德地图', gcj: true,
      url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      subdomains: '1234', attribution: '© 高德地图'
    },
    {
      id: 'amap2', name: '高德备线', gcj: true,
      url: 'https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=7',
      subdomains: '1234', attribution: '© 高德地图'
    },
    {
      id: 'arcgis', name: 'ArcGIS 街道图', gcj: false,
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      subdomains: '', attribution: '© Esri'
    },
    {
      id: 'osm', name: 'OpenStreetMap', gcj: false,
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc', attribution: '© OpenStreetMap'
    }
  ];

  function initMap() {
    if (S.fallback) {
      renderFallbackMap();
      return;
    }
    if (typeof L === 'undefined') {
      enableFallbackMap('地图组件未加载，已切换示意图');
      return;
    }

    S.map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      minZoom: 4,
      maxZoom: 18,
      // 手机端保留双指缩放、拖动、双击缩放
      touchZoom: true,
      dragging: true,
      doubleClickZoom: true,
      scrollWheelZoom: true
    }).setView([22.9, 113.6], 9);

    bindMapControls();
    if (!S.providerBound) {
      S.providerBound = true;
      mapProvider.addEventListener('change', function () {
        setTileProvider(Number(this.value), true);
      });
    }
    setTileProvider(0);
  }

  /* 切换瓦片源；某个源被手机网络拦截时自动试下一个，而不是直接掉示意图。 */
  function setTileProvider(index, manual) {
    if (!S.map) return;
    index = Math.max(0, Math.min(TILE_PROVIDERS.length - 1, index));
    var provider = TILE_PROVIDERS[index];

    if (S.tileLayer) {
      S.map.removeLayer(S.tileLayer);
      S.tileLayer = null;
    }
    if (S.tileTimer) {
      clearTimeout(S.tileTimer);
      S.tileTimer = null;
    }

    S.providerIndex = index;
    S.gcjMode = provider.gcj;
    if (mapProvider) mapProvider.value = String(index);

    var layer = L.tileLayer(provider.url, {
      subdomains: provider.subdomains,
      maxZoom: 18,
      attribution: provider.attribution
    });
    S.tileLayer = layer;

    var loaded = false;
    var errors = 0;
    layer.on('tileload', function () { loaded = true; });
    layer.on('tileerror', function () {
      errors += 1;
      if (errors >= 4 && S.providerIndex === index && !S.fallback) {
        if (index + 1 < TILE_PROVIDERS.length) setTileProvider(index + 1);
        else enableFallbackMap('所有地图源都加载失败，请检查网络');
      }
    });
    S.tileTimer = setTimeout(function () {
      if (!loaded && S.providerIndex === index && !S.fallback) {
        if (index + 1 < TILE_PROVIDERS.length) setTileProvider(index + 1);
        else enableFallbackMap('地图瓦片加载超时，请检查网络');
      }
    }, 6000);

    layer.addTo(S.map);
    rebuildMarkers();
    if (!manual) fitCurrentCompany();
  }

  function bindMapControls() {
    document.getElementById('mapZoomIn').addEventListener('click', function () {
      if (S.map) S.map.zoomIn();
    });
    document.getElementById('mapZoomOut').addEventListener('click', function () {
      if (S.map) S.map.zoomOut();
    });
    document.getElementById('mapFit').addEventListener('click', fitCurrentCompany);
  }

  function enableFallbackMap(reason) {
    if (S.fallback) return;
    S.fallback = true;
    if (S.tileTimer) {
      clearTimeout(S.tileTimer);
      S.tileTimer = null;
    }
    S.tileLayer = null;
    if (S.map) {
      try { S.map.remove(); } catch (e) { /* 忽略 Leaflet 清理异常 */ }
      S.map = null;
    }
    S.markers.clear();
    var controls = document.querySelector('.map-controls');
    if (controls) controls.classList.add('hidden');
    if (mapProvider) mapProvider.classList.add('hidden');
    renderFallbackMap();

    var card = document.querySelector('.map-card');
    if (card && !card.querySelector('.fallback-note')) {
      var note = document.createElement('div');
      note.className = 'fallback-note';
      var text = document.createElement('span');
      text.textContent = reason || '示意图模式';
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = '重试真地图';
      retry.addEventListener('click', retryRealMap);
      note.appendChild(text);
      note.appendChild(retry);
      card.appendChild(note);
    }
  }

  function retryRealMap() {
    S.fallback = false;
    if (S.tileTimer) {
      clearTimeout(S.tileTimer);
      S.tileTimer = null;
    }
    S.tileLayer = null;
    if (S.map) {
      try { S.map.remove(); } catch (e) { /* 忽略 */ }
      S.map = null;
    }
    S.markers.clear();
    var note = document.querySelector('.fallback-note');
    if (note) note.remove();
    var controls = document.querySelector('.map-controls');
    if (controls) controls.classList.remove('hidden');
    if (mapProvider) mapProvider.classList.remove('hidden');
    initMap();
  }

  /* 内置珠三角示意图：不依赖网络瓦片，手机端兜底。 */
  function renderFallbackMap() {
    var box = document.getElementById('map');
    if (!box) return;
    var w = Math.max(280, box.clientWidth || 360);
    var h = Math.max(320, box.clientHeight || 480);
    var B = { minLat: 21.9, maxLat: 23.7, minLng: 112.6, maxLng: 114.8 };
    function px(lng) { return ((lng - B.minLng) / (B.maxLng - B.minLng)) * w; }
    function py(lat) { return ((B.maxLat - lat) / (B.maxLat - B.minLat)) * h; }

    var cities = [
      ['广州', 23.129, 113.264, -18, -18, 'end'],
      ['佛山', 23.02, 113.12, -8, 16, 'end'],
      ['东莞', 23.02, 113.75, 8, 14, 'start'],
      ['深圳', 22.543, 114.058, 30, 40, 'start'],
      ['香港', 22.32, 114.17, 6, 14, 'start'],
      ['珠海', 22.27, 113.577, -34, 6, 'end'],
      ['澳门', 22.19, 113.54, -8, 30, 'end'],
      ['中山', 22.52, 113.39, -8, 18, 'end'],
      ['惠州', 23.11, 114.42, 6, 4, 'start'],
      ['江门', 22.58, 113.08, -8, -8, 'end']
    ];
    var roads = [
      [23.129, 113.264, 23.02, 113.12], [23.129, 113.264, 23.02, 113.75],
      [23.02, 113.75, 22.543, 114.058], [22.543, 114.058, 22.32, 114.17],
      [23.129, 113.264, 22.52, 113.39], [22.52, 113.39, 22.27, 113.577],
      [22.52, 113.39, 22.58, 113.08], [23.129, 113.264, 23.11, 114.42]
    ];

    var svg = '<svg class="schematic-map" viewBox="0 0 ' + w + ' ' + h +
      '" preserveAspectRatio="none" role="img" aria-label="珠三角示意图">';
    svg += '<rect width="' + w + '" height="' + h + '" fill="#DCEBF7"/>';

    // 西岸 / 东岸陆地，中间留出珠江口
    svg += '<path d="M0,0 L' + (w * 0.62) + ',0 L' + (w * 0.55) + ',' + (h * 0.3) +
      ' L' + (w * 0.5) + ',' + (h * 0.55) + ' L' + (w * 0.54) + ',' + (h * 0.78) +
      ' L' + (w * 0.42) + ',' + h + ' L0,' + h + ' Z" fill="#EDF3E8"/>';
    svg += '<path d="M' + (w * 0.62) + ',0 L' + w + ',0 L' + w + ',' + (h * 0.7) +
      ' L' + (w * 0.78) + ',' + (h * 0.8) + ' L' + (w * 0.7) + ',' + (h * 0.55) +
      ' L' + (w * 0.56) + ',' + (h * 0.38) + ' Z" fill="#EDF3E8"/>';

    // 珠江
    svg += '<path d="M' + (w * 0.54) + ',0 L' + (w * 0.56) + ',' + (h * 0.28) +
      ' L' + (w * 0.51) + ',' + (h * 0.55) + ' L' + (w * 0.55) + ',' + (h * 0.8) +
      '" fill="none" stroke="#B7D8F0" stroke-width="' + Math.max(10, w * 0.04) +
      '" stroke-linecap="round"/>';

    // 主干道
    roads.forEach(function (r) {
      svg += '<line x1="' + px(r[1]).toFixed(1) + '" y1="' + py(r[0]).toFixed(1) +
        '" x2="' + px(r[3]).toFixed(1) + '" y2="' + py(r[2]).toFixed(1) +
        '" stroke="#F0C27B" stroke-width="2" opacity=".75"/>';
    });

    // 城市
    cities.forEach(function (c) {
      var x = px(c[2]);
      var y = py(c[1]);
      svg += '<circle class="fb-city-dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) +
        '" r="2.6"/>';
      svg += '<text class="fb-city" x="' + (x + c[3]).toFixed(1) + '" y="' + (y + c[4]).toFixed(1) +
        '" text-anchor="' + c[5] + '">' + c[0] + '</text>';
    });

    // 车辆：同一城市的车会重叠，做一点避让 + 引线，保证车牌可读。
    var placed = [];
    function placeVehicle(x, y) {
      var nx = x;
      var ny = y;
      for (var attempt = 0; attempt < 10; attempt += 1) {
        var hit = null;
        for (var j = 0; j < placed.length; j += 1) {
          if (Math.abs(placed[j][0] - nx) < 40 && Math.abs(placed[j][1] - ny) < 34) {
            hit = placed[j];
            break;
          }
        }
        if (!hit) break;

        // 沿着“远离已放置车辆”的方向推开，避免固定偏移又撞回原位。
        var dx = nx - hit[0];
        var dy = ny - hit[1];
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len < 2) {
          dx = attempt % 2 === 0 ? 1 : -1;
          dy = attempt % 3 === 0 ? 1 : -1;
          len = Math.sqrt(dx * dx + dy * dy);
        }
        var push = 34 + attempt * 6;
        nx = hit[0] + (dx / len) * push;
        ny = hit[1] + (dy / len) * push * 0.8;
      }
      placed.push([nx, ny]);
      return [nx, ny];
    }

    companyVehicles(S.companyId).forEach(function (v, index) {
      var st = F.vehicleStats(v.id);
      var color = st.fault > 0 ? '#D64545' : (st.online > 0 ? '#1F9D55' : '#98A2B3');
      var selected = S.vehicleId === v.id ? ' selected' : '';
      var baseX = px(v.lng);
      var baseY = py(v.lat);
      var pos = placeVehicle(baseX, baseY);
      var x = pos[0].toFixed(1);
      var y = pos[1].toFixed(1);
      if (Math.abs(pos[0] - baseX) > 2 || Math.abs(pos[1] - baseY) > 2) {
        svg += '<line x1="' + baseX.toFixed(1) + '" y1="' + baseY.toFixed(1) +
          '" x2="' + x + '" y2="' + y +
          '" stroke="#8FA6BF" stroke-width="1" stroke-dasharray="2 3" opacity=".6"/>';
      }
      var labelY = index % 2 === 0 ? 27 : -15;
      var faultY = index % 2 === 0 ? 39 : -27;
      svg += '<g class="fb-vehicle' + selected + '" data-vehicle="' + v.id +
        '" transform="translate(' + x + ',' + y + ')">' +
        '<rect x="-16" y="-10" width="32" height="17" rx="4" fill="' + color +
        '" stroke="#fff" stroke-width="1.5"/>' +
        '<rect x="-12" y="-7" width="6" height="5" rx="1" fill="#EAF4FF"/>' +
        '<rect x="-4" y="-7" width="6" height="5" rx="1" fill="#EAF4FF"/>' +
        '<rect x="4" y="-7" width="6" height="5" rx="1" fill="#EAF4FF"/>' +
        '<circle cx="-8" cy="8.5" r="2" fill="#22314A"/>' +
        '<circle cx="8" cy="8.5" r="2" fill="#22314A"/>' +
        '<text class="fb-plate" x="0" y="' + labelY + '" text-anchor="middle">' + v.plate + '</text>' +
        (st.fault > 0 ? '<text class="fb-fault" x="0" y="' + faultY +
          '" text-anchor="middle">故障' + st.fault + '</text>' : '') +
        '</g>';
    });

    // 图例（右下角，避开左下角的说明）
    svg += '<g transform="translate(' + (w - 150) + ',' + (h - 14) + ')" class="fb-legend">' +
      '<circle cx="0" cy="0" r="3" fill="#1F9D55"/><text x="7" y="4">在线</text>' +
      '<circle cx="50" cy="0" r="3" fill="#98A2B3"/><text x="57" y="4">离线</text>' +
      '<circle cx="100" cy="0" r="3" fill="#D64545"/><text x="107" y="4">故障</text>' +
      '</g>';
    svg += '</svg>';

    box.innerHTML = svg;
  }

  document.getElementById('map').addEventListener('click', function (event) {
    if (!S.fallback) return;
    var group = event.target.closest ? event.target.closest('[data-vehicle]') : null;
    if (group) selectVehicle(group.getAttribute('data-vehicle'), true);
  });

  function busIcon(vehicle) {
    var st = F.vehicleStats(vehicle.id);
    var color = st.fault > 0 ? '#D64545' : (st.online > 0 ? '#1F9D55' : '#98A2B3');
    var selected = S.vehicleId === vehicle.id ? ' selected' : '';
    var html = '<div class="bus-marker' + selected + '">' +
      '<svg class="bus" width="34" height="18" viewBox="0 0 34 18">' +
        '<rect x="1" y="1.5" width="32" height="13" rx="3.5" fill="' + color +
          '" stroke="#fff" stroke-width="1.4"/>' +
        '<rect x="4" y="4" width="6" height="4.8" rx="1" fill="#EAF4FF"/>' +
        '<rect x="12" y="4" width="6" height="4.8" rx="1" fill="#EAF4FF"/>' +
        '<rect x="20" y="4" width="6" height="4.8" rx="1" fill="#EAF4FF"/>' +
        '<circle cx="8" cy="15.5" r="1.8" fill="#22314A"/>' +
        '<circle cx="26" cy="15.5" r="1.8" fill="#22314A"/>' +
      '</svg>' +
      '<span class="bus-plate">' + vehicle.plate +
        (st.fault > 0 ? '<em>故障' + st.fault + '</em>' : '') + '</span>' +
      '</div>';
    return L.divIcon({ className: 'vehicle-div-icon', html: html, iconSize: null, iconAnchor: [17, 9] });
  }

  function rebuildMarkers() {
    if (S.fallback) { renderFallbackMap(); return; }
    if (!S.map) return;
    S.markers.forEach(function (marker) { S.map.removeLayer(marker); });
    S.markers.clear();
    companyVehicles(S.companyId).forEach(function (vehicle) {
      var marker = L.marker(pointFor(vehicle), {
        icon: busIcon(vehicle), riseOnHover: true, keyboard: false, title: vehicle.plate
      });
      marker.on('click', function () { selectVehicle(vehicle.id, true); });
      marker.addTo(S.map);
      S.markers.set(vehicle.id, marker);
    });
  }

  function updateMarkerIcons() {
    if (S.fallback) { renderFallbackMap(); return; }
    S.markers.forEach(function (marker, id) {
      var vehicle = F.vehicleById(id);
      if (vehicle) marker.setIcon(busIcon(vehicle));
    });
  }

  function fitVehicles(vehicles) {
    if (S.fallback || !S.map || vehicles.length === 0) return;
    var points = vehicles.map(pointFor);
    if (points.length === 1) {
      S.map.setView(points[0], 13);
      if (window.innerWidth <= 860) S.map.panBy([0, -70]);
      return;
    }
    if (window.innerWidth <= 860) {
      S.map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [24, 24],
        paddingBottomRight: [24, 190],
        maxZoom: 12
      });
      return;
    }
    S.map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 12 });
  }

  function fitCurrentCompany() {
    fitVehicles(companyVehicles(S.companyId));
  }

  /* ------------------------------ 概览 ------------------------------ */
  function renderStats() {
    var s = F.globalStats();
    var cards = [
      ['设备总数', s.total, 'navy'],
      ['在线单体', s.online, 'green'],
      ['故障单体', s.fault, 'red'],
      ['离线单体', s.offline, 'gray']
    ];
    statsBox.innerHTML = cards.map(function (c) {
      return '<div class="stat-card ' + c[2] + '">' +
        '<div class="stat-value">' + c[1] + '</div>' +
        '<div class="stat-label">' + c[0] + '</div>' +
        '</div>';
    }).join('');

    if (mobileStats) {
      var mini = [
        ['总数', s.total, 'navy'],
        ['在线', s.online, 'green'],
        ['故障', s.fault, 'red'],
        ['离线', s.offline, 'gray']
      ];
      mobileStats.innerHTML = mini.map(function (c) {
        return '<div class="ms-item ' + c[2] + '"><b>' + c[1] + '</b><span>' + c[0] + '</span></div>';
      }).join('');
    }
  }

  /* ------------------------------ 左侧设备组织 ------------------------------ */
  function renderTree() {
    var key = searchInput.value.trim().toLowerCase();
    var global = F.globalStats();
    var html = '<div class="tree-row root' + (S.companyId === 'ALL' ? ' selected' : '') + '" data-company="ALL">' +
      '<span class="tree-toggle-spacer"></span>' +
      '<span class="dot ' + (global.online > 0 ? 'online' : '') + '"></span>' +
      '<span class="tree-name">全部设备</span>' +
      '<span class="count">' + global.online + '/' + global.total + '</span>' +
      '</div>';

    var shown = 0;
    F.COMPANIES.forEach(function (company) {
      var companyMatch = !key || company.name.toLowerCase().indexOf(key) >= 0;
      var vehicles = F.VEHICLES.filter(function (v) { return v.companyId === company.id; });
      var matchingVehicles = key ? vehicles.filter(function (v) {
        return v.plate.toLowerCase().indexOf(key) >= 0;
      }) : vehicles;
      if (key && !companyMatch && matchingVehicles.length === 0) return;

      shown += 1;
      var stats = F.companyStats(company.id);
      var selected = S.companyId === company.id ? ' selected' : '';
      var collapsed = key ? false : !!S.collapsed[company.id];

      var dotClass = stats.online > 0 ? 'online' : '';
      var countClass = 'count';
      html += '<div class="tree-row company' + selected + '" data-company="' + company.id + '">' +
        '<button class="tree-toggle' + (collapsed ? ' collapsed' : '') + '" type="button" data-toggle="' + company.id + '" aria-label="展开或收起">' +
          '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<span class="dot ' + dotClass + '"></span>' +
        '<span class="tree-name">' + company.name + '</span>' +
        (stats.fault > 0 ? '<span class="fault-tag">' + stats.fault + '</span>' : '') +
        '<span class="' + countClass + '">' + stats.online + '/' + stats.total + '</span>' +
        '</div>';

      if (collapsed) return;

      var list = companyMatch ? vehicles : matchingVehicles;
      list.forEach(function (vehicle) {
        var vst = F.vehicleStats(vehicle.id);
        var vDot = vst.fault > 0 ? 'fault' : (vst.online > 0 ? 'online' : '');
        var vSelected = S.vehicleId === vehicle.id ? ' selected' : '';
        html += '<div class="tree-row vehicle' + vSelected + '" data-vehicle="' + vehicle.id + '">' +
          '<span class="dot ' + vDot + '"></span>' +
          '<span class="tree-plate">' + vehicle.plate + '</span>' +
          '<span class="count">' + vst.online + '/' + vst.total + '</span>' +
          '</div>';
      });
    });

    if (shown === 0) {
      html += '<div class="tree-empty">没有匹配的公司或车辆</div>';
    }
    treeBox.innerHTML = html;
  }

  treeBox.addEventListener('click', function (event) {
    var toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      event.stopPropagation();
      var id = toggle.getAttribute('data-toggle');
      S.collapsed[id] = !S.collapsed[id];
      renderTree();
      return;
    }

    var vehicleRow = event.target.closest('[data-vehicle]');
    if (vehicleRow) {
      var vehicleId = vehicleRow.getAttribute('data-vehicle');
      var vehicle = F.vehicleById(vehicleId);
      if (!vehicle) return;
      if (S.companyId !== 'ALL' && S.companyId !== vehicle.companyId) {
        setCompany(vehicle.companyId, true);
      }
      selectVehicle(vehicleId, true);
      return;
    }

    var row = event.target.closest('[data-company]');
    if (row) {
      var companyId = row.getAttribute('data-company');
      delete S.collapsed[companyId];
      setCompany(companyId, false);
    }
  });

  searchInput.addEventListener('input', renderTree);
  document.getElementById('searchBtn').addEventListener('click', renderTree);

  /* ------------------------------ 车辆状态表 ------------------------------ */
  function renderVehicleTable() {
    var vehicles = companyVehicles(S.companyId);
    var title = S.companyId === 'ALL' ? '全部车辆' : companyName(S.companyId);
    vehicleTitle.textContent = '车辆状态 · ' + title;
    vehicleCount.textContent = '共 ' + vehicles.length + ' 辆';

    if (vehicles.length === 0) {
      vehicleRows.innerHTML = '<tr><td colspan="7" class="muted">当前公司暂无车辆</td></tr>';
      vehicleCards.innerHTML = '<div class="mobile-empty">当前公司暂无车辆</div>';
      return;
    }

    vehicleRows.innerHTML = vehicles.map(function (vehicle) {
      var st = F.vehicleStats(vehicle.id);
      var units = F.unitsOf(vehicle.id);
      var selected = S.vehicleId === vehicle.id ? ' class="selected"' : '';
      return '<tr data-vehicle="' + vehicle.id + '"' + selected + '>' +
        '<td class="plate">' + vehicle.plate + '</td>' +
        '<td>' + companyName(vehicle.companyId) + '</td>' +
        '<td class="' + (st.online > 0 ? 'green' : 'muted') + '">' + (st.online > 0 ? '在线' : '离线') + '</td>' +
        '<td>' + st.online + '/' + st.total + '</td>' +
        '<td class="' + (st.fault > 0 ? 'red' : 'muted') + '">' + (st.fault > 0 ? st.fault : '-') + '</td>' +
        '<td>' + st.firmware + '</td>' +
        '<td class="muted">' + shortTime(latestSeen(units)) + '</td>' +
        '</tr>';
    }).join('');

    vehicleCards.innerHTML = vehicles.map(function (vehicle) {
      var st = F.vehicleStats(vehicle.id);
      var units = F.unitsOf(vehicle.id);
      var selected = S.vehicleId === vehicle.id ? ' selected' : '';
      return '<div class="vehicle-card' + selected + '" data-vehicle="' + vehicle.id +
        '" role="button" tabindex="0">' +
        '<div class="vc-top">' +
          '<b class="vc-plate">' + vehicle.plate + '</b>' +
          '<span class="vc-badge ' + (st.online > 0 ? 'on' : 'off') + '">' +
            (st.online > 0 ? '在线' : '离线') + '</span>' +
        '</div>' +
        '<div class="vc-sub">' + companyName(vehicle.companyId) + ' · ' + vehicle.model + '</div>' +
        '<div class="vc-meta">' +
          '<span>单体 <b>' + st.online + '/' + st.total + '</b></span>' +
          '<span>固件 ' + st.firmware + '</span>' +
          (st.fault > 0 ? '<span class="vc-meta-fault">故障 ' + st.fault + '</span>' : '') +
          '<span>心跳 ' + shortTime(latestSeen(units)) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  vehicleRows.addEventListener('click', function (event) {
    var row = event.target.closest('[data-vehicle]');
    if (row) selectVehicle(row.getAttribute('data-vehicle'), true);
  });

  vehicleCards.addEventListener('click', function (event) {
    var card = event.target.closest('[data-vehicle]');
    if (card) selectVehicle(card.getAttribute('data-vehicle'), true);
  });

  vehicleCards.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var card = event.target.closest('[data-vehicle]');
    if (card) {
      event.preventDefault();
      selectVehicle(card.getAttribute('data-vehicle'), true);
    }
  });

  /* ------------------------------ 公司/车辆选择 ------------------------------ */
  function updateMapOverlay() {
    var vehicles = companyVehicles(S.companyId);
    var online = 0;
    var fault = 0;
    vehicles.forEach(function (v) {
      var st = F.vehicleStats(v.id);
      if (st.online > 0) online += 1;
      if (st.fault > 0) fault += 1;
    });
    mapCompany.textContent = S.companyId === 'ALL' ? '全部公司' : companyName(S.companyId);
    mapSummary.textContent = '车辆 ' + vehicles.length + ' 台 · 在线 ' + online + ' · 故障 ' + fault;
  }

  function setCompany(companyId, initial) {
    S.companyId = companyId || 'ALL';
    S.userPickedVehicle = false;
    S.selectedUnits = [];
    var vehicles = companyVehicles(S.companyId);
    S.vehicleId = vehicles.length > 0 ? vehicles[0].id : '';

    renderTree();
    renderCompanyChips();
    renderStats();
    renderVehicleTable();
    renderDetail();
    updateMapOverlay();
    rebuildMarkers();
    fitCurrentCompany();
    updateRefreshTime();

    if (!initial && window.innerWidth <= 860) closeSidebar();
  }

  function selectVehicle(vehicleId, openPanel) {
    S.vehicleId = vehicleId;
    if (openPanel) S.userPickedVehicle = true;
    S.selectedUnits = [];
    renderVehicleTable();
    renderDetail();
    updateMarkerIcons();
    var picked = F.vehicleById(vehicleId);
    if (picked) delete S.collapsed[picked.companyId];
    renderTree();

    var vehicle = F.vehicleById(vehicleId);
    if (vehicle && S.map) {
      S.map.setView(pointFor(vehicle), Math.max(S.map.getZoom(), 11));
      if (window.innerWidth <= 860) S.map.panBy([0, -60]);
    }
    if (openPanel && window.innerWidth <= 1080) {
      detailPanel.classList.add('open');
      showDetailBackdrop();
    }
    if (window.innerWidth <= 860) closeSidebar();
  }

  function showDetailBackdrop() {
    if (detailBackdrop && window.innerWidth <= 1080) detailBackdrop.classList.remove('hidden');
  }

  function hideDetailBackdrop() {
    if (detailBackdrop) detailBackdrop.classList.add('hidden');
  }

  function closeDetail() {
    detailPanel.classList.remove('open');
    hideDetailBackdrop();
  }

  /* ------------------------------ 右侧明细 ------------------------------ */
  function renderDetail() {
    if (!S.vehicleId) {
      detailTitle.textContent = '未选择车辆';
      detailSub.textContent = '从车辆列表选择一台车';
      detailBadge.textContent = '';
      detailBadge.className = 'status-badge offline';
      vehicleInfo.innerHTML = '';
      unitRows.innerHTML = '';
      unitCards.innerHTML = '';
      unitHint.textContent = '未选择时作用于全部单体';
      return;
    }

    var vehicle = F.vehicleById(S.vehicleId);
    if (!vehicle) { S.vehicleId = ''; renderDetail(); return; }
    var st = F.vehicleStats(vehicle.id);
    var units = F.unitsOf(vehicle.id);

    detailTitle.textContent = vehicle.plate;
    detailSub.textContent = companyName(vehicle.companyId) + ' · ' + vehicle.model;
    detailBadge.textContent = st.online > 0 ? '在线' : '离线';
    detailBadge.className = 'status-badge' + (st.online > 0 ? '' : ' offline');

    vehicleInfo.innerHTML =
      '<div class="info-item"><span>所属公司</span><b>' + companyName(vehicle.companyId) + '</b></div>' +
      '<div class="info-item"><span>车辆编号</span><b>' + vehicle.id + '</b></div>' +
      '<div class="info-item"><span>车型</span><b>' + vehicle.model + '</b></div>' +
      '<div class="info-item"><span>单体总数</span><b>' + st.total + '</b></div>' +
      '<div class="info-item"><span>在线单体</span><b>' + st.online + '</b></div>' +
      '<div class="info-item"><span>故障单体</span><b class="' + (st.fault > 0 ? 'bad' : '') + '">' + st.fault + '</b></div>' +
      '<div class="info-item"><span>最近心跳</span><b>' + shortTime(latestSeen(units)) + '</b></div>' +
      '<div class="info-item"><span>当前固件</span><b>' + st.firmware + '</b></div>';

    unitRows.innerHTML = units.map(function (unit) {
      var checked = S.selectedUnits.indexOf(unit.id) >= 0 ? ' checked' : '';
      var statusClass = !unit.healthy ? 'bad' : (!unit.online ? 'muted' : 'good');
      return '<tr>' +
        '<td><input type="checkbox" data-unit="' + unit.id + '"' + checked + '></td>' +
        '<td>' + unit.position + '</td>' +
        '<td class="muted">' + unit.id + '</td>' +
        '<td class="' + (unit.online ? 'green' : 'muted') + '">' + (unit.online ? '在线' : '离线') + '</td>' +
        '<td class="unit-status ' + statusClass + '">' + F.statusText(unit) + '</td>' +
        '<td>' + unit.firmware + '</td>' +
        '<td>' + Number(unit.voltage).toFixed(1) + ' V</td>' +
        '</tr>';
    }).join('');

    unitCards.innerHTML = units.map(function (unit) {
      var checked = S.selectedUnits.indexOf(unit.id) >= 0 ? ' checked' : '';
      var statusClass = !unit.healthy ? 'bad' : (!unit.online ? 'muted' : 'good');
      return '<label class="unit-card' + (checked ? ' selected' : '') + '">' +
        '<input type="checkbox" data-unit="' + unit.id + '"' + checked + '>' +
        '<div class="uc-main">' +
          '<div class="uc-top">' +
            '<b>' + unit.position + '</b>' +
            '<span class="uc-status ' + statusClass + '">' + F.statusText(unit) + '</span>' +
          '</div>' +
          '<div class="uc-meta">' +
            '<span>' + unit.id + '</span>' +
            '<span>' + (unit.online ? '在线' : '离线') + '</span>' +
            '<span>' + unit.firmware + '</span>' +
            '<span>' + Number(unit.voltage).toFixed(1) + ' V</span>' +
          '</div>' +
        '</div>' +
      '</label>';
    }).join('');

    updateUnitHint();
    renderLog();
  }

  function updateUnitHint() {
    unitHint.textContent = S.selectedUnits.length === 0
      ? '未选择时作用于全部单体'
      : '已选择 ' + S.selectedUnits.length + ' 个单体';
  }

  function handleUnitToggle(event) {
    var box = event.target.closest('input[data-unit]');
    if (!box) return;
    var id = box.getAttribute('data-unit');
    var index = S.selectedUnits.indexOf(id);
    if (box.checked && index < 0) S.selectedUnits.push(id);
    if (!box.checked && index >= 0) S.selectedUnits.splice(index, 1);

    var boxes = document.querySelectorAll('input[data-unit="' + id + '"]');
    for (var i = 0; i < boxes.length; i += 1) {
      boxes[i].checked = box.checked;
      var card = boxes[i].closest('.unit-card');
      if (card) card.classList.toggle('selected', box.checked);
    }
    updateUnitHint();
  }

  unitRows.addEventListener('change', handleUnitToggle);
  unitCards.addEventListener('change', handleUnitToggle);

  document.getElementById('detailClose').addEventListener('click', closeDetail);
  detailBackdrop.addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeDetail();
      closeSidebar();
    }
  });

  function currentTargets() {
    if (S.selectedUnits.length > 0) return S.selectedUnits.slice();
    return F.unitsOf(S.vehicleId).map(function (u) { return u.id; });
  }

  /* ------------------------------ 升级/破窗 ------------------------------ */
  document.getElementById('upgradeBtn').addEventListener('click', function () {
    if (!S.vehicleId) return;
    upgradeTargetText.textContent = '目标单体：' +
      (S.selectedUnits.length === 0 ? '全部' : S.selectedUnits.join('、'));
    upgradeVersion.value = 'v1.1.0';
    upgradeDialog.classList.remove('hidden');
  });
  document.getElementById('upgradeCancel').addEventListener('click', function () {
    upgradeDialog.classList.add('hidden');
  });
  document.getElementById('upgradeSubmit').addEventListener('click', function () {
    var result = F.upgrade(currentTargets(), upgradeVersion.value.trim());
    upgradeDialog.classList.add('hidden');
    showToast(result.message, result.ok);
    appendLog('升级结果：' + result.message);
    renderDetail();
    renderVehicleTable();
    updateMarkerIcons();
  });

  function updateBreakSubmit() {
    breakSubmit.disabled = !(breakSafety.checked && breakPassword.value.length > 0);
  }

  document.getElementById('breakBtn').addEventListener('click', function () {
    if (!S.vehicleId) return;
    breakPassword.value = '';
    breakReason.value = '';
    breakSafety.checked = false;
    breakError.textContent = '';
    updateBreakSubmit();
    breakDialog.classList.remove('hidden');
  });
  breakPassword.addEventListener('input', function () {
    breakError.textContent = '';
    updateBreakSubmit();
  });
  breakSafety.addEventListener('change', updateBreakSubmit);
  document.getElementById('breakCancel').addEventListener('click', function () {
    breakDialog.classList.add('hidden');
  });
  breakSubmit.addEventListener('click', function () {
    // 密码校验通过后才关闭弹窗并下发。
    if (breakPassword.value !== F.BREAK_PASSWORD) {
      breakError.textContent = '破窗操作密码错误，请重新输入';
      breakPassword.focus();
      breakPassword.select();
      return;
    }
    breakError.textContent = '';
    var result = F.breakWindow(currentTargets(), breakPassword.value, breakReason.value.trim());
    breakDialog.classList.add('hidden');
    showToast(result.message, result.ok);
    appendLog('破窗结果：' + result.message);
    renderDetail();
    renderVehicleTable();
    updateMarkerIcons();
  });

  document.getElementById('refreshBtn').addEventListener('click', function () {
    F.poll();
    renderStats();
    renderTree();
    renderVehicleTable();
    renderDetail();
    updateMarkerIcons();
    updateMapOverlay();
    appendLog('手动刷新设备状态');
    showToast('设备状态已刷新', true);
  });

  /* ------------------------------ 侧边栏（手机） ------------------------------ */
  function openSidebar() {
    sidebar.classList.add('open');
    sidebarMask.classList.remove('hidden');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarMask.classList.add('hidden');
  }
  document.getElementById('sidebarToggle').addEventListener('click', function () {
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });
  sidebarMask.addEventListener('click', closeSidebar);

  /* ------------------------------ 轮询 ------------------------------ */
  window.addEventListener('resize', function () {
    if (S.fallback) renderFallbackMap();
    else if (S.map) S.map.invalidateSize();
    if (window.innerWidth > 1080) {
      hideDetailBackdrop();
    } else if (detailPanel.classList.contains('open')) {
      showDetailBackdrop();
    }
  });

  setInterval(function () {
    if (!F.state.loggedIn) return;
    var changed = F.poll();
    updateRefreshTime();
    if (!changed) return;
    renderStats();
    renderTree();
    renderVehicleTable();
    renderDetail();
    updateMarkerIcons();
    updateMapOverlay();
  }, 2000);

  /* ------------------------------ 启动 ------------------------------ */
  if (window.innerWidth > 860) document.getElementById('loginAccount').focus();
  if (new URLSearchParams(window.location.search).get('demo') === '1') {
    attemptLogin();
  }
})();