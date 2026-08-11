/* ===============================
   星星机 / 小手机主屏 JS v4

   改动：
   1. 删除旧 IndexedDB 图片存储
   2. 图片改为上传后端保存
   3. 前端 localStorage 只保存：
      - 小组件文字
      - 后端返回的图片 URL
   4. 第一页四个小方块只改图片
   5. 支持星星机开场动画
================================ */

const TEXT_STORAGE_KEY = "mini-phone-widget-text-v3";
const IMAGE_URL_STORAGE_KEY = "mini-phone-widget-image-url-v1";

/**
 * 如果前端和后端分开跑：
 * 前端：http://localhost:8080
 * 后端：http://localhost:3001
 * 就用下面这个。
 */
const API_BASE_URL = `${location.protocol}//${location.hostname}:3001`;
console.log("星星机当前后端地址：", API_BASE_URL);

/**
 * 如果你让 Express 同时托管前端和后端，
 * 页面也是 http://localhost:3001 打开的，
 * 可以改成：
 *
 * const API_BASE_URL = "";
 */

const DEFAULT_TEXT = "未设置";

/* ===============================
   清理旧版本遗留的大体积缓存
   旧版曾经把图片 base64 存 localStorage，容易爆容量
================================ */

cleanupLegacyStorage();

function cleanupLegacyStorage() {
  const legacyKeys = [
    "mini-phone-widget-config",
    "mini-phone-widget-config-v1",
    "mini-phone-widget-config-v2",
    "mini-phone-widget-config-v3",
    "mini-phone-widget-images",
  ];

  for (const key of legacyKeys) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  // 删除旧 IndexedDB 图片库
  try {
    if (window.indexedDB) {
      indexedDB.deleteDatabase("mini-phone-widget-images");
    }
  } catch {}
}

const IMAGE_ONLY_WIDGETS = new Set([
  "p1SquareA",
  "p1SquareB",
  "p1SquareC",
  "p1SquareD",
]);

const appNameMap = {
  chat: "chat",
  worldbook: "世界书",
  treehole: "树洞",
  rolecard: "角色卡",

  home: "home",
  listen: "一起听",
  fans: "同好",
  travel: "出行",

  api: "api设置",
  widgets: "小组件",
  beautify: "美化",
};

const defaultWidgetText = {
  p1Hero: { title: DEFAULT_TEXT, subtitle: DEFAULT_TEXT, text: DEFAULT_TEXT },
  p1Mini: { title: DEFAULT_TEXT, subtitle: DEFAULT_TEXT, text: DEFAULT_TEXT },

  p1SquareA: {
    title: DEFAULT_TEXT,
    subtitle: DEFAULT_TEXT,
    text: DEFAULT_TEXT,
  },
  p1SquareB: {
    title: DEFAULT_TEXT,
    subtitle: DEFAULT_TEXT,
    text: DEFAULT_TEXT,
  },
  p1SquareC: {
    title: DEFAULT_TEXT,
    subtitle: DEFAULT_TEXT,
    text: DEFAULT_TEXT,
  },
  p1SquareD: {
    title: DEFAULT_TEXT,
    subtitle: DEFAULT_TEXT,
    text: DEFAULT_TEXT,
  },

  p2Clock: { title: DEFAULT_TEXT, subtitle: DEFAULT_TEXT, text: DEFAULT_TEXT },
  p2Media: { title: DEFAULT_TEXT, subtitle: DEFAULT_TEXT, text: DEFAULT_TEXT },
  p2Record: { title: DEFAULT_TEXT, subtitle: DEFAULT_TEXT, text: DEFAULT_TEXT },

  p2RecordA: {
    title: DEFAULT_TEXT,
    subtitle: DEFAULT_TEXT,
    text: DEFAULT_TEXT,
  },
  p2RecordB: {
    title: DEFAULT_TEXT,
    subtitle: DEFAULT_TEXT,
    text: DEFAULT_TEXT,
  },
};

let widgetText = loadWidgetText();
let widgetImageUrls = loadWidgetImageUrls();

