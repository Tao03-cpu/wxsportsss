// pages/editProfile/editProfile.js
const CLOUD_DEFAULT_AVATAR_ID='cloud://cloud1-3g5evs3cb978a9b3.636c-cloud1-3g5evs3cb978a9b3-1382768121/avatar/default avatar.jpg'
/* 页面：编辑资料（editProfile）；更新昵称与头像等信息 */
Page({
  data: {
    genderArray: ['保密', '男', '女'],
    profile: {
      avatarUrl: 'cloud://cloud1-3g5evs3cb978a9b3.636c-cloud1-3g5evs3cb978a9b3-1382768121/avatar/default avatar.jpg', // 默认头像路径，用于本地展示
      nickname: '运动达人',
      genderIndex: 0, 
      signature: '我的运动，我做主！',
      _id: null // 数据库记录ID
    },
    // 定义常量用于默认头像路径
    DEFAULT_AVATAR: 'cloud://cloud1-3g5evs3cb978a9b3.636c-cloud1-3g5evs3cb978a9b3-1382768121/avatar/default avatar.jpg' 
  },

  onLoad() {
    this.loadUserProfile(); 
  },
  
  // 从云端加载用户资料
  loadUserProfile() {
    wx.showLoading({ title: '加载中' });
    wx.cloud.callFunction({
        name: 'updateProfile',
        data: { action: 'fetch' },
        success: res => {
            wx.hideLoading();
            if (res.result && res.result.code === 200) {
                const p = res.result.profile;
                this.setData({ profile: {
                    _id: p._id || null,
                    // 确保头像路径兼容：如果云端没有，则使用客户端默认路径
                    avatarUrl: p.avatarUrl || this.data.DEFAULT_AVATAR,
                    nickname: p.nickname || '运动达人',
                    genderIndex: p.genderIndex || 0,
                    signature: p.signature || '我的运动，我做主！'
                } });
            } else { wx.showToast({ title: '资料加载失败', icon: 'none' }); }
        },
        fail: () => { 
            wx.hideLoading(); 
            wx.showToast({ title: '网络错误，加载失败', icon: 'none' }); 
        }
    });
  },

  // 更改头像 (上传到云存储)
  changeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...' });
        
        const timestamp = new Date().getTime();
        const randomNum = Math.floor(Math.random() * 1000);
        const cloudPath = `user_avatars/${timestamp}_${randomNum}.png`;
        
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempFilePath,
          success: uploadRes => {
            const fileID = uploadRes.fileID;
            // 核心：设置 profile.avatarUrl 为云文件ID
            this.setData({ 'profile.avatarUrl': fileID });
            wx.hideLoading();
            wx.showToast({ title: '头像已更新', icon: 'none' });
          },
          fail: err => { 
            wx.hideLoading(); 
            console.error('上传头像失败', err); 
            wx.showToast({ title: '上传失败', icon: 'none' }); 
          }
        });
      }
    });
  },

  changeGender(e) { 
    this.setData({ 'profile.genderIndex': parseInt(e.detail.value) }); 
  },

  editField(e) {
    const field = e.currentTarget.dataset.field;
    
    wx.showModal({
      title: '编辑 ' + (field === 'nickname' ? '昵称' : '签名'),
      editable: true,
      content: this.data.profile[field],
      success: (res) => {
        if (res.confirm && res.content !== null) { 
          // 确保 content 不为 null，即使为空字符串也允许保存
          this.setData({ [`profile.${field}`]: res.content.trim() }); 
        }
      }
    });
  },

  // 保存资料 (调用云函数更新)
  saveProfile() {
    wx.showLoading({ title: '保存中...' });
    
    // 确保昵称不为空
    if (!this.data.profile.nickname.trim()) {
        wx.hideLoading();
        wx.showToast({ title: '昵称不能为空', icon: 'none' });
        return;
    }

    const { _id, ...dataToSave } = this.data.profile; 
    
    // 💡 关键修复：过滤本地占位符路径
    // 如果头像URL仍然是默认的云文件ID（即用户没有点击上传新头像），
    // 那么我们将它从更新荷载中移除，确保数据库不执行无效更新。
    if (dataToSave.avatarUrl === this.data.DEFAULT_AVATAR) {
        // 如果头像没有变，就不要发送这个字段，让它保持数据库中的值
        delete dataToSave.avatarUrl; 
    }
    
    // 检查是否还有其他有效数据需要保存
    if (Object.keys(dataToSave).length === 0) {
        wx.hideLoading();
        wx.showToast({ title: '没有检测到任何修改', icon: 'none' });
        return;
    }

    wx.cloud.callFunction({
        name: 'updateProfile',
        data: { action: 'save', profileData: dataToSave },
        success: res => {
            wx.hideLoading();
            if (res.result && res.result.code === 200) {
                wx.showToast({ title: '保存成功!', icon: 'success' });
                setTimeout(() => { wx.navigateBack(); }, 1000);
            } else { 
                // 确保在保存失败时能够显示明确的错误信息
                wx.showToast({ title: res.result.msg || '保存失败，请检查云函数日志', icon: 'none' }); 
            }
        },
        fail: (err) => { 
            wx.hideLoading(); 
            console.error('云函数调用失败', err);
            wx.showToast({ title: '网络错误，保存失败', icon: 'none' }); 
        }
    });
  }
});
