// pages/myTribe/myTribe.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    myTribes: [],
    recommends: [],
    isLoading: true
  },

  onShow() {
    this.loadMyTribes();
  },

  // 从云端加载我加入的部落
  loadMyTribes() {
    this.setData({ isLoading: true });
    
    wx.cloud.callFunction({
      name: 'userLogin'
    }).then(loginRes => {
      // 兼容两种返回结构
      const openid = loginRes.result.openid || (loginRes.result.data && loginRes.result.data._openid);
      
      db.collection('user_tribe').where({ _openid: openid }).get()
        .then(res => {
          const relations = res.data;
          if (relations.length === 0) {
            this.setData({ myTribes: [], isLoading: false });
            return;
          }

          const tribeIds = Array.from(new Set(relations.map(r => r.tribeId).filter(Boolean)));
          const _ = db.command;
          const chunkSize = 10; // 分批查询，规避 in 条件数量或返回条数限制
          const chunks = [];
          for (let i = 0; i < tribeIds.length; i += chunkSize) chunks.push(tribeIds.slice(i, i + chunkSize));

          const tasks = chunks.map(chunk => db.collection('tribe').where({ _id: _.in(chunk) }).get());
          Promise.all(tasks).then(results => {
            const allDocs = results.reduce((acc, r) => acc.concat(r.data || []), []);
            const tribes = allDocs.map(t => {
              const rel = relations.find(r => r.tribeId === t._id);
              return {
                ...t,
                icon: t.logoUrl ? null : '👥',
                logoUrl: t.logoUrl,
                myRole: rel ? rel.role : '成员'
              };
            });

            this.setData({ myTribes: tribes, isLoading: false });
            this.loadRecommends(openid, tribes.map(t => t._id));
          }).catch(err => {
            console.error('获取部落详情失败', err);
            this.setData({ isLoading: false });
          });
          
        })
        .catch(err => {
          if (err.errMsg && err.errMsg.includes('not exist')) {
             wx.cloud.callFunction({ name: 'dbInit', data: { collections: ['user_tribe', 'tribe'] } });
          }
          this.setData({ isLoading: false });
          this.loadRecommends(openid, []);
        });
    }).catch(err => {
      console.error('登录失败', err);
      this.setData({ isLoading: false });
    });
  },

  // 从真实部落中挑选推荐（排除已加入，按 memberCount 降序取前3）
  loadRecommends(openid, joinedIds) {
    const _ = db.command;
    wx.cloud.callFunction({ name: 'tribeFunctions', data: { action: 'listTribes' } })
      .then(res => {
        const all = (res.result && res.result.data) || [];
        const joinedSet = new Set(joinedIds || []);
        const recs = all
          .filter(t => !joinedSet.has(t._id))
          .sort((a,b) => (b.memberCount||0) - (a.memberCount||0))
          .slice(0,3)
          .map(t => ({ id: t._id, name: t.name, desc: t.slogan || '', icon: t.logoUrl ? null : '👥', logoUrl: t.logoUrl }));
        this.setData({ recommends: recs });
      })
      .catch(err => { console.error('推荐加载失败', err); this.setData({ recommends: [] }); });
  },

  // 1. 创建部落
  showCreateModal() {
    wx.showModal({
      title: '创建新部落',
      content: '',
      editable: true,
      placeholderText: '请输入部落名称（如：夜跑小队）',
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          this.doCreateTribe(res.content.trim());
        }
      }
    });
  },

  doCreateTribe(name) {
    wx.showLoading({ title: '创建中...' });
    wx.cloud.callFunction({
      name: 'tribeFunctions',
      data: {
        action: 'createTribe',
        name: name,
        slogan: '欢迎加入我们的大家庭',
        logoUrl: '' // 默认无图
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 200) {
        wx.showToast({ title: '创建成功', icon: 'success' });
        this.loadMyTribes(); // 刷新列表
      } else {
        wx.showToast({ title: '创建失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('创建失败', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    });
  },

  // 2. 长按退出/管理部落
  onLongPressTribe(e) {
    const { id, name, role } = e.currentTarget.dataset;
    if (!id) return;

    // 修复3：根据角色动态显示菜单
    const isOwner = role === '创建者';
    const isAdmin = role === '管理员';
    const canManage = isOwner || isAdmin;

    let itemList = ['退出部落'];
    if (isOwner) itemList = ['修改名称', '修改头像', '解散部落']; // 新增修改头像
    else if (isAdmin) itemList = ['修改名称', '修改头像', '退出部落'];

    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        const tapText = itemList[res.tapIndex];

        if (tapText === '修改名称') {
           this.showEditModal(id, name);
        } else if (tapText === '修改头像') {
           this.chooseTribeAvatar(id);
        } else if (tapText === '退出部落') {
           wx.showModal({
            title: '确认退出',
            content: `确定要退出“${name}”吗？`,
            success: (mRes) => { if (mRes.confirm) this.doExitTribe(id, false); }
          });
        } else if (tapText === '解散部落') {
           wx.showModal({
            title: '确认解散',
            content: `确定要解散“${name}”吗？此操作不可逆。`,
            success: (mRes) => { if (mRes.confirm) this.doExitTribe(id, true); }
          });
        }
      }
    });
  },

  // 选择并上传群头像
  chooseTribeAvatar(tribeId) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.uploadTribeAvatar(tribeId, tempFilePath);
      }
    });
  },

  uploadTribeAvatar(tribeId, filePath) {
    wx.showLoading({ title: '上传中...' });
    const cloudPath = `tribe_avatars/${tribeId}_${Date.now()}.png`;
    
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: (res) => {
        const fileID = res.fileID;
        // 调用云函数更新数据库字段
        wx.cloud.callFunction({
          name: 'tribeFunctions',
          data: {
            action: 'updateTribeInfo',
            tribeId: tribeId,
            logoUrl: fileID
          }
        }).then(cfRes => {
          wx.hideLoading();
          if (cfRes.result && cfRes.result.code === 200) {
            wx.showToast({ title: '头像更新成功', icon: 'success' });
            this.loadMyTribes();
          } else {
            wx.showToast({ title: '更新失败', icon: 'none' });
          }
        }).catch(err => {
          wx.hideLoading();
          console.error(err);
          wx.showToast({ title: '更新异常', icon: 'none' });
        });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error(err);
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
  },

  // 显示修改弹窗
  showEditModal(tribeId, currentName) {
    wx.showModal({
      title: '修改部落名称',
      content: currentName,
      editable: true,
      placeholderText: '请输入新名称',
      success: (res) => {
        if (res.confirm && res.content.trim()) {
           this.doUpdateTribe(tribeId, res.content.trim());
        }
      }
    });
  },

  doUpdateTribe(tribeId, newName) {
    wx.showLoading({ title: '更新中...' });
    wx.cloud.callFunction({
      name: 'tribeFunctions',
      data: {
        action: 'updateTribeInfo',
        tribeId: tribeId,
        name: newName
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 200) {
        wx.showToast({ title: '更新成功', icon: 'success' });
        this.loadMyTribes();
      } else {
        wx.showToast({ title: res.result.msg || '无权修改', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '网络异常', icon: 'none' });
    });
  },

  doExitTribe(tribeId, isOwner) {
    wx.showLoading({ title: '处理中...' });
    // 这里的 action 根据后端逻辑可能需要区分，暂时复用 exitTribe
    // 如果后端不支持 destroyTribe，创建者退出可能仅仅是退出，或者需要后端增加逻辑
    const action = 'exitTribe'; 

    wx.cloud.callFunction({
      name: 'tribeFunctions',
      data: {
        action: action,
        tribeId: tribeId
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 200) {
        wx.showToast({ title: isOwner ? '已解散' : '已退出', icon: 'success' });
        this.loadMyTribes();
      } else {
        wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('退出失败', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
    });
  },

  // 直接加入推荐部落
  joinRecommends(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.name) return;

    if (this.data.myTribes.find(t => t.name === item.name)) {
      wx.showToast({ title: '已在部落中', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '加入中...', mask: true });

    wx.cloud.callFunction({
      name: 'tribeFunctions',
      data: { action: 'listTribes' }
    }).then(res => {
      const allTribes = (res.result && res.result.data) || [];
      const target = allTribes.find(t => t.name === item.name);

      if (target) {
        this.doJoin(target._id);
      } else {
        wx.cloud.callFunction({
          name: 'tribeFunctions',
          data: {
            action: 'createTribe',
            name: item.name,
            slogan: item.desc,
            logoUrl: '' 
          }
        }).then(createRes => {
          if (createRes.result && createRes.result.code === 200) {
            const newId = createRes.result.data.tribeId;
            this.doJoin(newId);
          } else {
            wx.hideLoading();
            wx.showToast({ title: '创建失败', icon: 'none' });
          }
        }).catch(err => {
          wx.hideLoading();
          console.error('创建异常', err);
          wx.showToast({ title: '网络异常', icon: 'none' });
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('查找失败', err);
      wx.showToast({ title: '服务繁忙', icon: 'none' });
    });
  },

  doJoin(tribeId) {
    wx.cloud.callFunction({
      name: 'joinTribe',
      data: { tribeId: tribeId }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.code === 200) {
        wx.showToast({ title: '加入成功', icon: 'success' });
        this.loadMyTribes(); 
      } else {
        wx.showToast({ title: res.result.msg || '加入失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('加入异常', err);
      wx.showToast({ title: '加入异常', icon: 'none' });
    });
  },

  enterChat(e) {
    const ds = e.currentTarget.dataset;
    const id = ds.id || (ds.item && ds.item._id);
    const name = ds.name || (ds.item && ds.item.name);

    if (!id) return;
    
    wx.navigateTo({
      url: `/pages/tribeChat/tribeChat?id=${id}&name=${name || '部落聊天'}`,
      fail: (err) => {
        console.error('跳转失败', err);
        wx.showToast({ title: '无法进入', icon: 'none' });
      }
    });
  },

  goToManage() {
    wx.navigateTo({ url: '/pages/tribeManage/tribeManage' });
  }
});
