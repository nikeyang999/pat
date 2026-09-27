const cloud = require("wx-server-sdk");
const mysql = require("mysql2/promise");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const config = {
  host: process.env.PETLY_DB_HOST,
  port: Number(process.env.PETLY_DB_PORT || 3306),
  user: process.env.PETLY_DB_USER,
  password: process.env.PETLY_DB_PASSWORD,
  database: process.env.PETLY_DB_NAME || "petly",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 4,
  queueLimit: 0,
  enableKeepAlive: true,
};

const SERVICE_CATALOG = [
  { id: 1, name: "宠爱有家动物医院", type: "宠物医院", distance: "1.2 km", rating: "4.9", open: "营业中" },
  { id: 2, name: "尾巴森林宠物美容", type: "洗护美容", distance: "2.4 km", rating: "4.8", open: "营业中" },
  { id: 3, name: "安心宠物寄养", type: "寄养服务", distance: "3.1 km", rating: "4.7", open: "今日可预约" },
];

let pool;
function getPool() {
  if (!config.host || !config.user || !config.password) throw new Error("PETLY_DB_HOST, PETLY_DB_USER and PETLY_DB_PASSWORD are required");
  if (!pool) pool = mysql.createPool(config);
  return pool;
}

function getOpenId() {
  const context = cloud.getWXContext();
  if (!context.OPENID) throw new Error("Unable to identify the current user");
  return context.OPENID;
}

function toPet(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    age: row.age || "未填写",
    weight: row.weight == null ? "12.8" : Number(row.weight).toFixed(1),
    daysTogether: String(row.days_together || 0),
    nextVisit: row.next_visit ? String(row.next_visit).slice(5).replace("-", ".") : "未设置",
    avatar: row.avatar_url || "../../images/avatar.png",
    weightChange: "+0.3kg",
  };
}

function toTask(row) {
  return { id: row.id, title: row.title, time: row.time_text, kind: row.kind, kindLabel: row.kind_label, done: Boolean(row.done) };
}

function toRecord(row) {
  const colors = { 体重: "dot-peach", 饮食: "dot-green", 运动: "dot-blue" };
  const date = new Date(row.record_date);
  return { id: row.id, title: `${row.record_type}记录`, detail: row.detail, date: `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`, color: colors[row.record_type] || "dot-blue" };
}

function toPost(row) {
  return { id: row.id, authorOpenid: row.openid, avatar: row.avatar || "🐕", name: row.author_name, time: formatRelativeTime(row.created_at), text: row.text_content, imageEmoji: row.image_emoji || "🐾", imageTone: row.image_tone || "image-sky", likes: Number(row.likes), comments: Number(row.comments), liked: Boolean(row.liked), followed: Boolean(row.followed) };
}

