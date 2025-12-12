/* 页面：意见反馈（feedback）；提交用户反馈与建议 */
Page({
  data: {
    types: ['功能建议', '程序 Bug', '其他问题'],
    typeIndex: 0,
    content: '',
    contact: ''
  },

  selectType(e) {
    this.setData({ typeIndex: parseInt(e.currentTarget.dataset.index) });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  submitFeedback() {
    if (this.data.content.length < 5) {
      wx.showToast({ title: '描述不能少于5个字', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });
    
    const feedbackData = {
        type: this.data.types[this.data.typeIndex],
        content: this.data.content,
        contact: this.data.contact
    };

    // 调用云函数 submitFeedback
    wx.cloud.callFunction({
        name: 'submitFeedback', 
        data: feedbackData,
        success: res => {
            wx.hideLoading();
            if (res.result && res.result.code === 200) {
                wx.showToast({ title: '提交成功，感谢您的反馈!', icon: 'success' });
                // 清空表单
                this.setData({ content: '', contact: '', typeIndex: 0 });
                // 延迟返回，让用户看到成功提示
                setTimeout(() => { wx.navigateBack(); }, 1000);
            } else {
                wx.showToast({ title: res.result.msg || '提交失败', icon: 'none' });
            }
        },
        fail: err => {
            wx.hideLoading();
            console.error('云函数调用失败', err);
            wx.showToast({ title: '网络错误，提交失败', icon: 'none' });
        }
    });
  }
});
