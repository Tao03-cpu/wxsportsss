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
    
    return {
        code: 0,
        data: {
            weeklyDuration: weeklyDuration,
            totalCheckins: daySet.size,
            checkedInDates: checkedInDates,
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
