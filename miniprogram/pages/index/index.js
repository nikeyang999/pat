const createDefaultState = () => ({
  activeTab: 0,
  currentPet: { name: "豆包", type: "柯基犬", age: "2岁3个月", weight: "12.8", weightChange: "+0.3kg", daysTogether: "826", nextVisit: "10.18", avatar: "../../images/avatar.png" },
  tasks: [
    { id: 1, title: "早晚各一次散步", time: "今天 08:00 - 20:00", kind: "walk", kindLabel: "日常", done: false },
    { id: 2, title: "补充饮水", time: "已完成 2 / 3 次", kind: "water", kindLabel: "饮食", done: true },
    { id: 3, title: "体外驱虫提醒", time: "还有 6 天 · 10月18日", kind: "health", kindLabel: "健康", done: false }
  ],
  records: [
    { id: 1, title: "体重记录", detail: "12.8 kg · 比上次增加 0.2 kg", date: "今天", color: "dot-peach" },
    { id: 2, title: "完成疫苗接种", detail: "狂犬疫苗 · 宠爱有家医院", date: "09.21", color: "dot-green" },
    { id: 3, title: "快乐的一天", detail: "公园散步 42 分钟", date: "09.18", color: "dot-blue" }
  ],
  posts: [
    { id: 1, avatar: "🐕", name: "可乐妈", time: "12分钟前", text: "周末带可乐去江边放风，今天的风刚刚好。", imageEmoji: "☀️🐕", imageTone: "image-sky", likes: 28, comments: 6, liked: false, followed: false },
    { id: 2, avatar: "🐈", name: "橘子汽水", time: "1小时前", text: "求助：猫咪突然不爱吃饭，大家有类似情况吗？", imageEmoji: "🐈🧡", imageTone: "image-cream", likes: 16, comments: 12, liked: false, followed: false }
  ],
  services: [
    { id: 1, name: "宠爱有家动物医院", type: "宠物医院", distance: "1.2 km", rating: "4.9", open: "营业中" },
    { id: 2, name: "尾巴森林宠物美容", type: "洗护美容", distance: "2.4 km", rating: "4.8", open: "营业中" },
    { id: 3, name: "安心宠物寄养", type: "寄养服务", distance: "3.1 km", rating: "4.7", open: "今日可预约" }
  ],
  settings: { dailyReminder: true, communityNotice: true },
  modalType: "",
  modalTitle: "",
  petCount: 1,
  reminderCount: 3,
  recordForm: { type: "体重", detail: "" },
  petForm: { name: "", type: "", age: "", weight: "" },
  reminderForm: { title: "", time: "" },
  postForm: { text: "" }
});

