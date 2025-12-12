// cloudfunctions/recordSportSession/index.js
//记录运动数据
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3g5evs3cb978a9b3' }); // 替换为您的云环境ID
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  // checkinDate 现在是必需的，由客户端传过来
  const { duration, steps, checkinDate } = event; 

  if (!duration || !checkinDate) {
      // ❗ FIX: checkinDate 也是必需的
      return { code: 400, msg: '缺少必要的运动数据 (duration 或 checkinDate)' };
  }

  // --- A. 写入新的打卡记录 ---
  // 归一化为当天零点，避免跨时区导致日期偏移
  const d = new Date(checkinDate);
  try { d.setHours(0,0,0,0); } catch(_) {}
  const recordData = {
      _openid: openid,
      duration: duration,
      steps: steps || 0,
      date: d,
      createTime: db.serverDate()
  };
  
  try {
      await db.collection('checkin_records').add({ data: recordData });
      
      // --- B. 更新 user_profiles 汇总数据 ---
      // 假设 duration > 0 意味着一次有效打卡
      const updateData = {
          // 累计打卡次数 +1
          totalCheckIns: _.inc(1), 
          // 累计本周时长
          weekDuration: _.inc(duration), 
          // 覆盖今日步数 (如果步数统计更复杂，可能需要单独的统计逻辑)
          todaySteps: steps,
          lastUpdateTime: db.serverDate()
      };

      // 使用 upsert 确保用户数据存在：如果不存在则创建，如果存在则更新
      await db.collection('user_profiles').where({ _openid: openid }).update({
          data: updateData
      }).then(res => {
          if (res.stats.updated === 0) {
              // 如果没有更新，说明记录不存在，则创建新记录
              return db.collection('user_profiles').add({
                  data: {
                      _openid: openid,
                      totalCheckIns: 1,
                      weekDuration: duration,
                      todaySteps: steps,
                      // 初始化其他字段...
                      createTime: db.serverDate()
                  }
              });
          }
      });

      return { code: 200, msg: '运动记录和统计数据同步成功' };

  } catch (e) {
      console.error('运动数据同步失败:', e);
      return { code: 500, msg: '运动数据同步失败', error: e };
  }
};