document.addEventListener("DOMContentLoaded", async () => {
  initSplashScreen();

  injectLineIcons();
  bindWidgetText();
  await bindWidgetImages();
  initClock();
  initPaging();
  initApps();
  initWidgetEditor();
  initActivationLock();
  // registerServiceWorker();
});

/* ===============================
   星星机激活锁
================================ */

const DEVICE_ID_STORAGE_KEY = "starry-phone-device-id";
const ACTIVATED_LOCAL_KEY = "starry-phone-activated-local";

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);

  if (deviceId) {
    return deviceId;
  }

  if (crypto.randomUUID) {
    deviceId = crypto.randomUUID();
  } else {
    deviceId =
      "device-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2);
  }

  localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

async function getActivationStatus(deviceId) {
  const response = await fetch(
    `${API_BASE_URL}/api/activation/status?deviceId=${encodeURIComponent(deviceId)}`,
  );

  if (!response.ok) {
    throw new Error("无法获取激活状态");
  }

  return response.json();
}

async function verifyActivationCode(deviceId, code) {
  const url = `${API_BASE_URL}/api/activation/verify`;

  console.log("正在请求激活接口：", url);
  console.log("设备 ID：", deviceId);
  console.log("激活码：", code);

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deviceId,
        code,
      }),
    });
  } catch (error) {
    throw new Error(
      `无法连接激活服务器：${url}\n` + `原始错误：${error.message || error}`,
    );
  }

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "激活服务器没有返回 JSON。\n\n" +
        "请求地址：\n" +
        url +
        "\n\n返回内容前 120 字：\n" +
        text.slice(0, 120),
    );
  }

  if (!response.ok || !data.success) {
    throw new Error(data.message || "激活失败");
  }

  return data;
}

function lockHomeScreen() {
  const viewport = document.getElementById("homeViewport");
  const dock = document.querySelector(".dock");
  const dots = document.querySelector(".page-dots");

  if (viewport) viewport.style.pointerEvents = "none";
  if (dock) dock.style.pointerEvents = "none";
  if (dots) dots.style.pointerEvents = "none";
}

function unlockHomeScreen() {
  const activationScreen = document.getElementById("activationScreen");
  const viewport = document.getElementById("homeViewport");
  const dock = document.querySelector(".dock");
  const dots = document.querySelector(".page-dots");

  if (activationScreen) {
    activationScreen.hidden = true;
  }

  if (viewport) viewport.style.pointerEvents = "";
  if (dock) dock.style.pointerEvents = "";
  if (dots) dots.style.pointerEvents = "";
}

function showActivationScreen(deviceId, message = "") {
  const activationScreen = document.getElementById("activationScreen");
  const deviceEl = document.getElementById("activationDeviceId");
  const messageEl = document.getElementById("activationMessage");

  if (!activationScreen) return;

  activationScreen.hidden = false;
  lockHomeScreen();

  if (deviceEl) {
    deviceEl.textContent = deviceId;
  }

  if (messageEl) {
    messageEl.textContent = message;
    messageEl.className = "activation-message";
  }
}

