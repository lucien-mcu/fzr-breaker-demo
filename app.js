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
  var companyChips = document.getElementById('companyChips');
  var centerCol = document.querySelector('.center-col');
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
    selectedUnits: [],
    mobileTab: 'map',
    map: null,
    markers: new Map(),
    amapMode: true,
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
    if (S.mobileTab === 'map' && S.map) {
      setTimeout(function () {
        S.map.invalidateSize();
        var vehicle = S.userPickedVehicle && S.vehicleId ? F.vehicleById(S.vehicleId) : null;
        if (vehicle) S.map.setView(pointFor(vehicle), Math.max(S.map.getZoom(), 11));
        else fitCurrentCompany();
      }, 0);
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
    return S.amapMode ? toGcj02(vehicle.lat, vehicle.lng) : [vehicle.lat, vehicle.lng];
  }

  function initMap() {
    S.map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      minZoom: 4,
      maxZoom: 18
    }).setView([22.9, 113.6], 9);

    var cfg = window.FZR_MAP_CONFIG || {};
    S.amapMode = cfg.provider !== 'tianditu' || !cfg.tiandituKey;

    if (S.amapMode) {
      L.tileLayer(
        'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        { subdomains: '1234', maxZoom: 18, attribution: '© 高德地图' }
      ).addTo(S.map);
    } else {
      var tk = encodeURIComponent(cfg.tiandituKey);
      var url = 'https://t{s}.tianditu.gov.cn/{layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile' +
        '&VERSION=1.0.0&LAYER={layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles' +
        '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=' + tk;
      L.tileLayer(url.replace(/\{layer\}/g, 'vec'), {
        subdomains: '01234567', maxZoom: 18, attribution: '© 天地图'
      }).addTo(S.map);
      L.tileLayer(url.replace(/\{layer\}/g, 'cva'), {
        subdomains: '01234567', maxZoom: 18
      }).addTo(S.map);
    }

    document.getElementById('mapZoomIn').addEventListener('click', function () { S.map.zoomIn(); });
    document.getElementById('mapZoomOut').addEventListener('click', function () { S.map.zoomOut(); });
    document.getElementById('mapFit').addEventListener('click', fitCurrentCompany);
  }

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
    S.markers.forEach(function (marker, id) {
      var vehicle = F.vehicleById(id);
      if (vehicle) marker.setIcon(busIcon(vehicle));
    });
  }

  function fitVehicles(vehicles) {
    if (!S.map || vehicles.length === 0) return;
    var points = vehicles.map(pointFor);
    if (points.length === 1) {
      S.map.setView(points[0], 13);
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
  }

  /* ------------------------------ 左侧设备组织 ------------------------------ */
  function renderTree() {
    var key = searchInput.value.trim().toLowerCase();
    var global = F.globalStats();
    var html = '<div class="tree-row root' + (S.companyId === 'ALL' ? ' selected' : '') + '" data-company="ALL">' +
      '<span class="dot online"></span>' +
      '<span>全部设备</span>' +
      '<span class="count">' + global.online + '/' + global.total + '</span>' +
      '</div>';

    var shown = 0;
    F.COMPANIES.forEach(function (company) {
      if (key && company.name.toLowerCase().indexOf(key) < 0) return;
      shown += 1;
      var stats = F.companyStats(company.id);
      var selected = S.companyId === company.id ? ' selected' : '';
      html += '<div class="tree-row' + selected + '" data-company="' + company.id + '">' +
        '<span class="dot ' + (stats.online > 0 ? 'online' : '') + '"></span>' +
        '<span>' + company.name + '</span>' +
        (stats.fault > 0 ? '<span class="fault-tag">故障 ' + stats.fault + '</span>' : '') +
        '<span class="count">' + stats.online + '/' + stats.total + '</span>' +
        '</div>';
    });
    if (shown === 0) {
      html += '<div class="tree-empty">没有匹配的公司</div>';
    }
    treeBox.innerHTML = html;
  }

  treeBox.addEventListener('click', function (event) {
    var row = event.target.closest('[data-company]');
    if (row) setCompany(row.getAttribute('data-company'), false);
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
          (st.fault > 0 ? '<span class="vc-fault">故障 ' + st.fault + '</span>' : '') +
          '<span class="vc-arrow">›</span>' +
        '</div>' +
        '<div class="vc-sub">' + companyName(vehicle.companyId) + ' · ' + vehicle.model + '</div>' +
        '<div class="vc-meta">' +
          '<span>单体 <b>' + st.online + '/' + st.total + '</b></span>' +
          '<span>固件 ' + st.firmware + '</span>' +
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

    var vehicle = F.vehicleById(vehicleId);
    if (vehicle && S.map) {
      S.map.setView(pointFor(vehicle), Math.max(S.map.getZoom(), 11));
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
      '<div class="info-item"><span>最近心跳</span><b>' + nowText(latestSeen(units)) + '</b></div>' +
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
    if (S.map) S.map.invalidateSize();
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
  document.getElementById('loginAccount').focus();
  if (new URLSearchParams(window.location.search).get('demo') === '1') {
    attemptLogin();
  }
})();