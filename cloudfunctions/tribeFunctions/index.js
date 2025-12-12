// cloudfunctions/tribeFunctions/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }); // 使用动态环境 ID
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action, tribeId, name, slogan, logoUrl } = event;

  // --- 0. 临时管理工具：清空聊天记录 (clearTribeMessages) ---
  if (action === 'clearTribeMessages') {
    try {
      // 改进方案：先查询 ID，再循环批量删除，规避 where({}) 的潜在限制
      const BATCH_SIZE = 50; // 降低批次大小以提高稳定性
      let deletedCount = 0;
      
      while (true) {
        // 先检查集合是否存在（虽然无法直接检查，但查询会抛错或返回空）
        let list;
        try {
          list = await db.collection('tribe_messages')
            .limit(BATCH_SIZE)
            .field({ _id: true })
            .get();
        } catch (queryErr) {
          // 如果查询本身失败（比如集合不存在），则认为已清空或无需操作
          console.error('查询失败，可能集合不存在', queryErr);
          break;
        }
          
        if (!list.data || list.data.length === 0) break;
        
        const ids = list.data.map(item => item._id);
        // 批量删除这批 ID
        await db.collection('tribe_messages').where({
          _id: _.in(ids)
        }).remove();
        
        deletedCount += list.data.length;
      }
      
      return { 
        code: 200, 
        msg: '清理完成', 
        stats: { removed: deletedCount },
        version: '1.2' // 版本号，用于前端验证云函数是否已更新
      };
    } catch (e) {
      console.error('清理失败详情:', e);
      return { code: 500, msg: '清理失败', error: e.toString(), stack: e.stack };
    }
  }

  // --- 1. 获取用户部落信息 (getMyTribeInfo) ---
  if (action === 'getMyTribeInfo') {
    try {
      // 1.1 查询用户是否已加入部落 (查找 user_tribe 集合)
      const userTribeRes = await db.collection('user_tribe').where({ _openid: openid }).limit(1).get();

      if (userTribeRes.data.length === 0) {
        // 用户未加入部落，返回 isJoined: false
        return { code: 200, data: { isJoined: false } };
      }

      const userTribeData = userTribeRes.data[0];
      const currentTribeId = userTribeData.tribeId;

      // 1.2 查询部落详细信息 (查找 tribe 集合)
      const tribeRes = await db.collection('tribe').doc(currentTribeId).get();
      const tribeInfo = tribeRes.data;

      // 1.3 准备个人贡献数据 (模拟周榜统计)
      const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
      const myWeekStats = await db.collection('sport_records').where({ 
          _openid: openid, 
          date: _.gte(weekAgo) 
      }).get();
      const weekDuration = myWeekStats.data.reduce((acc, record) => acc + record.duration, 0); // 汇总分钟

      const myContribution = {
          totalDuration: userTribeData.totalDuration || 0, // 累计时长
          weekDuration: weekDuration,                      // 本周时长
          myRank: 5, // 生产环境需复杂的聚合查询计算排名
      };

      return {
          code: 200,
          data: {
              isJoined: true,
              tribeInfo: {
                  ...tribeInfo,
                  myRole: userTribeData.role || '成员'
              },
              myContribution: myContribution,
              tribeWeekStats: [] // 周榜数据
          }
      };

    } catch (e) {
      console.error('获取部落信息失败', e);
      // 即使服务器错误，也返回未加入状态，确保前端不崩溃
      return { code: 200, data: { isJoined: false }, msg: '获取数据失败，视为未加入' }; 
    }
  }

  // --- 2. 退出部落 (exitTribe) ---
  if (action === 'exitTribe') {
    if (!tribeId) return { code: 400, msg: '缺少部落ID' };
    
    try {
      // 从 user_tribe 集合中删除该用户的记录
      await db.collection('user_tribe').where({ _openid: openid, tribeId: tribeId }).remove();
      return { code: 200, msg: '退出部落成功' };
    } catch (e) {
      return { code: 500, msg: '退出操作失败' };
    }
  }

  // --- 3. 创建部落 (createTribe) ---
  if (action === 'createTribe') {
    if (!name) return { code: 400, msg: '缺少部落名称' };
    try {
      const addRes = await db.collection('tribe').add({
        data: {
          name,
          slogan: slogan || '',
          logoUrl: logoUrl || '',
          memberCount: 1,
          creatorOpenid: openid,
          createTime: db.serverDate()
        }
      });
      const newId = addRes._id;
      await db.collection('user_tribe').add({ data: { _openid: openid, tribeId: newId, role: '创建者', createTime: db.serverDate() } });
      return { code: 200, msg: '创建成功', data: { tribeId: newId } };
    } catch (e) {
      console.error('createTribe error', e);
      return { code: 500, msg: '创建失败', error: e.toString() };
    }
  }

  // --- 4. 部落列表 (listTribes) ---
  if (action === 'listTribes') {
    try {
      const res = await db.collection('tribe').orderBy('memberCount', 'desc').limit(50).get();
      return { code: 200, data: res.data };
    } catch (e) {
      console.error('listTribes error', e);
      return { code: 500, msg: '列表获取失败', error: e.toString() };
    }
  }

  // --- 4.1 发送聊天消息 (sendMessage) ---
  if (action === 'sendMessage') {
    const { content = '', tId } = event;
    const tid = tId || tribeId;
    if (!tid || !String(content).trim()) return { code: 400, msg: '缺少部落ID或内容为空' };
    try {
      // 拉取用户资料用于昵称和头像
      let profile = {};
      try {
        const p = await db.collection('user_profiles').where({ _openid: openid }).limit(1).get();
        profile = p.data[0] || {};
      } catch (_) {}

      try {
        await db.collection('tribe_messages').add({
        data: {
          tribe_id: tid,
          content: String(content).trim(),
          sender_name: profile.nickname || '群友',
          sender_avatar: profile.avatarUrl || '',
          sender_id: openid,
          create_time: db.serverDate(),
          type: 'text'
        }
        });
      } catch (addErr) {
        try {
          await db.createCollection('tribe_messages');
          await db.collection('tribe_messages').add({
            data: {
              tribe_id: tid,
              content: String(content).trim(),
              sender_name: profile.nickname || '群友',
              sender_avatar: profile.avatarUrl || '',
              sender_id: openid,
              create_time: db.serverDate(),
              type: 'text'
            }
          });
        } catch (ensureErr) {
          throw ensureErr;
        }
      }
      return { code: 200, msg: 'ok' };
    } catch (e) {
      console.error('sendMessage error', e);
      return { code: 500, msg: '发送失败', error: e.toString() };
    }
  }

  // --- 5. 更新部落信息 (updateTribeInfo) ---
  if (action === 'updateTribeInfo') {
    if (!tribeId) return { code: 400, msg: '缺少部落ID' };
    try {
      const rel = await db.collection('user_tribe').where({ _openid: openid, tribeId }).limit(1).get();
      const role = rel.data.length ? (rel.data[0].role || '成员') : '成员';
      if (role !== '创建者' && role !== '管理员') {
        return { code: 403, msg: '权限不足' };
      }
      const payload = {};
      if (name !== undefined) payload.name = name;
      if (slogan !== undefined) payload.slogan = slogan;
      if (logoUrl !== undefined) payload.logoUrl = logoUrl;
      await db.collection('tribe').doc(tribeId).update({ data: payload });
      return { code: 200, msg: '更新成功' };
    } catch (e) {
      console.error('updateTribeInfo error', e);
      return { code: 500, msg: '更新失败', error: e.toString() };
    }
  }

  // --- 6. 生成邀请二维码 (getInviteQr) ---
  if (action === 'getInviteQr') {
    if (!tribeId) return { code: 400, msg: '缺少部落ID' };
    try {
      const scene = `tid=${tribeId}`;
      const page = 'pages/tribeDetail/tribeDetail';
      const qrRes = await cloud.openapi.wxacode.getUnlimited({ scene, page, width: 480 });
      const filePath = `tribe_invites/${tribeId}_${Date.now()}.png`;
      const upload = await cloud.uploadFile({ cloudPath: filePath, fileContent: qrRes.buffer });
      return { code: 200, data: { fileID: upload.fileID } };
    } catch (e) {
      console.error('getInviteQr error', e);
      return { code: 500, msg: '二维码生成失败', error: e.toString() };
    }
  }

  // --- 7. 获取部落详情 (getTribeById) ---
  if (action === 'getTribeById') {
    if (!tribeId) return { code: 400, msg: '缺少部落ID' };
    try {
      const t = await db.collection('tribe').doc(tribeId).get();
      return { code: 200, data: t.data };
    } catch (e) {
      console.error('getTribeById error', e);
      return { code: 500, msg: '获取失败', error: e.toString() };
    }
  }

  // --- 8. 获取部落动态 (getTribeFeed) ---
  if (action === 'getTribeFeed') {
    if (!tribeId) return { code: 400, msg: '缺少部落ID' };
    try {
      const res = await db.collection('tribe_feed').where({ tribeId }).orderBy('createTime', 'desc').limit(50).get();
      return { code: 200, data: res.data || [] };
    } catch (e) {
      // 如果集合不存在或无权限，返回空数组防止前端报错
      console.error('getTribeFeed error', e);
      return { code: 200, data: [] };
    }
  }

  // --- 9. 发布动态 (createFeed) ---
  if (action === 'createFeed') {
    const { content = '', images = [], tags = [], tribeId: tId } = event;
    const tid = tId || tribeId;
    if (!tid || !content.trim()) return { code: 400, msg: '缺少部落ID或内容为空' };
    try {
      // 获取作者资料（若无则留空）
      let profile = {};
      try {
        const p = await db.collection('user_profiles').where({ _openid: openid }).limit(1).get();
        profile = p.data[0] || {};
      } catch (_) {}
      await db.collection('tribe_feed').add({
        data: {
          tribeId: tid,
          content: content,
          images: images || [],
          tags: tags || [],
          authorOpenid: openid,
          authorName: profile.nickname || '成员',
          authorAvatar: profile.avatarUrl || '',
          createTime: db.serverDate()
        }
      });
      return { code: 200, msg: '发布成功' };
    } catch (e) {
      console.error('createFeed error', e);
      return { code: 500, msg: '发布失败', error: e.toString() };
    }
  }

  // --- 10. 获取侧边信息 (getTribeMeta) ---
  if (action === 'getTribeMeta') {
    const tid = tribeId;
    if (!tid) return { code: 400, msg: '缺少部落ID' };
    try {
      // 热点标签：从最近 100 条动态解析 tags 或 #话题#
      const feeds = await db.collection('tribe_feed').where({ tribeId: tid }).orderBy('createTime','desc').limit(100).get();
      const tagCount = {};
      const leaders = {};
      feeds.data.forEach(f => {
        const tags = Array.isArray(f.tags) ? f.tags : [];
        if (tags.length === 0 && typeof f.content === 'string') {
          const matches = f.content.match(/#([^#\s]{1,12})/g) || [];
          matches.forEach(m => tags.push(m.replace('#','')));
        }
        tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
        const key = f.authorOpenid || 'anon';
        if (!leaders[key]) leaders[key] = { name: f.authorName || '成员', avatar: f.authorAvatar || '', score: 0 };
        leaders[key].score += 1; // 以发帖数作为活跃度
      });
      const hotTags = Object.keys(tagCount).map(k => ({ tag: k, count: tagCount[k] }))
        .sort((a,b)=>b.count-a.count).slice(0,6);
      const leaderboard = Object.values(leaders).sort((a,b)=>b.score-a.score).slice(0,5);

      // 活动日历：读取 tribe_events，若无则返回空数组
      let events = [];
      try {
        const now = new Date();
        events = (await db.collection('tribe_events').where({ tribeId: tid, date: _.gte(now) }).orderBy('date','asc').limit(5).get()).data || [];
      } catch (_) {}

      // 新手区：静态链接占位
      const newbie = [
        { title: '部落规则', link: '/pages/tribeAnnouncements/tribeAnnouncements' },
        { title: '打卡教程', link: '/pages/sports/sports' }
      ];

      return { code: 200, data: { hotTags, events, leaderboard, newbie } };
    } catch (e) {
      console.error('getTribeMeta error', e);
      return { code: 200, data: { hotTags: [], events: [], leaderboard: [], newbie: [] } };
    }
  }

  return { code: 400, msg: '未知操作' };
};