async function initActivationLock() {
  const activationScreen = document.getElementById("activationScreen");
  const input = document.getElementById("activationInput");
  const submit = document.getElementById("activationSubmit");
  const message = document.getElementById("activationMessage");
  const copyBtn = document.getElementById("copyDeviceId");

  if (!activationScreen || !input || !submit) {
    return;
  }

  const deviceId = getOrCreateDeviceId();

  initCopyDeviceIdButton(deviceId, copyBtn, message);

  try {
    const status = await getActivationStatus(deviceId);

    if (status.activated) {
      localStorage.setItem(ACTIVATED_LOCAL_KEY, "1");
      unlockHomeScreen();
      return;
    }

    showActivationScreen(deviceId);
  } catch (error) {
    console.warn(error);

    /**
     * 如果后端连不上：
     * 为了安全，默认显示激活页。
     */
    showActivationScreen(deviceId, "无法连接激活服务器");
  }

  submit.addEventListener("click", async () => {
    const code = input.value.trim().toUpperCase();

    if (!code) {
      if (message) {
        message.textContent = "请输入激活码";
        message.className = "activation-message is-error";
      }
      return;
    }

    submit.disabled = true;
    submit.textContent = "激活中...";

    if (message) {
      message.textContent = "";
      message.className = "activation-message";
    }

    try {
      await verifyActivationCode(deviceId, code);

      localStorage.setItem(ACTIVATED_LOCAL_KEY, "1");

      if (message) {
        message.textContent = "激活成功";
        message.className = "activation-message is-success";
      }

      window.setTimeout(() => {
        unlockHomeScreen();
      }, 520);
    } catch (error) {
      if (message) {
        message.textContent = error.message || "激活失败";
        message.className = "activation-message is-error";
      }
    } finally {
      submit.disabled = false;
      submit.textContent = "激活星星机";
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submit.click();
    }
  });

  input.addEventListener("input", () => {
    input.value = input.value.toUpperCase();
  });
}

function initCopyDeviceIdButton(deviceId, copyBtn, messageEl) {
  if (!copyBtn) return;

  copyBtn.addEventListener("click", async () => {
    try {
      await copyText(deviceId);

      const oldText = copyBtn.textContent;
      copyBtn.textContent = "已复制";

      if (messageEl) {
        messageEl.textContent = "设备 ID 已复制";
        messageEl.className = "activation-message is-success";
      }

      window.setTimeout(() => {
        copyBtn.textContent = oldText || "复制";
      }, 1200);
    } catch (error) {
      console.warn(error);

      if (messageEl) {
        messageEl.textContent = "复制失败，请长按设备 ID 手动复制";
        messageEl.className = "activation-message is-error";
      }
    }
  });
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  /**
   * 兼容非 https / localhost 场景
   */
  const textarea = document.createElement("textarea");
  textarea.value = text;

  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.setAttribute("readonly", "");

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const success = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!success) {
    throw new Error("execCommand copy failed");
  }
}

/* ===============================
   localStorage：小组件文字
================================ */

function loadWidgetText() {
  try {
    const saved = localStorage.getItem(TEXT_STORAGE_KEY);

    if (!saved) {
      return clone(defaultWidgetText);
    }

    const parsed = JSON.parse(saved);

    return {
      ...clone(defaultWidgetText),
      ...parsed,
    };
  } catch {
    return clone(defaultWidgetText);
  }
}