Page({
  data: createDefaultState(),

  onLoad() {
    const stored = wx.getStorageSync("petly-state");
    if (stored) {
      const pet = Object.assign({}, this.data.currentPet, stored.currentPet || {});
      pet.weight = String(pet.weight || "12.8").replace(/\s*kg$/i, "");
      const posts = (stored.posts || this.data.posts).map(item => Object.assign({ liked: false, followed: false }, item));
      this.setData(Object.assign({}, stored, { currentPet: pet, posts, activeTab: 0, modalType: "" }));
    }
    this.refreshCounts();
    this.bootstrapFromCloud();
  },

  callApi(action, data) {
    const app = getApp();
    if (!wx.cloud || !app.globalData || !app.globalData.env) return Promise.resolve(null);
    return wx.cloud.callFunction({ name: "petlyApi", data: { action, data: data || {} } }).then((response) => {
      const result = response.result || {};
      if (result.success === false) throw new Error(result.error || "云端请求失败");
      return result;
    });
  },

  bootstrapFromCloud() {
    this.callApi("bootstrap").then((result) => {
      if (!result || !result.pet) return;
      this.setData({ currentPet: result.pet, tasks: result.tasks || [], records: result.records || [], posts: result.posts || [], services: result.services || this.data.services, settings: Object.assign({}, this.data.settings, result.settings || {}) });
      this.persist();
    }).catch((error) => console.warn("PETLY cloud bootstrap skipped", error.message));
  },

  persist() {
    const state = { currentPet: this.data.currentPet, tasks: this.data.tasks, records: this.data.records, posts: this.data.posts, settings: this.data.settings, reminderCount: this.data.reminderCount, petCount: this.data.petCount };
    wx.setStorageSync("petly-state", state);
  },

  refreshCounts() {
    this.setData({ reminderCount: this.data.reminderCount || this.data.tasks.length, petCount: this.data.petCount || 1 });
  },

  switchTab(e) { this.setData({ activeTab: Number(e.currentTarget.dataset.tab) }); },

  toggleTask(e) {
    const id = Number(e.currentTarget.dataset.id);
    const tasks = this.data.tasks.map(item => item.id === id ? Object.assign({}, item, { done: !item.done }) : item);
    this.setData({ tasks });
    this.persist();
    this.callApi("toggleTask", { id }).catch((error) => console.warn("toggleTask sync failed", error.message));
    wx.showToast({ title: tasks.find(item => item.id === id).done ? "已完成" : "已恢复", icon: "success" });
  },

  goRecords() { this.setData({ activeTab: 1 }); },
  viewPet() { this.openPetForm(); },
  showNotice() { this.setData({ modalType: "notice", modalTitle: "今日提醒" }); },

  addRecord() {
    this.setData({ modalType: "record", modalTitle: "添加成长记录", recordForm: { type: "体重", detail: "" } });
  },

  addPet() { this.openPetForm(); },

  openPetForm() {
    const pet = this.data.currentPet;
    this.setData({ modalType: "pet", modalTitle: "编辑宠物档案", petForm: { name: pet.name, type: pet.type, age: pet.age, weight: pet.weight } });
  },

  quickAction(e) {
    const action = e.currentTarget.dataset.action;
    if (action === "record") return this.addRecord();
    if (action === "remind") return this.setData({ modalType: "reminder", modalTitle: "创建照护提醒", reminderForm: { title: "", time: "" } });
    if (action === "hospital") return this.setData({ modalType: "service", modalTitle: "附近宠物服务" });
    if (action === "share") return wx.showShareMenu({ withShareTicket: true });
  },

  menuAction(e) {
    const action = e.currentTarget.dataset.action;
    if (action === "pets") return this.openPetForm();
    if (action === "reminders") return this.setData({ modalType: "notice", modalTitle: "提醒管理" });
    if (action === "settings") return this.setData({ modalType: "settings", modalTitle: "偏好设置" });
    if (action === "data") return wx.navigateTo({ url: "/pages/example/index" });
  },

  closeModal() { this.setData({ modalType: "", modalTitle: "" }); },
  stopPropagation() {},

  selectRecordType(e) { this.setData({ "recordForm.type": e.currentTarget.dataset.type }); },
  onRecordDetailInput(e) { this.setData({ "recordForm.detail": e.detail.value }); },

  saveRecord() {
    const form = this.data.recordForm;
    if (!form.detail.trim()) return wx.showToast({ title: "请填写记录内容", icon: "none" });
    const now = new Date();
    const date = `${now.getMonth() + 1}.${String(now.getDate()).padStart(2, "0")}`;
    const color = form.type === "体重" ? "dot-peach" : (form.type === "饮食" ? "dot-green" : "dot-blue");
    const record = { id: Date.now(), title: `${form.type}记录`, detail: form.detail.trim(), date: date === "9.27" ? "今天" : date, color };
    const updates = { records: [record].concat(this.data.records), modalType: "" };
    if (form.type === "体重") {
      const number = parseFloat(form.detail);
      if (!Number.isNaN(number)) updates.currentPet = Object.assign({}, this.data.currentPet, { weight: number.toFixed(1), weightChange: "+0.3kg" });
    }
    this.setData(updates);
    this.persist();
    this.callApi("addRecord", { type: form.type, detail: form.detail.trim() }).catch((error) => console.warn("record sync failed", error.message));
    wx.showToast({ title: "记录已保存", icon: "success" });
  },

  onPetInput(e) { this.setData({ [`petForm.${e.currentTarget.dataset.field}`]: e.detail.value }); },
  savePet() {
    const form = this.data.petForm;
    if (!form.name.trim() || !form.type.trim()) return wx.showToast({ title: "请填写名称和品种", icon: "none" });
    const currentPet = Object.assign({}, this.data.currentPet, { name: form.name.trim(), type: form.type.trim(), age: form.age.trim() || "未填写", weight: form.weight.trim() || this.data.currentPet.weight });
    this.setData({ currentPet, modalType: "", petCount: 1 });
    this.persist();
    this.callApi("updatePet", { name: currentPet.name, type: currentPet.type, age: currentPet.age, weight: currentPet.weight }).catch((error) => console.warn("pet sync failed", error.message));
    wx.showToast({ title: "档案已保存", icon: "success" });
  },

  onReminderInput(e) { this.setData({ [`reminderForm.${e.currentTarget.dataset.field}`]: e.detail.value }); },
  saveReminder() {
    const form = this.data.reminderForm;
    if (!form.title.trim() || !form.time.trim()) return wx.showToast({ title: "请填写提醒内容和时间", icon: "none" });
    const task = { id: Date.now(), title: form.title.trim(), time: form.time.trim(), kind: "health", kindLabel: "提醒", done: false };
    this.setData({ tasks: this.data.tasks.concat(task), reminderCount: this.data.reminderCount + 1, modalType: "" });
    this.persist();
    this.callApi("addReminder", { title: task.title, time: task.time }).catch((error) => console.warn("reminder sync failed", error.message));
    wx.showToast({ title: "提醒已创建", icon: "success" });
  },

  addPost() { this.setData({ modalType: "post", modalTitle: "发布社区动态", postForm: { text: "" } }); },
  onPostInput(e) { this.setData({ "postForm.text": e.detail.value }); },
  savePost() {
    const text = this.data.postForm.text.trim();
    if (!text) return wx.showToast({ title: "请写一点内容", icon: "none" });
    const post = { id: Date.now(), avatar: "🐾", name: "我", time: "刚刚", text, imageEmoji: "🐾", imageTone: "image-sky", likes: 0, comments: 0, liked: false, followed: false };
    this.setData({ posts: [post].concat(this.data.posts), modalType: "" });
    this.persist();
    this.callApi("createPost", { text, authorName: "宠友", avatar: "🐾" }).catch((error) => console.warn("post sync failed", error.message));
    wx.showToast({ title: "动态已发布", icon: "success" });
  },

  likePost(e) {
    const id = Number(e.currentTarget.dataset.id);
    const posts = this.data.posts.map(item => item.id === id ? Object.assign({}, item, { liked: !item.liked, likes: item.likes + (item.liked ? -1 : 1) }) : item);
    this.setData({ posts });
    this.persist();
    this.callApi("toggleLike", { id }).catch((error) => console.warn("like sync failed", error.message));
  },

  followUser(e) {
    const id = Number(e.currentTarget.dataset.id);
    const posts = this.data.posts.map(item => item.id === id ? Object.assign({}, item, { followed: !item.followed }) : item);
    this.setData({ posts });
    this.persist();
    this.callApi("toggleFollow", { id }).catch((error) => console.warn("follow sync failed", error.message));
    wx.showToast({ title: posts.find(item => item.id === id).followed ? "已关注" : "已取消关注", icon: "none" });
  },

  commentPost(e) {
    const id = Number(e.currentTarget.dataset.id);
    wx.showModal({ title: "发表评论", editable: true, placeholderText: "说点什么…", success: (res) => {
      if (!res.confirm || !res.content || !res.content.trim()) return;
      const posts = this.data.posts.map(item => item.id === id ? Object.assign({}, item, { comments: item.comments + 1 }) : item);
      this.setData({ posts });
      this.persist();
      this.callApi("addComment", { id, content: res.content.trim() }).catch((error) => console.warn("comment sync failed", error.message));
      wx.showToast({ title: "评论已发布", icon: "success" });
    } });
  },

  contactService(e) {
    const id = Number(e.currentTarget.dataset.id);
    const name = e.currentTarget.dataset.name;
    wx.showModal({ title: name, content: "确认提交预约意向吗？服务方会在接入后联系你。", confirmText: "提交预约", success: (res) => {
      if (!res.confirm) return;
      this.callApi("bookService", { id }).then(() => wx.showToast({ title: "预约意向已提交", icon: "success" })).catch(() => wx.showToast({ title: "已保存本地，云端稍后同步", icon: "none" }));
    } });
  },
  toggleSetting(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`settings.${key}`]: e.detail.value });
    this.persist();
    this.callApi("updateSettings", this.data.settings).catch((error) => console.warn("settings sync failed", error.message));
  },

  clearData() {
    wx.showModal({ title: "清除演示数据", content: "将恢复为初始示例，确定继续吗？", success: (res) => {
      if (!res.confirm) return;
      wx.removeStorageSync("petly-state");
      const state = createDefaultState();
      this.setData(state);
      wx.showToast({ title: "已恢复初始数据", icon: "success" });
    } });
  },

  onShareAppMessage() { return { title: `分享 ${this.data.currentPet.name} 的成长记录`, path: "/pages/index/index" }; }
});
