(function () {
  'use strict';

  const STORAGE_KEY = 'cooking_llm_key';
  const ADDED_KEY   = 'cooking_added_dishes';
  const GROQ_URL    = 'https://api.groq.com/openai/v1/chat/completions';
  const HISTORY_MAX = 8;

  // Short-term chat memory (cleared on page reload)
  const chatHistory = [];
  function pushHistory(role, text) {
    chatHistory.push({ role, text });
    while (chatHistory.length > HISTORY_MAX) chatHistory.shift();
  }

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
          <p>Nhập <strong>Groq API key</strong> của bạn để bắt đầu:</p>
          <a href="https://console.groq.com/keys" target="_blank" rel="noopener">
            Lấy key miễn phí tại Groq Console →
          </a>
          <input id="cb-key-input" type="password" placeholder="gsk_..." autocomplete="off" />
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
        box-shadow:0 3px 14px rgba(0,0,0,.4); cursor:pointer; z-index:99999;
        user-select:none; transition:transform .15s;
      }
      #cb-bubble:hover { transform:scale(1.08); }
      #cb-panel {
        position:fixed; bottom:88px; right:24px; width:340px; height:480px;
        background:#1e1e30; border-radius:16px; border:1.5px solid #e8c97e44;
        box-shadow:0 8px 32px rgba(0,0,0,.5); display:none; flex-direction:column;
        z-index:99998; overflow:hidden; font-family:inherit; font-size:14px;
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
      @media (max-width: 520px) {
        #cb-panel { width:calc(100vw - 16px); right:8px; bottom:76px; }
        #cb-bubble { bottom:16px; right:16px; }
      }
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

  // ── Intent router ─────────────────────────────────────────────────
  function detectLanguage(msg) {
    const vietDiacritics = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
    const vietWords = /\b(có|la|là|khong|không|thêm|them|đổi|doi|canh|súp|sup|món|mon|chính|chinh|phụ|phu|rau|cá|ca|sườn|suon|hôm nay|hom nay|bao nhiêu|bao nhieu|gì|gi|của|cua|cho|đi|di|nhé|nhe)\b/i;
    return (vietDiacritics.test(msg) || vietWords.test(msg)) ? 'Vietnamese' : 'English';
  }

  function extractTarget(msg) {
    const stopwords = new Set([
      'đổi','doi','change','reroll','sang','thành','thanh','to',
      'canh','súp','sup','soup','món','mon','chính','chinh','main',
      'phụ','phu','rau','side','thêm','them','add','vào','vao',
      'khác','khac','other','different'
    ]);
    const cleaned = msg
      .split(/[\s.,!?:;]+/)
      .filter(w => w && !stopwords.has(w.toLowerCase()))
      .join(' ')
      .trim();
    return cleaned || null;
  }

  function detectIntent(msg) {
    const lower = msg.toLowerCase();
    const hasMonChinh = /món chính|mon chinh/i.test(lower);
    const hasMonPhu   = /món phụ|mon phu|món rau|mon rau/i.test(lower);

    const words = lower.split(/[\s.,!?:;]+/).filter(Boolean);
    const hasWord = (...list) => list.some(w => words.includes(w));

    const hasSoup    = hasWord('canh','súp','sup','soup');
    const hasMain    = hasMonChinh || hasWord('main');
    const hasSide    = hasMonPhu   || hasWord('side','rau');
    const isAdd      = hasWord('thêm','them','add');
    const isReroll   = hasWord('đổi','doi','change','reroll','khác','khac','other','different');
    const isQuestion = /\?|bao nhiêu|bao nhieu|how many|how much|what is|là gì|la gi/i.test(lower);

    let category = null;
    if (hasSoup) category = 'soup';
    else if (hasMain) category = 'main';
    else if (hasSide) category = 'side';

    if (isQuestion) return { action: 'chat' };
    if (isAdd && category) {
      return { action: 'add_dish', category, target: extractTarget(msg) };
    }
    if (isReroll && category) {
      return { action: 'reroll', category, target: extractTarget(msg) };
    }
    if (isReroll) {
      return { action: 'reroll_all' };
    }
    return { action: 'chat' };
  }

  window._detectIntent = detectIntent;
  window._detectLanguage = detectLanguage;
  window._extractTarget = extractTarget;

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

  function buildRerollPrompt(category, target, language) {
    const meals = getMeals();
    const added = getAdded();
    const list  = [...(meals[category] || []), ...(added[category] || [])].join(', ');
    const catLabel = category === 'soup' ? 'canh/soup'
                   : category === 'main' ? 'main dish/món chính'
                   : 'side dish/món phụ';
    const currentDish = (document.getElementById('meal-' + category) || {}).textContent || '';
    const avoidLine = currentDish ? `\nDo NOT pick: ${currentDish}` : '';
    return `You help a Vietnamese family pick dinner dishes.

The user wants a new ${catLabel}.${target ? `\nThey prefer something related to: ${target}` : ''}${avoidLine}

Available ${category} dishes:
${list}

Pick ONE dish name from the list (if target given, pick the best match; otherwise pick any different dish). Respond ONLY as JSON:
{"dish": "<exact dish name from the list>", "response": "<friendly 1-sentence reply in ${language}>"}`;
  }

  function buildAddPrompt(category, target, userMsg, language) {
    const catLabel = category === 'soup' ? 'canh/soup'
                   : category === 'main' ? 'main dish/món chính'
                   : 'side dish/món phụ';
    return `The user wants to add a new ${catLabel} to their meal list.
User's request: "${userMsg}"${target ? `\nThey mentioned: ${target}` : ''}

Suggest ONE full Vietnamese dish name that fits what the user described. The dish can be new (not required to be in any existing list). Respond ONLY as JSON:
{"dish": "<full dish name>", "response": "<friendly 1-sentence confirmation in ${language}>"}`;
  }

  function buildChatPrompt(userMsg, language) {
    const meals = getMeals();
    const added = getAdded();
    const merge = cat => [...(meals[cat] || []), ...(added[cat] || [])];
    const main = merge('main');
    const side = merge('side');
    const soup = merge('soup');
    const cur = id => (document.getElementById(id) || {}).textContent || '?';
    return `You are a Vietnamese family meal assistant. Reply conversationally in ${language} (1-3 sentences).

Today's menu: ${cur('meal-main')} | ${cur('meal-side')} | ${cur('meal-soup')}
Available meals:
- Main dishes (${main.length}): ${main.join(', ')}
- Side dishes (${side.length}): ${side.join(', ')}
- Soups (${soup.length}): ${soup.join(', ')}

IMPORTANT: Use the conversation history to understand context. If you previously proposed options and the user agrees ("ok", "any is fine", "cái nào cũng được", "bạn chọn đi") — PICK ONE specific dish and include it as an action so the page updates. Do NOT ask the same question twice.

Respond ONLY as JSON:
{
  "action": "chat" | "reroll_main" | "reroll_side" | "reroll_soup" | "add_dish",
  "category": "main|side|soup (only when action=add_dish)",
  "dish": "<exact dish name from the list (required when action is reroll_* or add_dish)>",
  "response": "<your reply to user>"
}

Use action="chat" for questions/explanations. Use reroll_* only when the user has agreed to a prior proposal or clearly wants a change.`;
  }

  // ── Groq API ──────────────────────────────────────────────────────
  async function callLLM(systemPrompt, userMsg, includeHistory) {
    const key = localStorage.getItem(STORAGE_KEY);
    if (!key) throw new Error('No API key');
    const messages = [{ role: 'system', content: systemPrompt }];
    if (includeHistory) {
      for (const h of chatHistory) {
        messages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.text
        });
      }
    }
    messages.push({ role: 'user', content: userMsg });
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.7,
        max_tokens: 512,
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e   = new Error('Groq API error');
      e.status  = res.status;
      e.detail  = err;
      throw e;
    }
    const json = await res.json();
    const raw  = (json.choices?.[0]?.message?.content || '').trim();
    return JSON.parse(raw);
  }

  // ── Action handlers ───────────────────────────────────────────────
  function rerollCat(cat, targetName) {
    const meals = getMeals();
    const pool  = [...(meals[cat] || []), ...(getAdded()[cat] || [])];
    if (!pool.length) return;
    const el  = document.getElementById('meal-' + cat);
    if (!el) return;
    let picked = null;
    if (targetName) {
      const t = targetName.toLowerCase();
      picked = pool.find(m => m.toLowerCase() === t)
            || pool.find(m => m.toLowerCase().includes(t))
            || pool.find(m => t.includes(m.toLowerCase()));
    }
    if (!picked) {
      const cur   = el.textContent;
      const avail = pool.filter(m => m !== cur);
      picked = avail.length
        ? avail[Math.floor(Math.random() * avail.length)]
        : pool[Math.floor(Math.random() * pool.length)];
    }
    el.textContent = picked;
    if (typeof window.updateMarket === 'function') {
      const people = Number(document.getElementById('people-select')?.value || 1);
      const mealNames = ['meal-main','meal-side','meal-soup']
        .map(id => (document.getElementById(id)?.textContent || ''))
        .filter(t => t && !t.startsWith('No '));
      window.updateMarket(people, mealNames);
    }
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
    pushHistory('user', text);

    const btn    = document.getElementById('cb-send');
    btn.disabled = true;
    const typing = addTyping();

    let botReply = '';

    try {
      const intent   = detectIntent(text);
      const language = detectLanguage(text);

      if (intent.action === 'reroll' && intent.category) {
        const result = await callLLM(
          buildRerollPrompt(intent.category, intent.target, language),
          text
        );
        typing.remove();
        if (result.dish) rerollCat(intent.category, result.dish);
        botReply = result.response || '...';
        addMsg('bot', botReply);

      } else if (intent.action === 'add_dish' && intent.category) {
        const result = await callLLM(
          buildAddPrompt(intent.category, intent.target, text, language),
          text
        );
        typing.remove();
        if (result.dish) addDish(intent.category, result.dish);
        botReply = result.response || (result.dish ? '✅ ' + result.dish : '...');
        addMsg('bot', botReply);

      } else if (intent.action === 'reroll_all') {
        typing.remove();
        if (typeof window.reroll === 'function') window.reroll();
        botReply = language === 'Vietnamese'
          ? 'Đã đổi toàn bộ thực đơn cho bạn! 🍽️'
          : 'Full menu rerolled! 🍽️';
        addMsg('bot', botReply);

      } else {
        // Chat: pass history so Groq can respond to context-dependent messages
        // ("any is fine" after a proposal) and optionally trigger a reroll/add.
        const result = await callLLM(buildChatPrompt(text, language), text, true);
        typing.remove();
        if (result.action && result.dish) {
          if (result.action === 'reroll_main') rerollCat('main', result.dish);
          else if (result.action === 'reroll_side') rerollCat('side', result.dish);
          else if (result.action === 'reroll_soup') rerollCat('soup', result.dish);
          else if (result.action === 'add_dish' && result.category) addDish(result.category, result.dish);
        }
        botReply = result.response || '...';
        addMsg('bot', botReply);
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
      if (botReply) pushHistory('bot', botReply);
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