function saveWidgetText() {
  try {
    localStorage.setItem(TEXT_STORAGE_KEY, JSON.stringify(widgetText));
  } catch (error) {
    console.warn("保存文字失败，尝试清理旧缓存后重试：", error);

    cleanupLegacyStorage();

    try {
      localStorage.setItem(TEXT_STORAGE_KEY, JSON.stringify(widgetText));
    } catch (retryError) {
      console.error("文字保存仍然失败：", retryError);
      throw retryError;
    }
  }
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

/* ===============================
   localStorage：图片 URL
   后端保存图片文件，前端只保存 URL
================================ */

function loadWidgetImageUrls() {
  try {
    const saved = localStorage.getItem(IMAGE_URL_STORAGE_KEY);

    if (!saved) {
      return {};
    }

    return JSON.parse(saved);
  } catch {
    return {};
  }
}

function saveWidgetImageUrls() {
  try {
    localStorage.setItem(
      IMAGE_URL_STORAGE_KEY,
      JSON.stringify(widgetImageUrls),
    );
  } catch (error) {
    console.warn("保存图片 URL 失败，尝试清理旧缓存后重试：", error);

    cleanupLegacyStorage();

    try {
      localStorage.setItem(
        IMAGE_URL_STORAGE_KEY,
        JSON.stringify(widgetImageUrls),
      );
    } catch (retryError) {
      console.error("图片 URL 保存仍然失败：", retryError);
      throw retryError;
    }
  }
}

/* ===============================
   上传图片到后端
================================ */

async function uploadImageToServer(file) {
  const formData = new FormData();

  /**
   * 这里的 "image" 必须和后端 multer 保持一致：
   * upload.single("image")
   */
  formData.append("image", file);

  const response = await fetch(`${API_BASE_URL}/api/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`图片上传失败：HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.success || !data.url) {
    throw new Error(data.message || "图片上传失败");
  }

  return data.url;
}

/* ===============================
   绑定小组件文字
================================ */

function bindWidgetText() {
  document.querySelectorAll("[data-bind-title]").forEach((el) => {
    const id = el.dataset.bindTitle;
    el.textContent = widgetText[id]?.title || DEFAULT_TEXT;
  });

  document.querySelectorAll("[data-bind-subtitle]").forEach((el) => {
    const id = el.dataset.bindSubtitle;
    el.textContent = widgetText[id]?.subtitle || DEFAULT_TEXT;
  });

  document.querySelectorAll("[data-bind-text]").forEach((el) => {
    const id = el.dataset.bindText;
    el.textContent = widgetText[id]?.text || DEFAULT_TEXT;
  });
}

/* ===============================
   绑定小组件图片
================================ */

async function bindWidgetImages() {
  const imgs = Array.from(document.querySelectorAll("[data-bind-img]"));

  for (const img of imgs) {
    const id = img.dataset.bindImg;
    const savedUrl = widgetImageUrls[id];

    if (savedUrl) {
      img.src = savedUrl;
    } else {
      img.src = makePlaceholderImage(getPlaceholderLabel(id));
    }

    img.decoding = "async";
    img.loading = "eager";

    img.onerror = () => {
      img.src = makePlaceholderImage(getPlaceholderLabel(id));
    };
  }
}

/* ===============================
   小组件编辑器
================================ */

function initWidgetEditor() {
  const editor = document.getElementById("widgetEditor");
  const form = document.getElementById("widgetEditorForm");

  const editWidgetId = document.getElementById("editWidgetId");
  const editTitle = document.getElementById("editTitle");
  const editSubtitle = document.getElementById("editSubtitle");
  const editText = document.getElementById("editText");
  const editImage = document.getElementById("editImage");
  const editPreview = document.getElementById("editPreview");

  const saveBtn = document.getElementById("saveWidget");
  const clearBtn = document.getElementById("clearWidget");
  const closeBtn = document.getElementById("closeEditor");

  if (!editor || !form) return;

  /**
   * 给文字区域包一层 class。
   * 图片-only 小组件会隐藏文字输入区域。
   */
  wrapTextInputsForImageOnlyMode();

  let pendingFile = null;
  let pendingPreviewUrl = "";

  document
    .querySelectorAll(".editable-widget, .image-only-widget")
    .forEach((widget) => {
      widget.addEventListener("click", async () => {
        const id = widget.dataset.widgetId;
        if (!id) return;

        const isImageOnly = IMAGE_ONLY_WIDGETS.has(id);

        editor.classList.toggle("image-only-mode", isImageOnly);

        const data = widgetText[id] || {
          title: DEFAULT_TEXT,
          subtitle: DEFAULT_TEXT,
          text: DEFAULT_TEXT,
        };

        editWidgetId.value = id;

        editTitle.value = data.title === DEFAULT_TEXT ? "" : data.title || "";
        editSubtitle.value =
          data.subtitle === DEFAULT_TEXT ? "" : data.subtitle || "";
        editText.value = data.text === DEFAULT_TEXT ? "" : data.text || "";

        editImage.value = "";
        pendingFile = null;

        if (pendingPreviewUrl) {
          URL.revokeObjectURL(pendingPreviewUrl);
          pendingPreviewUrl = "";
        }

        const savedUrl = widgetImageUrls[id];

        if (savedUrl) {
          editPreview.src = savedUrl;
        } else {
          editPreview.src = makePlaceholderImage(getPlaceholderLabel(id));
        }

        editor.showModal();
      });
    });

  editImage.addEventListener("change", () => {
    const file = editImage.files && editImage.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("请选择图片文件");
      return;
    }

    pendingFile = file;

    /**
     * 本地预览直接使用原始 File Blob。
     * 不压缩、不改画质。
     */
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = "";
    }

    pendingPreviewUrl = URL.createObjectURL(file);
    editPreview.src = pendingPreviewUrl;
  });

  saveBtn.addEventListener("click", async () => {
    const id = editWidgetId.value;
    if (!id) return;

    const isImageOnly = IMAGE_ONLY_WIDGETS.has(id);

    try {
      // 1. 如果选了新图片，先上传到后端
      if (pendingFile) {
        const imageUrl = await uploadImageToServer(pendingFile);

        widgetImageUrls[id] = imageUrl;
        saveWidgetImageUrls();
      }

      // 2. 非图片-only 小组件保存文字
      if (!isImageOnly) {
        widgetText[id] = {
          title: editTitle.value.trim() || DEFAULT_TEXT,
          subtitle: editSubtitle.value.trim() || DEFAULT_TEXT,
          text: editText.value.trim() || DEFAULT_TEXT,
        };

        saveWidgetText();
      }

      bindWidgetText();
      await bindWidgetImages();

      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
        pendingPreviewUrl = "";
      }

      pendingFile = null;
      editor.close();
    } catch (error) {
      console.error(error);

      alert(
        "保存失败。\n\n" +
          "请检查：\n" +
          "1. 后端是否启动：http://localhost:3000\n" +
          "2. /api/upload 是否正常。\n" +
          "3. 浏览器 localStorage 是否被旧图片数据占满。\n\n" +
          "建议先在控制台执行：\n" +
          "localStorage.clear();\n" +
          "indexedDB.deleteDatabase('mini-phone-widget-images');\n" +
          "location.reload();\n\n" +
          `错误信息：${error.message || error}`,
      );
    }
  });

  clearBtn.addEventListener("click", async () => {
    const id = editWidgetId.value;
    if (!id) return;

    const isImageOnly = IMAGE_ONLY_WIDGETS.has(id);

    try {
      if (!isImageOnly) {
        widgetText[id] = {
          title: DEFAULT_TEXT,
          subtitle: DEFAULT_TEXT,
          text: DEFAULT_TEXT,
        };

        saveWidgetText();
      }

      /**
       * 这里只清掉前端保存的图片 URL。
       * 后端 uploads 里的旧图片暂时保留。
       * 如果后续需要真正删除服务器文件，可以再加 DELETE 接口。
       */
      delete widgetImageUrls[id];
      saveWidgetImageUrls();

      bindWidgetText();
      await bindWidgetImages();

      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
        pendingPreviewUrl = "";
      }

      pendingFile = null;
      editor.close();
    } catch (error) {
      console.error(error);
      alert("清空失败");
    }
  });

  closeBtn.addEventListener("click", () => {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = "";
    }

    pendingFile = null;
    editor.close();
  });
}

