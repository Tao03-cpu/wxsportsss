/*
  页面：部落聊天（tribeChat）
  作用：实时聊天室，监听 tribe_messages 集合，支持发送消息并触发 AI 回复。
*/
const app = getApp();
const db = wx.cloud.database();

// AI 调用改为云函数（aiBot），前端不再直连第三方接口

const OFFLINE_REPLIES = [
  '加油！今天的汗水是明天的底气！',
  '生命在于运动，哪怕多走一步也是进步。',
  '我在呢！虽然网络有点卡，但我的支持不掉线！',
  '坚持下去，你一定会感谢现在的自己。',
  '运动完记得拉伸哦，保护身体很重要。',
  '不论快慢，只要在路上，就是最好的开始。',
  '今天感觉怎么样？状态不错的话再加一组？',
  '我在听！你的努力我都看在眼里！'
];

Page({
  data: {
    tribeId: '',
    tribeName: '聊天室',
    messages: [],
    avatarMap: {},      // openid -> 头像
    nameMap: {},        // openid -> 昵称（从 user_profiles 读取最新）
    inputText: '',
    openid: '',
    scrollTarget: '',
    keyboardHeight: 0,
    userInfo: {},
    inputFocus: false,
    isLoginReady: false,
    botAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Helper&backgroundColor=ffdfbf'
  },

  onLoad(options) {
    const tribeId = options.id || '';
    this.setData({ tribeId: tribeId, tribeName: options.name || '部落群聊' });
    if (options.name) wx.setNavigationBarTitle({ title: options.name });
    
    // 1. 优先获取 OpenID
    wx.cloud.callFunction({ name: 'userLogin' }).then(res => {
      // 兼容两种返回结构：
      const openid = res.result.openid || (res.result.data && res.result.data._openid);
      
      if (openid) {
        this.setData({ 
          openid: openid,
          isLoginReady: true 
        });
      } else {
        console.error('无法获取有效OpenID', res);
        this.setData({ isLoginReady: true });
      }
    }).catch(err => {
      console.error('获取OpenID失败', err);
      this.setData({ isLoginReady: true });
    });

    this.initWatch();

    if (tribeId) {
       this.populateChat(tribeId);
    }

    this.loadBotAvatar();
  },

  onShow() {
    // 每次进入页面时（包括从其他页面返回）都刷新用户信息
    this.refreshUserInfo();
  },

  refreshUserInfo() {
    wx.cloud.callFunction({ name: 'updateProfile', data: { action: 'fetch' } }).then(res => {
      const p = (res.result && (res.result.profile || res.result.data)) || {};
      this.setData({ userInfo: p });
      console.log('onShow 刷新用户信息:', p); 
    }).catch(err => console.error('刷新用户信息失败', err));
  },

  onUnload() {
    if (this.watcher) this.watcher.close();
  },

  populateChat(tribeId) {
    wx.cloud.callFunction({
      name: 'aiBot',
      data: { action: 'populate', tribeId: tribeId }
    }).catch(err => console.log('填充数据失败', err));
  },

  initWatch() {
    const that = this;
    // 修正：不再按 _openid 过滤，确保能看到所有人的消息
    this.watcher = db.collection('tribe_messages')
      .where({ tribe_id: this.data.tribeId })
      .orderBy('create_time', 'asc')
      .limit(50)
      .watch({
        onChange: function(snapshot) {
          if (snapshot.docs.length > 0) {
            that.setData({ messages: snapshot.docs });
            // 同步刷新头像映射，确保历史消息显示最新头像
            that.updateAvatarMap(snapshot.docs);
            that.scrollToBottom();
          }
        },
        onError: function(err) {
          console.error('监听消息失败', err);
        }
      });
  },

  // 根据消息中的 sender_id 拉取最新的用户头像并建立映射
  updateAvatarMap(msgs) {
    try {
      const _ = db.command;
      const ids = Array.from(new Set((msgs || []).map(m => m.sender_id).filter(id => !!id && id !== 'AI_BOT' && !String(id).startsWith('mock_'))));
      if (ids.length === 0) return;
      db.collection('user_profiles')
        .where({ _openid: _.in(ids) })
        .field({ _openid: true, avatarUrl: true, nickname: true })
        .get()
        .then(res => {
          const avatarMap = { ...this.data.avatarMap };
          const nameMap = { ...this.data.nameMap };
          (res.data || []).forEach(p => {
            if (!p._openid) return;
            avatarMap[p._openid] = p.avatarUrl || avatarMap[p._openid] || '';
            nameMap[p._openid] = p.nickname || nameMap[p._openid] || '';
          });
          this.setData({ avatarMap, nameMap });
        })
        .catch(err => console.error('头像映射更新失败', err));
    } catch (e) {
      console.error('updateAvatarMap 异常', e);
    }
  },

  loadBotAvatar() {
    db.collection('bot_profiles').where({ name: '燃动小助手' }).limit(1).get()
      .then(res => {
        const url = (res.data && res.data[0] && res.data[0].avatarUrl) || '';
        if (url) this.setData({ botAvatar: url });
      })
      .catch(() => {});
  },

  onInput(e) { this.setData({ inputText: e.detail.value }); },

  onAvatarTap(e) {
    const isBot = !!e.currentTarget.dataset.bot;
    if (isBot) {
      const toAdd = `@燃动小助手 `;
      if (!this.data.inputText.includes(toAdd)) {
        this.setData({ inputText: this.data.inputText + toAdd, inputFocus: true });
      }
      return;
    }
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [url] });
  },

  sendMessage() {
    // 1. 确保登录信息，如缺失则尝试获取后继续
    if (!this.data.openid) {
      wx.cloud.callFunction({ name: 'userLogin' }).then(res => {
        const openid = res.result.openid || (res.result.data && res.result.data._openid);
        if (openid) this.setData({ openid });
        this._doSend();
      }).catch(() => { wx.showToast({ title: '连接失败', icon: 'none' }); });
      return;
    }
    this._doSend();
  },

  _doSend() {

    const content = this.data.inputText.trim();
    if (!content) return;

    // 修复头像获取逻辑：完全信任 userInfo 中的 avatarUrl
    let userAvatar = '';
    if (this.data.userInfo && this.data.userInfo.avatarUrl) {
        userAvatar = this.data.userInfo.avatarUrl;
    }

    console.log('发送消息，携带头像:', userAvatar); // 调试日志

    const msg = {
      tribe_id: this.data.tribeId,
      content: content,
      sender_name: this.data.userInfo.nickname || '群友',
      sender_avatar: userAvatar,
      sender_id: this.data.openid, 
      create_time: db.serverDate(),
      type: 'text'
    };

    // 通过云函数发送，规避客户端权限问题
    wx.cloud.callFunction({
      name: 'tribeFunctions',
      data: { action: 'sendMessage', tId: this.data.tribeId, content }
    }).then(() => {
      this.setData({ inputText: '' });
      this.scrollToBottom();
      if (content.includes('@燃动小助手')) this.callAiDirectly(content);
    }).catch(err => {
      console.error('发送失败详情', err);
      wx.showToast({ title: '发送失败', icon: 'none' });
    });
  },

  // 通过云函数调用 AI
  callAiDirectly(userMsg) {
    const history = this.data.messages.slice(-3);
    wx.cloud.callFunction({
      name: 'aiBot',
      data: {
        action: 'chat',
        message: userMsg,
        tribeId: this.data.tribeId,
        history: history,
        timeoutMs: 15000,
        retries: 2
      }
    }).then(res => {
      // 云函数会将 AI 回复直接写入 tribe_messages 集合
      if (!(res.result && res.result.code === 200)) {
        this.fallbackReply(userMsg);
      }
    }).catch(err => {
      console.error('云函数 aiBot 调用失败', err);
      this.fallbackReply(userMsg);
    });
  },

  saveAiResponse(text) {
    db.collection('tribe_messages').add({
      data: {
        tribe_id: this.data.tribeId,
        content: text,
        sender_name: '燃动小助手',
        sender_avatar: this.data.botAvatar,
        sender_id: 'AI_BOT',
        create_time: db.serverDate(),
        type: 'text'
      }
    }).catch(console.error);
  },

  fallbackReply(userMsg) {
    const keywords = {
      '你好': '你好呀！即使网络不好，我也在哦！',
      '运动': '生命在于运动，加油！',
      '减肥': '管住嘴，迈开腿，你一定行！',
      '跑步': '跑步是很好的有氧运动，注意保护膝盖哦。',
      '打卡': '打卡成功！坚持就是胜利！',
      '有人': '我在呢！大家都在忙着运动吧？'
    };
    
    let aiText = '';
    for (let k in keywords) {
      if (userMsg.includes(k)) {
        aiText = keywords[k];
        break;
      }
    }

    if (!aiText) {
      const randomIndex = Math.floor(Math.random() * OFFLINE_REPLIES.length);
      aiText = OFFLINE_REPLIES[randomIndex];
    }

    // 延迟写入，模拟思考
    setTimeout(() => {
      this.saveAiResponse(aiText);
    }, 1000);
  },

  scrollToBottom() {
    setTimeout(() => {
      this.setData({ scrollTarget: 'bottom-anchor' });
    }, 100);
  },

  onFocus(e) { this.setData({ keyboardHeight: e.detail.height }); this.scrollToBottom(); },
  onBlur() { this.setData({ keyboardHeight: 0, inputFocus: false }); }
});