function formatRelativeTime(value) {
  const date = new Date(value);
  const minutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`;
  return `${Math.floor(minutes / 1440)}天前`;
}

async function ensureUserData(conn, openid) {
  const [pets] = await conn.execute("SELECT * FROM pets WHERE openid = ? ORDER BY id LIMIT 1", [openid]);
  if (pets.length) return pets[0];
  const [result] = await conn.execute("INSERT INTO pets (openid, name, type, age, weight, days_together, next_visit) VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 21 DAY))", [openid, "豆包", "柯基犬", "2岁3个月", 12.8, 826]);
  const petId = result.insertId;
  await conn.execute("INSERT INTO care_tasks (openid, pet_id, title, time_text, kind, kind_label, done) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)", [openid, petId, "早晚各一次散步", "今天 08:00 - 20:00", "walk", "日常", 0, openid, petId, "补充饮水", "已完成 2 / 3 次", "water", "饮食", 1, openid, petId, "体外驱虫提醒", "还有 6 天", "health", "健康", 0]);
  await conn.execute("INSERT INTO pet_records (openid, pet_id, record_type, detail, value, record_date) VALUES (?, ?, ?, ?, ?, CURDATE()), (?, ?, ?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 6 DAY)), (?, ?, ?, ?, ?, DATE_SUB(CURDATE(), INTERVAL 9 DAY))", [openid, petId, "体重", "12.8 kg · 比上次增加 0.2 kg", 12.8, openid, petId, "健康", "狂犬疫苗 · 宠爱有家动物医院", null, openid, petId, "运动", "公园散步 42 分钟", null]);
  await conn.execute("INSERT INTO user_settings (openid) VALUES (?) ON DUPLICATE KEY UPDATE openid = VALUES(openid)", [openid]);
  const [created] = await conn.execute("SELECT * FROM pets WHERE id = ?", [petId]);
  return created[0];
}

async function seedPosts(conn) {
  const [rows] = await conn.execute("SELECT COUNT(*) AS count FROM community_posts");
  if (Number(rows[0].count) > 0) return;
  await conn.execute("INSERT INTO community_posts (openid, author_name, avatar, text_content, image_emoji, image_tone, likes, comments) VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)", ["demo", "可乐妈", "🐕", "周末带可乐去江边放风，今天的风刚刚好。", "☀️🐕", "image-sky", 28, 6, "demo2", "橘子汽水", "🐈", "求助：猫咪突然不爱吃饭，大家有类似情况吗？", "🐈🧡", "image-cream", 16, 12]);
}

async function bootstrap() {
  const openid = getOpenId();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const pet = await ensureUserData(conn, openid);
    await seedPosts(conn);
    const [tasks] = await conn.execute("SELECT * FROM care_tasks WHERE openid = ? AND pet_id = ? ORDER BY id", [openid, pet.id]);
    const [records] = await conn.execute("SELECT * FROM pet_records WHERE openid = ? AND pet_id = ? ORDER BY record_date DESC, id DESC LIMIT 30", [openid, pet.id]);
    const [posts] = await conn.execute("SELECT p.*, EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.openid = ?) AS liked, EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_openid = ? AND f.followed_openid = p.openid) AS followed FROM community_posts p ORDER BY p.created_at DESC LIMIT 30", [openid, openid]);
    const [settings] = await conn.execute("SELECT daily_reminder AS dailyReminder, community_notice AS communityNotice FROM user_settings WHERE openid = ?", [openid]);
    await conn.commit();
    return { pet: toPet(pet), tasks: tasks.map(toTask), records: records.map(toRecord), posts: posts.map(toPost), settings: settings[0] || { dailyReminder: 1, communityNotice: 1 }, services: SERVICE_CATALOG };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

async function updatePet(event) {
  const openid = getOpenId();
  const data = event.data || {};
  const conn = await getPool().getConnection();
  try {
    const pet = await ensureUserData(conn, openid);
    await conn.execute("UPDATE pets SET name = ?, type = ?, age = ?, weight = ? WHERE id = ? AND openid = ?", [data.name, data.type, data.age || null, Number(data.weight) || null, pet.id, openid]);
    const [rows] = await conn.execute("SELECT * FROM pets WHERE id = ?", [pet.id]);
    return toPet(rows[0]);
  } finally { conn.release(); }
}

async function addRecord(event) {
  const openid = getOpenId();
  const data = event.data || {};
  const conn = await getPool().getConnection();
  try {
    const pet = await ensureUserData(conn, openid);
    const value = parseFloat(String(data.detail || "").replace(/[^0-9.]/g, ""));
    await conn.execute("INSERT INTO pet_records (openid, pet_id, record_type, detail, value, record_date) VALUES (?, ?, ?, ?, ?, CURDATE())", [openid, pet.id, data.type || "其他", data.detail, Number.isNaN(value) ? null : value]);
    if (data.type === "体重" && !Number.isNaN(value)) await conn.execute("UPDATE pets SET weight = ? WHERE id = ? AND openid = ?", [value, pet.id, openid]);
    return { success: true };
  } finally { conn.release(); }
}

async function addReminder(event) {
  const openid = getOpenId();
  const data = event.data || {};
  const conn = await getPool().getConnection();
  try {
    const pet = await ensureUserData(conn, openid);
    await conn.execute("INSERT INTO reminders (openid, pet_id, title, time_text, kind) VALUES (?, ?, ?, ?, 'health')", [openid, pet.id, data.title, data.time]);
    await conn.execute("INSERT INTO care_tasks (openid, pet_id, title, time_text, kind, kind_label) VALUES (?, ?, ?, ?, 'health', '提醒')", [openid, pet.id, data.title, data.time]);
    return { success: true };
  } finally { conn.release(); }
}

async function toggleTask(event) {
  const openid = getOpenId();
  await getPool().execute("UPDATE care_tasks SET done = NOT done WHERE id = ? AND openid = ?", [Number(event.data.id), openid]);
  return { success: true };
}

async function toggleLike(event) {
  const openid = getOpenId();
  const postId = Number(event.data.id);
  const conn = await getPool().getConnection();
  try {
    const [existing] = await conn.execute("SELECT 1 FROM post_likes WHERE post_id = ? AND openid = ?", [postId, openid]);
    if (existing.length) {
      await conn.execute("DELETE FROM post_likes WHERE post_id = ? AND openid = ?", [postId, openid]);
      await conn.execute("UPDATE community_posts SET likes = GREATEST(0, likes - 1) WHERE id = ?", [postId]);
      return { liked: false };
    }
    await conn.execute("INSERT INTO post_likes (post_id, openid) VALUES (?, ?)", [postId, openid]);
    await conn.execute("UPDATE community_posts SET likes = likes + 1 WHERE id = ?", [postId]);
    return { liked: true };
  } finally { conn.release(); }
}

async function toggleFollow(event) {
  const openid = getOpenId();
  const postId = Number(event.data.id);
  const conn = await getPool().getConnection();
  try {
    const [post] = await conn.execute("SELECT openid FROM community_posts WHERE id = ?", [postId]);
    if (!post.length || post[0].openid === openid) return { followed: false };
    const followedOpenid = post[0].openid;
    const [existing] = await conn.execute("SELECT 1 FROM user_follows WHERE follower_openid = ? AND followed_openid = ?", [openid, followedOpenid]);
    if (existing.length) {
      await conn.execute("DELETE FROM user_follows WHERE follower_openid = ? AND followed_openid = ?", [openid, followedOpenid]);
      return { followed: false };
    }
    await conn.execute("INSERT INTO user_follows (follower_openid, followed_openid) VALUES (?, ?)", [openid, followedOpenid]);
    return { followed: true };
  } finally { conn.release(); }
}

async function addComment(event) {
  const openid = getOpenId();
  const postId = Number(event.data.id);
  const content = String(event.data.content || "").trim();
  if (!content) throw new Error("Comment cannot be empty");
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("INSERT INTO post_comments (post_id, openid, content) VALUES (?, ?, ?)", [postId, openid, content]);
    await conn.execute("UPDATE community_posts SET comments = comments + 1 WHERE id = ?", [postId]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
  return { success: true };
}

async function createPost(event) {
  const openid = getOpenId();
  const data = event.data || {};
  const text = String(data.text || "").trim();
  if (!text) throw new Error("Post content cannot be empty");
  const conn = await getPool().getConnection();
  try {
    const [result] = await conn.execute("INSERT INTO community_posts (openid, author_name, avatar, text_content, image_emoji, image_tone) VALUES (?, ?, ?, ?, ?, ?)", [openid, String(data.authorName || "宠友"), String(data.avatar || "🐾"), text, String(data.imageEmoji || "🐾"), String(data.imageTone || "image-sky")]);
    return { id: result.insertId };
  } finally { conn.release(); }
}

async function bookService(event) {
  const openid = getOpenId();
  const data = event.data || {};
  const service = SERVICE_CATALOG.find(item => Number(item.id) === Number(data.id)) || SERVICE_CATALOG[0];
  await getPool().execute("INSERT INTO service_bookings (openid, service_name, service_type) VALUES (?, ?, ?)", [openid, service.name, service.type]);
  return { success: true, service };
}

async function updateSettings(event) {
  const openid = getOpenId();
  const data = event.data || {};
  await getPool().execute("INSERT INTO user_settings (openid, daily_reminder, community_notice) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE daily_reminder = VALUES(daily_reminder), community_notice = VALUES(community_notice)", [openid, data.dailyReminder ? 1 : 0, data.communityNotice ? 1 : 0]);
  return { success: true };
}

async function getStats() {
  const openid = getOpenId();
  const conn = await getPool().getConnection();
  try {
    const [[pets], [records], [tasks], [posts], [bookings]] = await Promise.all([
      conn.execute("SELECT COUNT(*) AS count FROM pets WHERE openid = ?", [openid]),
      conn.execute("SELECT COUNT(*) AS count FROM pet_records WHERE openid = ?", [openid]),
      conn.execute("SELECT COUNT(*) AS count FROM care_tasks WHERE openid = ?", [openid]),
      conn.execute("SELECT COUNT(*) AS count FROM community_posts"),
      conn.execute("SELECT COUNT(*) AS count FROM service_bookings WHERE openid = ?", [openid]),
    ]);
    return { pets: Number(pets[0].count), records: Number(records[0].count), tasks: Number(tasks[0].count), posts: Number(posts[0].count), bookings: Number(bookings[0].count), database: config.database };
  } finally { conn.release(); }
}

exports.main = async (event) => {
  try {
    switch (event.action || event.type) {
      case "bootstrap": return await bootstrap();
      case "updatePet": return await updatePet(event);
      case "addRecord": return await addRecord(event);
      case "addReminder": return await addReminder(event);
      case "toggleTask": return await toggleTask(event);
      case "toggleLike": return await toggleLike(event);
      case "toggleFollow": return await toggleFollow(event);
      case "addComment": return await addComment(event);
      case "createPost": return await createPost(event);
      case "bookService": return await bookService(event);
      case "updateSettings": return await updateSettings(event);
      case "getStats": return await getStats();
      default: throw new Error(`Unsupported action: ${event.action || event.type}`);
    }
  } catch (error) {
    console.error("petlyApi error", error);
    return { success: false, error: error.message || "Database request failed" };
  }
};
