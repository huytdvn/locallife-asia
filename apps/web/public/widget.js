/**
 * Local Life Asia chat widget — embeddable in back-office dashboards.
 *
 * Embed:
 *   <script
 *     src="https://chat.locallife.asia/widget.js"
 *     data-mode="host"               <!-- "host" | "lok" -->
 *     data-token="<HMAC-token>"      <!-- minted by your backend -->
 *     data-endpoint="https://chat.locallife.asia/api/chat/widget"
 *     async defer></script>
 *
 * Renders a floating bubble bottom-right + a slide-up chat panel.
 * Pure vanilla — no React, no deps. ~6 KB minified.
 */
(function () {
  "use strict";
  if (window.__llaWidgetMounted) return;
  window.__llaWidgetMounted = true;

  var script = document.currentScript;
  var MODE = (script && script.dataset.mode) || "host";
  var TOKEN = (script && script.dataset.token) || "";
  var ENDPOINT =
    (script && script.dataset.endpoint) ||
    inferEndpoint(script && script.src);

  if (!TOKEN) {
    console.warn("[lla-widget] data-token missing — widget disabled");
    return;
  }
  if (MODE !== "host" && MODE !== "lok") {
    console.warn("[lla-widget] data-mode must be host|lok, got:", MODE);
    return;
  }

  var THEME = {
    accent: "#2f7d4f",
    accentDark: "#1f5a37",
    bg: "#ffffff",
    text: "#1a1a1a",
    muted: "#6b7280",
    border: "#e5e7eb",
    bubbleUser: "#dcfce7",
    bubbleBot: "#f3f4f6",
  };

  injectStyles();
  var ui = mountUI();
  var history = [];
  var streaming = false;

  ui.bubble.addEventListener("click", function () {
    ui.panel.classList.toggle("lla-open");
    if (ui.panel.classList.contains("lla-open") && history.length === 0) {
      pushBot(welcomeMessage(MODE));
    }
  });
  ui.close.addEventListener("click", function () {
    ui.panel.classList.remove("lla-open");
  });
  ui.form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = ui.input.value.trim();
    if (!t || streaming) return;
    ui.input.value = "";
    pushUser(t);
    send(t);
  });

  function send(userText) {
    streaming = true;
    history.push({ role: "user", content: userText });
    var msgEl = pushBot("");
    var dots = document.createElement("span");
    dots.className = "lla-dots";
    dots.textContent = "•••";
    msgEl.appendChild(dots);

    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + TOKEN,
      },
      body: JSON.stringify({ messages: history }),
    })
      .then(function (resp) {
        if (!resp.ok) {
          return resp.text().then(function (t) {
            throw new Error("HTTP " + resp.status + ": " + t);
          });
        }
        if (!resp.body) throw new Error("no body");
        var reader = resp.body.getReader();
        var decoder = new TextDecoder();
        var buf = "";
        var collected = "";
        msgEl.removeChild(dots);

        function pump() {
          return reader.read().then(function (chunk) {
            if (chunk.done) return;
            buf += decoder.decode(chunk.value, { stream: true });
            var events = buf.split("\n\n");
            buf = events.pop() || "";
            for (var i = 0; i < events.length; i++) {
              var ev = parseSSE(events[i]);
              if (!ev) continue;
              if (ev.event === "delta" && ev.data && ev.data.text) {
                collected += ev.data.text;
                msgEl.textContent = collected;
                ui.body.scrollTop = ui.body.scrollHeight;
              } else if (ev.event === "tool_start") {
                // optional: visible tool spinner
              } else if (ev.event === "citations") {
                renderCitations(msgEl, ev.data);
              } else if (ev.event === "error") {
                msgEl.textContent = collected + "\n\n[Lỗi: " + (ev.data && ev.data.message) + "]";
              }
            }
            return pump();
          });
        }
        return pump().then(function () {
          if (collected) history.push({ role: "assistant", content: collected });
        });
      })
      .catch(function (err) {
        msgEl.textContent = "Xin lỗi, đang gặp sự cố: " + err.message;
      })
      .finally(function () {
        streaming = false;
      });
  }

  function pushUser(text) {
    var d = document.createElement("div");
    d.className = "lla-msg lla-user";
    d.textContent = text;
    ui.body.appendChild(d);
    ui.body.scrollTop = ui.body.scrollHeight;
  }
  function pushBot(text) {
    var d = document.createElement("div");
    d.className = "lla-msg lla-bot";
    d.textContent = text;
    ui.body.appendChild(d);
    ui.body.scrollTop = ui.body.scrollHeight;
    return d;
  }
  function renderCitations(msgEl, data) {
    if (!data || !data.refs || data.refs.length === 0) return;
    var box = document.createElement("div");
    box.className = "lla-cites";
    box.innerHTML =
      "<div class=lla-cites-h>Nguồn:</div>" +
      data.refs
        .slice(0, 3)
        .map(function (r) {
          return "<div class=lla-cite>📄 " + escapeHTML(r.title || r.path) + "</div>";
        })
        .join("");
    msgEl.appendChild(box);
  }
  function welcomeMessage(mode) {
    if (mode === "host") {
      return "Chào anh/chị 🌿 Bé Tre đây — em hỗ trợ onboarding host (đăng ký, list sản phẩm, chính sách hoa hồng…). Anh/chị muốn hỏi gì ạ?";
    }
    return "Chào bạn ✨ Bé Tre đây — mình hỗ trợ onboarding LOK (Local Opinions). Bạn muốn biết về chương trình hay cách tham gia?";
  }
  function parseSSE(block) {
    var event = "message";
    var data = "";
    var lines = block.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l.indexOf("event:") === 0) event = l.slice(6).trim();
      else if (l.indexOf("data:") === 0) data += l.slice(5).trim();
    }
    if (!data) return null;
    try {
      return { event: event, data: JSON.parse(data) };
    } catch (_) {
      return { event: event, data: data };
    }
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function inferEndpoint(src) {
    if (!src) return "/api/chat/widget";
    try {
      var u = new URL(src);
      return u.origin + "/api/chat/widget";
    } catch (_) {
      return "/api/chat/widget";
    }
  }

  function mountUI() {
    var root = document.createElement("div");
    root.className = "lla-widget-root";
    root.innerHTML =
      '<button class="lla-bubble" aria-label="Mở chat">💬</button>' +
      '<div class="lla-panel" role="dialog">' +
      '  <div class="lla-head">' +
      '    <div class="lla-head-t">🌿 Bé Tre — trợ lý ' +
      (MODE === "host" ? "host" : "LOK") +
      '</div>' +
      '    <button class="lla-close" aria-label="Đóng">×</button>' +
      '  </div>' +
      '  <div class="lla-body"></div>' +
      '  <form class="lla-form">' +
      '    <input class="lla-input" placeholder="Hỏi gì cũng được nha…" autocomplete="off" />' +
      '    <button type="submit" class="lla-send" aria-label="Gửi">↑</button>' +
      '  </form>' +
      '</div>';
    document.body.appendChild(root);
    return {
      bubble: root.querySelector(".lla-bubble"),
      panel: root.querySelector(".lla-panel"),
      close: root.querySelector(".lla-close"),
      body: root.querySelector(".lla-body"),
      form: root.querySelector(".lla-form"),
      input: root.querySelector(".lla-input"),
    };
  }

  function injectStyles() {
    if (document.getElementById("lla-widget-style")) return;
    var s = document.createElement("style");
    s.id = "lla-widget-style";
    s.textContent =
      ".lla-widget-root{position:fixed;bottom:20px;right:20px;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}" +
      ".lla-bubble{width:56px;height:56px;border-radius:50%;border:none;background:" + THEME.accent + ";color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);transition:transform .2s}" +
      ".lla-bubble:hover{transform:scale(1.06)}" +
      ".lla-panel{position:absolute;bottom:72px;right:0;width:360px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 100px);background:" + THEME.bg + ";border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden}" +
      ".lla-panel.lla-open{display:flex;animation:lla-in .2s ease-out}" +
      "@keyframes lla-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}" +
      ".lla-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:" + THEME.accent + ";color:#fff}" +
      ".lla-head-t{font-weight:600;font-size:15px}" +
      ".lla-close{background:transparent;border:none;color:#fff;font-size:24px;cursor:pointer;line-height:1;padding:0;width:24px;height:24px}" +
      ".lla-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#fafafa}" +
      ".lla-msg{padding:9px 12px;border-radius:12px;max-width:85%;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;color:" + THEME.text + "}" +
      ".lla-user{align-self:flex-end;background:" + THEME.bubbleUser + "}" +
      ".lla-bot{align-self:flex-start;background:" + THEME.bubbleBot + "}" +
      ".lla-dots{color:" + THEME.muted + ";letter-spacing:2px}" +
      ".lla-cites{margin-top:8px;padding-top:8px;border-top:1px solid " + THEME.border + ";font-size:12px;color:" + THEME.muted + "}" +
      ".lla-cites-h{font-weight:600;margin-bottom:4px}" +
      ".lla-cite{margin:2px 0}" +
      ".lla-form{display:flex;border-top:1px solid " + THEME.border + ";background:#fff}" +
      ".lla-input{flex:1;border:none;outline:none;padding:14px;font-size:14px;color:" + THEME.text + ";font-family:inherit}" +
      ".lla-send{border:none;background:" + THEME.accent + ";color:#fff;width:48px;cursor:pointer;font-size:18px}" +
      ".lla-send:hover{background:" + THEME.accentDark + "}";
    document.head.appendChild(s);
  }
})();
