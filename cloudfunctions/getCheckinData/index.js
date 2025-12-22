// cloudfunctions/getCheckinData/index.js
const cloud = require('wx-server-sdk');
// ⚠️ 替换为您的云环境ID
cloud.init({ env: 'cloud1-3g5evs3cb978a9b3' }); 
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID; // 获取用户OpenID
  
  const now = new Date();
  const currentYear = event.year || now.getFullYear();
  const currentMonth = event.month || (now.getMonth() + 1); // 1-12
  
  // 1. 计算本周开始日期（以周日为一周开始）
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0); // 设置为周日零点
  
  // 2. 计算本月开始和下月开始时间戳
  const monthStart = new Date(currentYear, currentMonth - 1, 1); // 本月1号零点
  const nextMonthStart = new Date(currentYear, currentMonth, 1); // 下月1号零点

  // 勋章配置（首批上线）
  const BADGES = [
    { badge_id: 'total_5', type: 'total', value: 5, name: '坚持新手', desc: '累计打卡 5 天', icon: '🏅' },
    { badge_id: 'total_15', type: 'total', value: 15, name: '小有成就', desc: '累计打卡 15 天', icon: '🎖️' },
    { badge_id: 'total_30', type: 'total', value: 30, name: '习惯养成', desc: '累计打卡 30 天', icon: '🥇' },
    { badge_id: 'total_60', type: 'total', value: 60, name: '长期主义', desc: '累计打卡 60 天', icon: '🏆' },
    { badge_id: 'total_100', type: 'total', value: 100, name: '无畏达人', desc: '累计打卡 100 天', icon: '🌟' },
    { badge_id: 'streak_7', type: 'streak', value: 7, name: '一周连击', desc: '连续打卡 7 天', icon: '🔥' },
    { badge_id: 'streak_30', type: 'streak', value: 30, name: '月度铁人', desc: '连续打卡 30 天', icon: '⚡' },
    { badge_id: 'week_150', type: 'week', value: 150, name: '周目标达人', desc: '单周运动 ≥150 分钟', icon: '💪' },
    { badge_id: 'week_300', type: 'week', value: 300, name: '周强者', desc: '单周运动 ≥300 分钟', icon: '🏋️' },
  ];

  // 计算连续打卡天数
  const computeStreakDays = (daySet) => {
    if (!daySet || daySet.size === 0) return 0;
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Array.from(daySet).sort((a, b) => b - a); // desc
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let streak = 0;
    let expected = today.getTime();
    for (let ts of days) {
      if (ts === expected) {
        streak += 1;
        expected -= msPerDay;
      } else if (ts < expected) {
        // 遇到断档则停止
        break;
      }
    }
    return streak;
  };

  // 勋章判定
  const grantBadges = async ({ openid, stats }) => {
    const { totalCheckins = 0, streakDays = 0, weeklyDuration = 0 } = stats || {};
    let owned = [];
    try {
      const res = await db.collection('user_badges').where({ _openid: openid }).limit(200).get();
      owned = res.data || [];
    } catch (_) {
      owned = [];
    }
    const ownedIds = new Set((owned || []).map(b => b.badge_id));
    const toGrant = [];
    BADGES.forEach(b => {
      let ok = false;
      if (b.type === 'total' && totalCheckins >= b.value) ok = true;
      if (b.type === 'streak' && streakDays >= b.value) ok = true;
      if (b.type === 'week' && weeklyDuration >= b.value) ok = true;
      if (ok && !ownedIds.has(b.badge_id)) {
        toGrant.push(b);
      }
    });
    // 写入新勋章
    for (const b of toGrant) {
      try {
        await db.collection('user_badges').add({
          data: {
            _openid: openid,
            badge_id: b.badge_id,
            name: b.name,
            desc: b.desc,
            icon: b.icon || '',
            grantedAt: new Date()
          }
        });
      } catch (e) {
        // 如果集合不存在尝试创建一次
        if (String(e).includes('Collection not exists')) {
          try { await db.createCollection('user_badges'); } catch (_) {}
          await db.collection('user_badges').add({
            data: {
              _openid: openid,
              badge_id: b.badge_id,
              name: b.name,
              desc: b.desc,
              icon: b.icon || '',
              grantedAt: new Date()
            }
          });
        }
      }
    }
    const allBadges = owned.concat(toGrant.map(b => ({
      _openid: openid,
      badge_id: b.badge_id,
      name: b.name,
      desc: b.desc,
      icon: b.icon || '',
      grantedAt: new Date()
    })));
    return { allBadges, newBadges: toGrant };
  };

  try {
    // 3A. ❗ FIX: 查询当月所有打卡记录 (仅用于日历显示)
    const monthlyRecordsRes = await db.collection('checkin_records').where({
        _openid: openid,
        // 查询条件：时间戳在当前月范围内
        date: _.gte(monthStart).and(_.lt(nextMonthStart))
    }).limit(1000).get(); 

    // 3B. ❗ FIX: 查询本周所有打卡记录 (用于计算本周时长，确保包含上月记录)
    const weeklyRecordsRes = await db.collection('checkin_records').where({
        _openid: openid,
        // 查询条件：时间戳从本周开始，到当前时间
        date: _.gte(weekStart)
    }).limit(1000).get(); 
    
    let weeklyDuration = 0;
    const checkedInDates = [];
    
    // 统计本周时长
    weeklyRecordsRes.data.forEach(record => {
        // duration 存储的是分钟
        weeklyDuration += record.duration || 0; 
    });

    // 记录当月打卡日期，用于日历显示
    monthlyRecordsRes.data.forEach(record => {
        const recordDate = new Date(record.date);
        const recordDay = recordDate.getDate();
        
        // 记录当月打卡日期，用于日历显示
        if (!checkedInDates.includes(recordDay)) {
            checkedInDates.push(recordDay);
        }
    });

    // 4. 累计打卡天数
    const allRes = await db.collection('checkin_records').where({ _openid: openid }).limit(1000).get();
    const daySet = new Set();
    allRes.data.forEach(r => {
      const d = new Date(r.date);
      d.setHours(0,0,0,0);
      daySet.add(d.getTime());
    });
    const totalCheckins = daySet.size;
    const streakDays = computeStreakDays(daySet);

    // 勋章判定
    const { allBadges, newBadges } = await grantBadges({
      openid,
      stats: {
        totalCheckins,
        streakDays,
        weeklyDuration
      }
    });
    
    return {
        code: 0,
        data: {
            weeklyDuration: weeklyDuration,
            totalCheckins: totalCheckins,
            checkedInDates: checkedInDates,
            streakDays: streakDays,
            badges: allBadges,
            newBadges: newBadges,
            badgeConfigs: BADGES
        }
    };
  } catch (e) {
      console.error(e);
      return {
          code: -1,
          msg: '云函数执行错误',
          error: e.toString()
      };
  }
};
