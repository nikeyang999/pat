# PETLY MySQL 数据库

数据库初始化脚本是 `petly_schema.sql`，已创建 `petly` 库以及宠物、照护任务、成长记录、提醒、社区动态、点赞和关注表。

## 云函数环境变量

在微信云开发控制台为 `petlyApi` 云函数配置以下环境变量：

```text
PETLY_DB_HOST=38.76.161.139
PETLY_DB_PORT=13306
PETLY_DB_USER=root
PETLY_DB_PASSWORD=数据库密码
PETLY_DB_NAME=petly
```

密码只放在云函数环境变量中，不要写入小程序前端文件，也不要提交到版本库。

## 部署

1. 在微信开发者工具中配置云开发环境 ID，并填写 `miniprogram/app.js` 中的 `globalData.env`。
2. 右键 `cloudfunctions/petlyApi`，选择“上传并部署：云端安装依赖”。
3. 在云函数配置中设置上面的环境变量。
4. 确认服务器允许云函数出口访问 `38.76.161.139:13306`，并建议给数据库创建一个仅拥有 `petly` 库权限的业务账号，替代 root。

页面在云环境未配置时会继续使用本地缓存；配置完成后进入首页会自动从 MySQL 同步。
