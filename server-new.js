const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

/* ===============================
   基础配置
================================ */

const PORT = 3001;

const UPLOAD_DIR = path.join(__dirname, "uploads");
const ACTIVATION_FILE = path.join(__dirname, "activation-db.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const ADMIN_TOKEN = "starry-admin";

/* ===============================
   基础中间件
================================ */

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

/* ===============================
   确保目录 / 文件存在
================================ */

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

if (!fs.existsSync(ACTIVATION_FILE)) {
  fs.writeFileSync(
    ACTIVATION_FILE,
    JSON.stringify({ devices: {} }, null, 2),
    "utf-8",
  );
}

/* ===============================
   静态图片访问
================================ */

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

/* ===============================
   健康检查
================================ */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "星星机后端运行中",
    port: PORT,
    upload: true,
    activation: true,
    time: new Date().toISOString(),
  });
});

/* ===============================
   图片上传系统
================================ */

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },

  filename(req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";

    const filename =
      Date.now() + "-" + Math.random().toString(36).slice(2) + ext;

    cb(null, filename);
  },
});

function fileFilter(req, file, cb) {
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    cb(new Error("只能上传图片文件"));
    return;
  }

  cb(null, true);
}

/**
 * 不主动压缩，不主动限制图片尺寸。
 * 注意：实际限制仍可能来自浏览器、系统、服务器磁盘空间。
 */
const upload = multer({
  storage,
  fileFilter,
});

app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "没有收到图片",
    });
  }

  /**
   * 自动根据当前请求 Host 返回图片 URL。
   *
   * 电脑访问：
   * http://localhost:3001/uploads/xxx.jpg
   *
   * 手机局域网访问：
   * http://192.168.x.x:3001/uploads/xxx.jpg
   */
  const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${
    req.file.filename
  }`;

  res.json({
    success: true,
    url: imageUrl,
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
});

/* ===============================
   激活码数据库工具
================================ */

function readActivationDB() {
  try {
    if (!fs.existsSync(ACTIVATION_FILE)) {
      return { devices: {} };
    }

    const text = fs.readFileSync(ACTIVATION_FILE, "utf-8");

    if (!text.trim()) {
      return { devices: {} };
    }

    const db = JSON.parse(text);

    if (!db.devices) {
      db.devices = {};
    }

    return db;
  } catch (error) {
    console.error("读取 activation-db.json 失败：", error);

    return { devices: {} };
  }
}

function writeActivationDB(db) {
  fs.writeFileSync(ACTIVATION_FILE, JSON.stringify(db, null, 2), "utf-8");
}

function makeActivationCode() {
  /**
   * 去掉容易混淆的字符：
   * I、O、0、1
   */
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const part = (length) => {
    let text = "";

    for (let i = 0; i < length; i++) {
      text += chars[Math.floor(Math.random() * chars.length)];
    }

    return text;
  };

  return `SX-${part(4)}-${part(4)}`;
}

function normalizeDeviceId(deviceId) {
  return String(deviceId || "").trim();
}

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase();
}

function ensureDevice(deviceId) {
  const id = normalizeDeviceId(deviceId);
  const db = readActivationDB();

  if (!db.devices[id]) {
    db.devices[id] = {
      code: makeActivationCode(),
      activated: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    writeActivationDB(db);
  }

  return db.devices[id];
}

/* ===============================
   激活码接口
================================ */

/**
 * 查询设备激活状态
 *
 * GET /api/activation/status?deviceId=xxx
 */
app.get("/api/activation/status", (req, res) => {
  const deviceId = normalizeDeviceId(req.query.deviceId);

  if (!deviceId) {
    return res.status(400).json({
      success: false,
      message: "缺少 deviceId",
    });
  }

  const device = ensureDevice(deviceId);

  res.json({
    success: true,
    deviceId,
    activated: Boolean(device.activated),
  });
});

/**
 * 验证激活码
 *
 * POST /api/activation/verify
 * body:
 * {
 *   "deviceId": "...",
 *   "code": "SX-XXXX-XXXX"
 * }
 */
app.post("/api/activation/verify", (req, res) => {
  const deviceId = normalizeDeviceId(req.body.deviceId);
  const code = normalizeCode(req.body.code);

  if (!deviceId || !code) {
    return res.status(400).json({
      success: false,
      message: "缺少 deviceId 或 code",
    });
  }

  const db = readActivationDB();
  const device = db.devices[deviceId];

  if (!device) {
    return res.status(404).json({
      success: false,
      message: "设备不存在，请先刷新星星机页面生成设备",
    });
  }

  if (code !== device.code) {
    return res.status(401).json({
      success: false,
      message: "激活码错误",
    });
  }

  device.activated = true;
  device.updatedAt = Date.now();

  writeActivationDB(db);

  res.json({
    success: true,
    message: "激活成功",
    deviceId,
  });
});

/**
 * 管理员：刷新某台设备激活码
 *
 * POST /api/admin/activation/refresh
 * body:
 * {
 *   "deviceId": "...",
 *   "adminToken": "starry-admin"
 * }
 */
app.post("/api/admin/activation/refresh", (req, res) => {
  const deviceId = normalizeDeviceId(req.body.deviceId);
  const adminToken = String(req.body.adminToken || "").trim();

  if (adminToken !== ADMIN_TOKEN) {
    return res.status(403).json({
      success: false,
      message: "管理员口令错误",
    });
  }

  if (!deviceId) {
    return res.status(400).json({
      success: false,
      message: "缺少 deviceId",
    });
  }

  const db = readActivationDB();

  if (!db.devices[deviceId]) {
    db.devices[deviceId] = {
      code: makeActivationCode(),
      activated: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } else {
    db.devices[deviceId].code = makeActivationCode();
    db.devices[deviceId].activated = false;
    db.devices[deviceId].updatedAt = Date.now();
  }

  writeActivationDB(db);

  res.json({
    success: true,
    message: "激活码已刷新",
    deviceId,
    code: db.devices[deviceId].code,
    activated: db.devices[deviceId].activated,
  });
});

/**
 * 管理员：查看所有设备
 *
 * GET /api/admin/activation/list?adminToken=starry-admin
 */
app.get("/api/admin/activation/list", (req, res) => {
  const adminToken = String(req.query.adminToken || "").trim();

  if (adminToken !== ADMIN_TOKEN) {
    return res.status(403).json({
      success: false,
      message: "管理员口令错误",
    });
  }

  const db = readActivationDB();

  res.json({
    success: true,
    devices: db.devices,
  });
});

/* ===============================
   API 404
   防止接口不存在时返回 HTML
================================ */

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "接口不存在",
    path: req.originalUrl,
  });
});

// 前端页面兜底
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

/* ===============================
   错误处理
================================ */

app.use((err, req, res, next) => {
  console.error("服务器错误：", err);

  res.status(500).json({
    success: false,
    message: err.message || "服务器错误",
  });
});

/* ===============================
   启动服务
================================ */

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("====================================");
  console.log(`星星机后端已启动：http://localhost:${PORT}`);
  console.log(`健康检查：http://localhost:${PORT}/api/health`);
  console.log(`上传接口：http://localhost:${PORT}/api/upload`);
  console.log(`激活码接口：http://localhost:${PORT}/api/activation/status`);
  console.log("====================================");
  console.log("");
});