function wrapTextInputsForImageOnlyMode() {
  /**
   * 如果浏览器支持 :has，就自动包一层 .text-edit-area。
   * 这样第一页四个小图片组件打开编辑器时只显示图片选择，不显示文字输入。
   */
  let titleLabel = null;
  let subtitleLabel = null;
  let textLabel = null;

  try {
    titleLabel = document.querySelector("label:has(#editTitle)");
    subtitleLabel = document.querySelector("label:has(#editSubtitle)");
    textLabel = document.querySelector("label:has(#editText)");
  } catch {
    return;
  }

  if (!titleLabel || !subtitleLabel || !textLabel) return;

  if (titleLabel.parentElement?.classList.contains("text-edit-area")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "text-edit-area";
  wrapper.style.display = "grid";
  wrapper.style.gap = "12px";

  titleLabel.before(wrapper);
  wrapper.append(titleLabel, subtitleLabel, textLabel);
}

/* ===============================
   时间
================================ */

function initClock() {
  const statusTime = document.getElementById("statusTime");
  const bigTime = document.getElementById("bigTime");
  const dateText = document.getElementById("dateText");

  const update = () => {
    const now = new Date();

    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const timeText = `${hh}:${mm}`;

    if (statusTime) statusTime.textContent = timeText;
    if (bigTime) bigTime.textContent = timeText;

    if (dateText) {
      const month = now.toLocaleString("en-US", { month: "long" });
      const day = String(now.getDate()).padStart(2, "0");
      dateText.textContent = `${month}${day}`;
    }
  };

  update();
  setInterval(update, 1000 * 10);
}

/* ===============================
   分页
================================ */

function initPaging() {
  const viewport = document.getElementById("homeViewport");
  const dots = Array.from(document.querySelectorAll(".dot"));

  if (!viewport || dots.length === 0) return;

  let raf = 0;

  const updateDots = () => {
    cancelAnimationFrame(raf);

    raf = requestAnimationFrame(() => {
      const page = Math.round(viewport.scrollLeft / viewport.clientWidth);

      dots.forEach((dot, index) => {
        dot.classList.toggle("active", index === page);
      });
    });
  };

  viewport.addEventListener("scroll", updateDots, { passive: true });

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const page = Number(dot.dataset.jump || 0);

      viewport.scrollTo({
        left: viewport.clientWidth * page,
        behavior: "smooth",
      });
    });
  });
}

