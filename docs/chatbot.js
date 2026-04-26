(function () {
  'use strict';

  const STORAGE_KEY = 'cooking_gemini_key';
  const ADDED_KEY   = 'cooking_added_dishes';
  const GEMINI_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // ── Inject HTML ───────────────────────────────────────────────────
  function injectUI() {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="cb-bubble" onclick="window._cbToggle()" title="Trợ lý nấu ăn">💬</div>
      <div id="cb-panel">
        <div id="cb-header">
          <span>🍳 Trợ lý nấu ăn</span>
          <div>
            <span id="cb-gear" onclick="window._cbSettings()" title="Cài đặt API key">⚙</span>
            <span onclick="window._cbToggle()" title="Đóng">✕</span>
          </div>
        </div>
        <div id="cb-messages"></div>
        <div id="cb-setup">
          <p>Nhập <strong>Gemini API key</strong> của bạn để bắt đầu:</p>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">
            Lấy key miễn phí tại Google AI Studio →
          </a>
          <input id="cb-key-input" type="password" placeholder="AIzaSy..." autocomplete="off" />
          <button onclick="window._cbSaveKey()">Lưu key</button>
        </div>
        <div id="cb-input-row">
          <input id="cb-input" type="text" placeholder="Hỏi gì đó..." autocomplete="off" />
          <button id="cb-send" onclick="window._cbSend()">➤</button>
        </div>
      </div>
    `);
    injectStyles();
    wireEnter();
  }

  // ── Styles ────────────────────────────────────────────────────────
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      #cb-bubble {
        position:fixed; bottom:24px; right:24px; width:52px; height:52px;
        background:linear-gradient(135deg,#e8c97e,#c8a84b); border-radius:50%;
        display:flex; align-items:center; justify-content:center; font-size:24px;
        box-shadow:0 3px 14px rgba(0,0,0,.4); cursor:pointer; z-index:9999;
        user-select:none; transition:transform .15s;
      }
      #cb-bubble:hover { transform:scale(1.08); }
      #cb-panel {
        position:fixed; bottom:88px; right:24px; width:340px; height:480px;
        background:#1e1e30; border-radius:16px; border:1.5px solid #e8c97e44;
        box-shadow:0 8px 32px rgba(0,0,0,.5); display:none; flex-direction:column;
        z-index:9998; overflow:hidden; font-family:inherit; font-size:14px;
      }
      #cb-panel.open { display:flex; }
      #cb-header {
        background:#2d2d44; padding:12px 16px; display:flex;
        align-items:center; justify-content:space-between;
        color:#e8c97e; font-weight:600; border-bottom:1px solid #e8c97e33; flex-shrink:0;
      }
      #cb-header > div { display:flex; gap:14px; }
      #cb-header > div > span { cursor:pointer; opacity:.65; transition:opacity .15s; }
      #cb-header > div > span:hover { opacity:1; }
      #cb-messages {
        flex:1; overflow-y:auto; padding:12px; display:flex;
        flex-direction:column; gap:8px;
      }
      .cb-msg {
        max-width:84%; padding:8px 12px; border-radius:12px;
        font-size:13px; line-height:1.5; word-wrap:break-word; white-space:pre-wrap;
      }
      .cb-bot  { background:#2d2d44; color:#e0e0f0; border-radius:12px 12px 12px 3px; align-self:flex-start; }
      .cb-user { background:#3d3520; color:#e8c97e; border-radius:12px 12px 3px 12px; align-self:flex-end; }
      .cb-err  { background:#3d1a1a; color:#f08080; border-radius:12px; align-self:flex-start; }
      .cb-typing { color:#888; font-style:italic; }
      #cb-setup {
        padding:16px; color:#ccc; font-size:13px;
        display:flex; flex-direction:column; gap:10px; flex-shrink:0;
      }
      #cb-setup a { color:#e8c97e; font-size:12px; }
      #cb-setup input {
        background:#2d2d44; border:1px solid #555; border-radius:8px;
        padding:9px 12px; color:#fff; font-size:13px; outline:none;
      }
      #cb-setup input:focus { border-color:#e8c97e66; }
      #cb-setup button {
        background:linear-gradient(135deg,#e8c97e,#c8a84b); border:none;
        border-radius:8px; padding:9px; font-size:13px; font-weight:700; cursor:pointer;
      }
      #cb-input-row {
        padding:10px 12px; background:#16162a; display:flex; gap:8px;
        align-items:center; border-top:1px solid #2d2d44; flex-shrink:0;
      }
      #cb-input {
        flex:1; background:#2d2d44; border:1px solid #444; border-radius:8px;
        padding:8px 12px; color:#fff; font-size:13px; outline:none;
      }
      #cb-input:focus { border-color:#e8c97e66; }
      #cb-send {
        background:linear-gradient(135deg,#e8c97e,#c8a84b); border:none;
        border-radius:8px; padding:8px 13px; font-size:16px; cursor:pointer; flex-shrink:0;
      }
      #cb-send:disabled { opacity:.45; cursor:not-allowed; }
    `;
    document.head.appendChild(s);
  }

  // ── Toggle open/close ─────────────────────────────────────────────
  window._cbToggle = function () {
    const panel = document.getElementById('cb-panel');
    const opening = panel.classList.toggle('open');
    if (opening && document.getElementById('cb-messages').children.length === 0) {
      const key = localStorage.getItem(STORAGE_KEY);
      if (!key) {
        showSetup();
      } else {
        hideSetup();
        addMsg('bot', 'Xin chào! 👋 Tôi có thể giúp bạn:\n• Tìm món theo từ khoá ("sưởn", "thịt bò")\n• Đếm số món ("có bao nhiêu món chính?")\n• Gợi ý món ăn ("gợi ý món nhẹ tối nay")\n• Đổi thực đơn ("đổi món chính khác đi")\n• Giải thích món ("bánh canh là gì?")\n• Thêm món mới ("thêm bún bò Huế vào món chính")\n• Lên thực đơn tuần\n• Hỏi hôm nay ăn gì?');
      }
    }
  };

  // ── Setup screen ──────────────────────────────────────────────────
  window._cbSettings = function () { showSetup(); };

  function showSetup() {
    document.getElementById('cb-setup').style.display = 'flex';
    document.getElementById('cb-input-row').style.display = 'none';
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) document.getElementById('cb-key-input').value = existing;
  }

  function hideSetup() {
    document.getElementById('cb-setup').style.display = 'none';
    document.getElementById('cb-input-row').style.display = 'flex';
  }

  window._cbSaveKey = function () {
    const key = document.getElementById('cb-key-input').value.trim();
    if (!key) return;
    localStorage.setItem(STORAGE_KEY, key);
    hideSetup();
    if (document.getElementById('cb-messages').children.length === 0) {
      addMsg('bot', 'Key đã lưu! ✅ Bạn muốn hỏi gì về thực đơn?');
    }
  };

  // ── Message helpers ───────────────────────────────────────────────
  function addMsg(type, text) {
    const msgs = document.getElementById('cb-messages');
    const div  = document.createElement('div');
    div.className = 'cb-msg cb-' + type;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function addTyping() { return addMsg('bot cb-typing', '...'); }

  // ── System prompt ─────────────────────────────────────────────────
  function getMeals() {
    /* allMeals is a let/const in the main page script.
       Non-module scripts share the global lexical env, so it is
       accessible here by name after the main script has run. */
    /* global allMeals */
    return (typeof allMeals !== 'undefined') ? allMeals : { main: [], side: [], soup: [] };
  }

  function getAdded() {
    try {
      return JSON.parse(localStorage.getItem(ADDED_KEY) || '{"main":[],"side":[],"soup":[]}');
    } catch {
      return { main: [], side: [], soup: [] };
    }
  }

  function buildSystemPrompt() {
    const meals = getMeals();
    const added = getAdded();
    const merge = cat => [...(meals[cat] || []), ...(added[cat] || [])];
    const main  = merge('main');
    const side  = merge('side');
    const soup  = merge('soup');
    const cur = id => (document.getElementById(id) || {}).textContent || '?';
    return `You are a Vietnamese family meal planning assistant embedded in a cooking website.

Today's menu: ${cur('meal-main')} | ${cur('meal-side')} | ${cur('meal-soup')}

Available meals:
- Main dishes (${main.length}): ${main.join(', ')}
- Side dishes (${side.length}): ${side.join(', ')}
- Soups (${soup.length}): ${soup.join(', ')}

Always respond with valid JSON only — no markdown fences, no explanation outside the JSON:
{
  "action": "chat" | "reroll_main" | "reroll_side" | "reroll_soup" | "reroll_all" | "add_dish",
  "response": "your reply to the user",
  "data": { "category": "main|side|soup", "name": "dish name" }
}

Rules:
- Reply in the SAME language the user writes in (Vietnamese → Vietnamese, English → English)
- For reroll actions, include a friendly response text confirming the change
- For add_dish, data must have category ("main", "side", or "soup") and name; confirm what you added
- For all other actions, data may be null or omitted
- Keep responses concise (1–3 sentences max)`;
  }

  // ── Gemini API ────────────────────────────────────────────────────
  async function callGemini(userMsg) {
    const key = localStorage.getItem(STORAGE_KEY);
    if (!key) throw new Error('No API key');
    const res = await fetch(GEMINI_URL + '?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e   = new Error('Gemini API error');
      e.status  = res.status;
      e.detail  = err;
      throw e;
    }
    const json = await res.json();
    const raw  = (json.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/,'').trim();
    return JSON.parse(clean);
  }

  // ── Action handlers ───────────────────────────────────────────────
  function executeAction(action, data) {
    switch (action) {
      case 'reroll_main': rerollCat('main'); break;
      case 'reroll_side': rerollCat('side'); break;
      case 'reroll_soup': rerollCat('soup'); break;
      case 'reroll_all':
        if (typeof window.reroll === 'function') window.reroll();
        break;
      case 'add_dish':
        if (data && data.category && data.name) addDish(data.category, data.name);
        break;
    }
  }

  function rerollCat(cat) {
    const meals = getMeals();
    const pool  = [...(meals[cat] || []), ...(getAdded()[cat] || [])];
    if (!pool.length) return;
    const el  = document.getElementById('meal-' + cat);
    if (!el) return;
    const cur = el.textContent;
    const avail = pool.filter(m => m !== cur);
    el.textContent = avail.length
      ? avail[Math.floor(Math.random() * avail.length)]
      : pool[Math.floor(Math.random() * pool.length)];
  }

  function addDish(category, name) {
    const cat   = ['main','side','soup'].includes(category) ? category : 'main';
    const saved = getAdded();
    if (!saved[cat].includes(name)) {
      saved[cat].push(name);
      localStorage.setItem(ADDED_KEY, JSON.stringify(saved));
    }
  }

  // ── Send ──────────────────────────────────────────────────────────
  window._cbSend = async function () {
    const input = document.getElementById('cb-input');
    const text  = (input.value || '').trim();
    if (!text) return;

    if (!localStorage.getItem(STORAGE_KEY)) { showSetup(); return; }

    input.value = '';
    addMsg('user', text);

    const btn    = document.getElementById('cb-send');
    btn.disabled = true;
    const typing = addTyping();

    try {
      const result = await callGemini(text);
      typing.remove();
      addMsg('bot', result.response || '...');
      if (result.action && result.action !== 'chat') {
        executeAction(result.action, result.data || null);
      }
    } catch (err) {
      typing.remove();
      if (err.status === 429) {
        addMsg('err', 'Đã dùng hết quota hôm nay. Thử lại ngày mai nhé. 😅');
      } else if (err.status === 400 || err.status === 403) {
        addMsg('err', 'API key không hợp lệ. Nhấn ⚙ để cập nhật.');
      } else if (err instanceof SyntaxError) {
        addMsg('err', 'Chatbot trả về định dạng lạ. Thử gửi lại nhé!');
      } else if (err instanceof TypeError || !navigator.onLine) {
        addMsg('err', 'Không có kết nối internet. Kiểm tra lại nhé!');
      } else {
        addMsg('err', 'Chatbot tạm thời không khả dụng 😅 Thử lại sau nhé.');
      }
    } finally {
      btn.disabled = false;
      input.focus();
    }
  };

  // ── Enter key ─────────────────────────────────────────────────────
  function wireEnter() {
    document.getElementById('cb-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._cbSend(); }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    injectUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
