App({
  onLaunch() {
    this.globalData = {
      // 在微信开发者工具的云开发面板中复制环境 ID 到这里。
      env: "",
      cloudReady: false,
    };

    if (!wx.cloud) {
      console.warn("当前基础库不支持云开发，PETLY 将使用本地缓存模式");
      return;
    }

    if (!this.globalData.env) {
      console.info("未配置云开发环境 ID，PETLY 将使用本地缓存模式");
      return;
    }

    wx.cloud.init({ env: this.globalData.env, traceUser: true });
    this.globalData.cloudReady = true;
  },
});