/* ===============================
   APP
================================ */

function initApps() {
  const dialog = document.getElementById("appDialog");
  const dialogTitle = document.getElementById("dialogTitle");

  document.querySelectorAll("[data-app]").forEach((app) => {
    app.addEventListener("click", () => {
      const key = app.dataset.app;
      const name = appNameMap[key] || key || "APP";

      if (dialog && dialogTitle) {
        dialogTitle.textContent = name;
        dialog.showModal();
      } else {
        alert(name);
      }
    });
  });
}

/* ===============================
   线条图标
================================ */

function injectLineIcons() {
  document.querySelectorAll("[data-line-icon]").forEach((el) => {
    const name = el.dataset.lineIcon;
    el.innerHTML = getLineIcon(name);
  });
}

function getLineIcon(name) {
  const icons = {
    chat: `
      <svg viewBox="0 0 32 32">
        <path d="M8 10.5C8 7.9 10.1 6 12.8 6h6.4C21.9 6 24 7.9 24 10.5v4.8c0 2.6-2.1 4.5-4.8 4.5h-4.1L9.2 25v-5.2H8.8C6.1 19.8 4 17.9 4 15.3v-4.8z"/>
      </svg>
    `,

    book: `
      <svg viewBox="0 0 32 32">
        <path d="M6 7.5c0-1 .8-1.8 1.8-1.8H14c1.1 0 2 .9 2 2v17c0-1.1-.9-2-2-2H7.8C6.8 22.7 6 21.9 6 21V7.5z"/>
        <path d="M26 7.5c0-1-.8-1.8-1.8-1.8H18c-1.1 0-2 .9-2 2v17c0-1.1.9-2 2-2h6.2c1 0 1.8-.8 1.8-1.7V7.5z"/>
      </svg>
    `,

    moon: `
      <svg viewBox="0 0 32 32">
        <path d="M21.5 24.2A10 10 0 0 1 13 6.3a9 9 0 1 0 8.5 17.9z"/>
      </svg>
    `,

    card: `
      <svg viewBox="0 0 32 32">
        <rect x="5" y="8" width="22" height="16" rx="3"/>
        <circle cx="12" cy="15" r="2.3"/>
        <path d="M9 20c1.4-2.3 4.6-2.3 6 0"/>
        <path d="M18 14h5"/>
        <path d="M18 18h5"/>
      </svg>
    `,

    home: `
      <svg viewBox="0 0 32 32">
        <path d="M6 15.5L16 7l10 8.5"/>
        <path d="M9 14v11h14V14"/>
      </svg>
    `,

    music: `
      <svg viewBox="0 0 32 32">
        <path d="M19 6v15.5a4 4 0 1 1-2-3.5V8l7 4"/>
      </svg>
    `,

    heart: `
      <svg viewBox="0 0 32 32">
        <path d="M16 25S6.5 19.5 6.5 12.5A5 5 0 0 1 16 10a5 5 0 0 1 9.5 2.5C25.5 19.5 16 25 16 25z"/>
      </svg>
    `,

    arrow: `
      <svg viewBox="0 0 32 32">
        <path d="M9 23L23 9"/>
        <path d="M14 9h9v9"/>
      </svg>
    `,

    settings: `
      <svg viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="3.5"/>
        <path d="M16 5v3"/>
        <path d="M16 24v3"/>
        <path d="M5 16h3"/>
        <path d="M24 16h3"/>
        <path d="M8.2 8.2l2.1 2.1"/>
        <path d="M21.7 21.7l2.1 2.1"/>
        <path d="M23.8 8.2l-2.1 2.1"/>
        <path d="M10.3 21.7l-2.1 2.1"/>
      </svg>
    `,

    widgets: `
      <svg viewBox="0 0 32 32">
        <rect x="6" y="6" width="8" height="8" rx="2"/>
        <rect x="18" y="6" width="8" height="8" rx="2"/>
        <rect x="6" y="18" width="8" height="8" rx="2"/>
        <rect x="18" y="18" width="8" height="8" rx="2"/>
      </svg>
    `,

    bow: `
      <svg viewBox="0 0 32 32">
        <path d="M15 14C10 8 6 9 5 14c1 5 5 6 10 2"/>
        <path d="M17 14c5-6 9-5 10 0-1 5-5 6-10 2"/>
        <circle cx="16" cy="15" r="2.5"/>
      </svg>
    `,
  };

  return icons[name] || icons.widgets;
}

