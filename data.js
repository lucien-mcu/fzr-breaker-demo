/**
 * 福泽尔自动破窗器 —— 手机 H5 演示数据与业务规则。
 * 数据与 Qt 端 MockDeviceRepository / MockDeviceGateway 保持一致，
 * 便于桌面端、APP 端、网页端三端对照演示。
 */
(function (global) {
  'use strict';

  var COMPANIES = [
    { id: 'C001', name: '珠海公交集团', phone: '0756-8888-0001' },
    { id: 'C002', name: '广州客运集团', phone: '020-8666-0002' },
    { id: 'C003', name: '深圳东部公交', phone: '0755-8899-0003' }
  ];

  var VEHICLES = [
    { id: 'V001', companyId: 'C001', plate: '粤C12345', model: '宇通 ZK6125', lat: 22.270, lng: 113.577 },
    { id: 'V002', companyId: 'C001', plate: '粤C23456', model: '金龙 XMQ6127', lat: 22.225, lng: 113.512 },
    { id: 'V003', companyId: 'C002', plate: '粤A88888', model: '比亚迪 B12D', lat: 23.129, lng: 113.264 },
    { id: 'V004', companyId: 'C002', plate: '粤A66666', model: '宇通 ZK6106', lat: 23.086, lng: 113.324 },
    { id: 'V005', companyId: 'C003', plate: '粤B12345', model: '中通 LCK6120', lat: 22.543, lng: 114.058 },
    { id: 'V006', companyId: 'C003', plate: '粤B54321', model: '比亚迪 K8', lat: 22.610, lng: 114.025 }
  ];

  // [id, vehicleId, position, online, healthy, faultMessage, firmware, voltage, minutesAgo]
  var UNIT_SEED = [
    ['U001', 'V001', '左前窗', true, true, '', 'v1.0.3', 12.6, 1],
    ['U002', 'V001', '右前窗', false, true, '', 'v1.0.3', 12.5, 126],
    ['U003', 'V001', '左后窗', true, true, '', 'v1.0.3', 12.7, 2],
    ['U004', 'V001', '右后窗', true, true, '', 'v1.0.2', 12.4, 3],
    ['U005', 'V002', '左前窗', true, true, '', 'v1.0.3', 12.8, 1],
    ['U006', 'V002', '右前窗', true, false, '供电电压异常', 'v1.0.3', 10.8, 4],
    ['U007', 'V002', '左后窗', true, true, '', 'v1.0.3', 12.5, 2],
    ['U008', 'V002', '右后窗', true, true, '', 'v1.0.2', 12.6, 2],
    ['U009', 'V003', '左前窗', true, true, '', 'v1.0.3', 12.7, 1],
    ['U010', 'V003', '右前窗', true, true, '', 'v1.0.3', 12.6, 1],
    ['U011', 'V003', '左中窗', true, true, '', 'v1.0.3', 12.5, 2],
    ['U012', 'V003', '右中窗', true, false, '破窗器自检失败', 'v1.0.3', 12.2, 6],
    ['U013', 'V003', '左后窗', true, true, '', 'v1.0.2', 12.4, 2],
    ['U014', 'V003', '右后窗', true, true, '', 'v1.0.2', 12.5, 3],
    ['U015', 'V004', '左前窗', true, true, '', 'v1.0.3', 12.8, 1],
    ['U016', 'V004', '右前窗', false, true, '', 'v1.0.3', 12.4, 240],
    ['U017', 'V004', '左后窗', true, true, '', 'v1.0.3', 12.6, 2],
    ['U018', 'V004', '右后窗', true, true, '', 'v1.0.3', 12.7, 2],
    ['U019', 'V005', '左前窗', true, true, '', 'v1.0.3', 12.5, 1],
    ['U020', 'V005', '右前窗', true, false, '通讯超时', 'v1.0.2', 12.3, 9],
    ['U021', 'V005', '左后窗', false, true, '', 'v1.0.3', 12.4, 88],
    ['U022', 'V005', '右后窗', true, true, '', 'v1.0.3', 12.6, 2],
    ['U023', 'V006', '左前窗', true, true, '', 'v1.0.3', 12.7, 1],
    ['U024', 'V006', '右前窗', true, true, '', 'v1.0.3', 12.6, 2],
    ['U025', 'V006', '左后窗', false, true, '', 'v1.0.2', 12.2, 65],
    ['U026', 'V006', '右后窗', true, true, '', 'v1.0.3', 12.8, 2]
  ];

  var ACCOUNTS = {
    admin: { password: '123456', name: '系统管理员' },
    TY: { password: '123456', name: '运营值班员' }
  };

  var BREAK_PASSWORD = '888888';
  var UPGRADE_TICKS = 5; // 每 2 秒轮询一次，约 10 秒完成

  var state = {
    loggedIn: false,
    account: '',
    displayName: '',
    companyId: 'ALL',
    vehicleId: '',
    tab: 0,
    selectedUnits: [],
    pollCount: 0,
    units: UNIT_SEED.map(function (row) {
      return {
        id: row[0],
        vehicleId: row[1],
        position: row[2],
        online: row[3],
        healthy: row[4],
        faultMessage: row[5],
        firmware: row[6],
        voltage: row[7],
        lastSeen: Date.now() - row[8] * 60000,
        fired: false,
        upgrade: null // { ticksLeft, target, progress }
      };
    })
  };

  function unitById(id) {
    for (var i = 0; i < state.units.length; ++i) {
      if (state.units[i].id === id) return state.units[i];
    }
    return null;
  }

  function vehicleById(id) {
    for (var i = 0; i < VEHICLES.length; ++i) {
      if (VEHICLES[i].id === id) return VEHICLES[i];
    }
    return null;
  }

  function companyById(id) {
    for (var i = 0; i < COMPANIES.length; ++i) {
      if (COMPANIES[i].id === id) return COMPANIES[i];
    }
    return null;
  }

  function unitsOf(vehicleId) {
    return state.units.filter(function (u) { return u.vehicleId === vehicleId; });
  }

  function vehiclesForCompany(companyId) {
    if (!companyId || companyId === 'ALL') return VEHICLES.slice();
    return VEHICLES.filter(function (v) { return v.companyId === companyId; });
  }

  function computeStats(units) {
    var stats = { total: units.length, online: 0, offline: 0, fault: 0 };
    units.forEach(function (u) {
      if (u.online) stats.online += 1;
      if (!u.healthy) stats.fault += 1;
    });
    stats.offline = stats.total - stats.online;
    return stats;
  }

  function globalStats() {
    return computeStats(state.units);
  }

  function companyStats(companyId) {
    if (!companyId || companyId === 'ALL') return globalStats();
    var ids = {};
    VEHICLES.forEach(function (v) {
      if (v.companyId === companyId) ids[v.id] = true;
    });
    return computeStats(state.units.filter(function (u) { return ids[u.vehicleId]; }));
  }

  function vehicleStats(vehicleId) {
    var units = unitsOf(vehicleId);
    var stats = computeStats(units);
    stats.firmware = units.length > 0 ? units[0].firmware : '-';
    return stats;
  }

  function statusText(unit) {
    if (!unit.healthy) return '故障：' + unit.faultMessage;
    if (unit.upgrade) return '升级中 ' + unit.upgrade.progress + '%';
    if (unit.fired) return '已破窗';
    return '正常';
  }

  function login(account, password) {
    if (!account || !password) {
      return { ok: false, message: '请输入账号和密码' };
    }
    var user = ACCOUNTS[account];
    if (!user || user.password !== password) {
      return { ok: false, message: '账号或密码错误' };
    }
    state.loggedIn = true;
    state.account = account;
    state.displayName = user.name;
    state.companyId = 'ALL';
    state.vehicleId = '';
    state.tab = 0;
    state.selectedUnits = [];
    return { ok: true, message: '登录成功' };
  }

  function logout() {
    state.loggedIn = false;
    state.account = '';
    state.displayName = '';
    state.companyId = 'ALL';
    state.vehicleId = '';
    state.tab = 0;
    state.selectedUnits = [];
  }

  function selectCompany(companyId) {
    state.companyId = companyId || 'ALL';
    state.vehicleId = '';
    state.selectedUnits = [];
  }

  function selectVehicle(vehicleId) {
    state.vehicleId = vehicleId || '';
    state.selectedUnits = [];
  }

  function toggleUnit(unitId, checked) {
    var list = state.selectedUnits.slice();
    var index = list.indexOf(unitId);
    if (checked && index < 0) list.push(unitId);
    if (!checked && index >= 0) list.splice(index, 1);
    state.selectedUnits = list;
  }

  function clearSelection() {
    state.selectedUnits = [];
  }

  function summarize(okCount, failCount, firstError) {
    var result = { ok: failCount === 0, okCount: okCount, failCount: failCount };
    if (failCount === 0) {
      result.message = '操作成功：' + okCount + ' 个单体';
    } else {
      result.message = '成功 ' + okCount + ' 个，失败 ' + failCount + ' 个';
      if (firstError) result.message += '；原因：' + firstError;
    }
    return result;
  }

  function upgrade(unitIds, targetFirmware) {
    if (!unitIds || unitIds.length === 0) {
      return { ok: false, message: '未选择升级目标' };
    }
    if (!targetFirmware) {
      return { ok: false, message: '目标固件版本为空' };
    }

    var okCount = 0;
    var failCount = 0;
    var firstError = '';

    unitIds.forEach(function (id) {
      var unit = unitById(id);
      var error = '';
      if (!unit) {
        error = '单体 ' + id + ' 不存在';
      } else if (!unit.online) {
        error = '单体 ' + id + ' 当前离线，无法升级';
      } else if (unit.upgrade) {
        error = '单体 ' + id + ' 正在升级中';
      }

      if (error) {
        failCount += 1;
        if (!firstError) firstError = error;
        return;
      }

      unit.upgrade = { ticksLeft: UPGRADE_TICKS, target: targetFirmware, progress: 0 };
      okCount += 1;
    });

    return summarize(okCount, failCount, firstError);
  }

  function breakWindow(unitIds, password, reason) {
    if (!unitIds || unitIds.length === 0) {
      return { ok: false, message: '未选择破窗目标' };
    }
    if (password !== BREAK_PASSWORD) {
      return { ok: false, message: '破窗操作密码错误，指令已取消' };
    }

    var okCount = 0;
    var failCount = 0;
    var firstError = '';

    unitIds.forEach(function (id) {
      var unit = unitById(id);
      var error = '';
      if (!unit) {
        error = '单体 ' + id + ' 不存在';
      } else if (!unit.online) {
        error = '单体 ' + id + ' 离线，破窗指令无法送达';
      } else if (!unit.healthy) {
        error = '单体 ' + id + ' 存在故障，禁止破窗';
      } else if (unit.fired) {
        error = '单体 ' + id + ' 已执行过破窗';
      } else if (unit.upgrade) {
        error = '单体 ' + id + ' 正在升级，暂时禁止破窗';
      }

      if (error) {
        failCount += 1;
        if (!firstError) firstError = error;
        return;
      }

      unit.fired = true;
      unit.lastSeen = Date.now();
      okCount += 1;
    });

    var result = summarize(okCount, failCount, firstError);
    result.reason = reason || '';
    return result;
  }

  function poll() {
    state.pollCount += 1;
    var now = Date.now();
    var changed = false;

    state.units.forEach(function (unit) {
      if (unit.online) unit.lastSeen = now;

      if (unit.upgrade) {
        unit.upgrade.ticksLeft -= 1;
        unit.upgrade.progress = Math.round((UPGRADE_TICKS - unit.upgrade.ticksLeft) * 100 / UPGRADE_TICKS);
        changed = true;
        if (unit.upgrade.ticksLeft <= 0) {
          unit.firmware = unit.upgrade.target;
          unit.upgrade = null;
        }
      }
    });

    // 与 Qt Mock 网关一致：U004 每 15 次轮询切换一次在线状态。
    if (state.pollCount % 15 === 0) {
      var u004 = unitById('U004');
      if (u004 && !u004.upgrade) {
        u004.online = !u004.online;
        if (u004.online) u004.lastSeen = now;
        changed = true;
      }
    }

    return changed;
  }

  global.FZR = {
    COMPANIES: COMPANIES,
    VEHICLES: VEHICLES,
    ACCOUNTS: ACCOUNTS,
    BREAK_PASSWORD: BREAK_PASSWORD,
    state: state,
    unitById: unitById,
    vehicleById: vehicleById,
    companyById: companyById,
    unitsOf: unitsOf,
    vehiclesForCompany: vehiclesForCompany,
    globalStats: globalStats,
    companyStats: companyStats,
    vehicleStats: vehicleStats,
    statusText: statusText,
    login: login,
    logout: logout,
    selectCompany: selectCompany,
    selectVehicle: selectVehicle,
    toggleUnit: toggleUnit,
    clearSelection: clearSelection,
    upgrade: upgrade,
    breakWindow: breakWindow,
    poll: poll
  };
})(typeof window !== 'undefined' ? window : globalThis);