/* ===============================
   占位图
================================ */

function getPlaceholderLabel(id) {
  const map = {
    p1Hero: "头像",
    p1Mini: "图",

    p1SquareA: "",
    p1SquareB: "",
    p1SquareC: "",
    p1SquareD: "",

    p2Media: "图",
    p2RecordA: "A",
    p2RecordB: "B",
  };

  return map[id] || "";
}

function makePlaceholderImage(label = "") {
  const text = escapeHtml(label || "");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f8f8f8"/>
          <stop offset="1" stop-color="#d3d3d3"/>
        </linearGradient>
        <filter id="b">
          <feGaussianBlur stdDeviation="20"/>
        </filter>
      </defs>

      <rect width="1200" height="1200" fill="url(#g)"/>

      <circle cx="300" cy="300" r="160" fill="#ffffff" opacity=".42" filter="url(#b)"/>
      <circle cx="850" cy="320" r="190" fill="#ffffff" opacity=".30" filter="url(#b)"/>
      <circle cx="590" cy="820" r="260" fill="#ffffff" opacity=".32" filter="url(#b)"/>

      ${
        text
          ? `
          <rect x="420" y="420" width="360" height="360" rx="88" fill="none" stroke="#ffffff" stroke-width="24" opacity=".62"/>
          <text x="50%" y="53%" text-anchor="middle"
                font-family="Arial, sans-serif"
                font-size="92"
                font-weight="700"
                fill="#ffffff"
                opacity=".88">${text}</text>
        `
          : ""
      }
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ===============================
   PWA
================================ */

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

/* ===============================
   星星机开场动画
================================ */

function initSplashScreen() {
  const splash = document.getElementById("splashScreen");
  const phone = document.querySelector(".phone-shell");

  if (!splash || !phone) return;

  /**
   * 开场显示时长。
   * 想快一点：1800
   * 想慢一点：2600
   */
  const SPLASH_DURATION = 2200;

  window.setTimeout(() => {
    splash.classList.add("is-hide");
    phone.classList.add("home-ready");
  }, SPLASH_DURATION);

  splash.addEventListener(
    "transitionend",
    () => {
      splash.remove();
    },
    { once: true },
  );
}
