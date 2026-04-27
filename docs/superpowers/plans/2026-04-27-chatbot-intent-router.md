# Chatbot Intent Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move action routing from Groq's LLM into `meal-assistant.js` using local Vietnamese/English keyword detection, so the chatbot always updates the category the user asked for (no more "change soup" routing to "change main").

**Architecture:** `detectIntent(msg)` + `extractTarget(msg)` + `detectLanguage(msg)` run locally before any API call. Based on the intent, one of three focused Groq prompts is chosen (reroll / add / chat). Groq only picks a dish name and writes a reply — it never decides routing.

**Tech Stack:** Vanilla JavaScript (`docs/meal-assistant.js`), Groq API (`llama-3.3-70b-versatile`).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/meal-assistant.js` | **MODIFY** | Add 3 detection helpers + 3 prompt builders, refactor `_cbSend`, remove old `buildSystemPrompt` + `executeAction` |

Single-file change.

---

## Task 1: Add detection helpers

**Files:**
- Modify: `docs/meal-assistant.js` — insert new helpers just before the existing `getMeals()` function (search for `function getMeals`)

- [ ] **Step 1: Add `detectLanguage()`**

Insert this function just before `function getMeals()`:

```javascript
  // ── Intent router ─────────────────────────────────────────────────
  function detectLanguage(msg) {
    const vietDiacritics = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
    const vietWords = /\b(có|la|là|khong|không|thêm|them|đổi|doi|canh|súp|sup|món|mon|chính|chinh|phụ|phu|rau|cá|ca|sườn|suon|hôm nay|hom nay|bao nhiêu|bao nhieu|gì|gi|của|cua|cho|đi|di|nhé|nhe)\b/i;
    return (vietDiacritics.test(msg) || vietWords.test(msg)) ? 'Vietnamese' : 'English';
  }
```

- [ ] **Step 2: Add `extractTarget()`**

Immediately after `detectLanguage`, add:

```javascript
  function extractTarget(msg) {
    const stopwords = [
      'đổi','doi','change','reroll','sang','thành','thanh','to',
      'canh','súp','sup','soup','món','mon','chính','chinh','main',
      'phụ','phu','rau','side','thêm','them','add','vào','vao',
      'khác','khac','other','different'
    ];
    const pattern = new RegExp('\\b(' + stopwords.join('|') + ')\\b', 'gi');
    const cleaned = msg.replace(pattern, '').trim().replace(/\s+/g, ' ');
    return cleaned || null;
  }
```

- [ ] **Step 3: Add `detectIntent()`**

Immediately after `extractTarget`, add:

```javascript
  function detectIntent(msg) {
    const hasSoup = /\b(canh|súp|sup|soup)\b/i.test(msg);
    const hasMain = /(món chính|mon chinh|\bmain\b)/i.test(msg);
    const hasSide = /(món phụ|mon phu|món rau|mon rau|\bside\b|\brau\b)/i.test(msg);
    const isAdd      = /\b(thêm|them|add)\b/i.test(msg);
    const isReroll   = /\b(đổi|doi|change|reroll|khác|khac|other|different)\b/i.test(msg);
    const isQuestion = /\?|bao nhiêu|bao nhieu|how many|how much|what is|là gì|la gi/i.test(msg);

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
```

- [ ] **Step 4: Manually verify in browser console**

Open `docs/index.html` in browser. Open DevTools Console. Type each of these and confirm the expected output:

```javascript
detectIntent('đổi canh khác')
// Expected: {action: 'reroll', category: 'soup', target: null}

detectIntent('đổi canh sang cá hồi')
// Expected: {action: 'reroll', category: 'soup', target: 'cá hồi'}

detectIntent('thêm bún bò Huế vào món chính')
// Expected: {action: 'add_dish', category: 'main', target: 'bún bò Huế'}

detectIntent('how many soups are there?')
// Expected: {action: 'chat'}

detectIntent('đổi toàn bộ thực đơn')
// Expected: {action: 'reroll_all'}

detectIntent('bánh canh là gì?')
// Expected: {action: 'chat'}
```

All 6 cases must pass. If any fail, fix the regex before committing.

- [ ] **Step 5: Commit**

```bash
git add docs/meal-assistant.js
git commit -m "feat: add local intent router for chatbot"
```

---

## Task 2: Add focused prompt builders

**Files:**
- Modify: `docs/meal-assistant.js` — add 3 new prompt-builder functions after the existing `buildSystemPrompt` function

- [ ] **Step 1: Add `buildRerollPrompt()`**

Find the end of `buildSystemPrompt()` function (look for the closing `\`;` followed by `}` — the template-literal ends the function). Immediately after that closing brace, add:

```javascript
  function buildRerollPrompt(category, target, language) {
    const meals = getMeals();
    const added = getAdded();
    const list  = [...(meals[category] || []), ...(added[category] || [])].join(', ');
    const catLabel = category === 'soup' ? 'canh/soup'
                   : category === 'main' ? 'main dish/món chính'
                   : 'side dish/món phụ';
    return `You help a Vietnamese family pick dinner dishes.

The user wants a new ${catLabel}.${target ? '\nThey prefer something related to: ' + target : ''}

Available ${category} dishes:
${list}

Pick ONE dish name from the list (if target given, pick the best match; otherwise pick one different from current). Respond ONLY as JSON:
{"dish": "<exact dish name from the list>", "response": "<friendly 1-sentence reply in ${language}>"}`;
  }
```

- [ ] **Step 2: Add `buildAddPrompt()`**

Immediately after `buildRerollPrompt`, add:

```javascript
  function buildAddPrompt(category, target, userMsg, language) {
    const catLabel = category === 'soup' ? 'soup/canh'
                   : category === 'main' ? 'main/món chính'
                   : 'side/món phụ';
    return `The user wants to add a dish to the ${catLabel} category.
User's request: "${userMsg}"${target ? '\nThey mentioned: ' + target : ''}

Suggest ONE full dish name in Vietnamese. Respond ONLY as JSON:
{"dish": "<full dish name>", "response": "<friendly 1-sentence confirmation in ${language}>"}`;
  }
```

- [ ] **Step 3: Add `buildChatPrompt()`**

Immediately after `buildAddPrompt`, add:

```javascript
  function buildChatPrompt(userMsg, language) {
    const meals = getMeals();
    const added = getAdded();
    const merge = cat => [...(meals[cat] || []), ...(added[cat] || [])];
    const main = merge('main');
    const side = merge('side');
    const soup = merge('soup');
    const cur = id => (document.getElementById(id) || {}).textContent || '?';
    return `You are a Vietnamese family meal assistant.

Today's menu: ${cur('meal-main')} | ${cur('meal-side')} | ${cur('meal-soup')}
Available meals:
- Main dishes (${main.length}): ${main.join(', ')}
- Side dishes (${side.length}): ${side.join(', ')}
- Soups (${soup.length}): ${soup.join(', ')}

User: "${userMsg}"

Reply conversationally in ${language}. Concise (1-3 sentences). Respond ONLY as JSON:
{"response":"..."}`;
  }
```

- [ ] **Step 4: Commit**

```bash
git add docs/meal-assistant.js
git commit -m "feat: add focused prompt builders (reroll, add, chat)"
```

---

## Task 3: Refactor callLLM + rewrite _cbSend to use the router

**Files:**
- Modify: `docs/meal-assistant.js` — rename `callGemini` to `callLLM`, change signature, rewrite `_cbSend`, remove `executeAction` and old `buildSystemPrompt`

- [ ] **Step 1: Rename `callGemini` → `callLLM` and accept prompt parameter**

Find the existing `async function callGemini(userMsg) {` and replace the entire function with:

```javascript
  async function callLLM(systemPrompt, userMsg) {
    const key = localStorage.getItem(STORAGE_KEY);
    if (!key) throw new Error('No API key');
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMsg }
        ],
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
```

- [ ] **Step 2: Replace `_cbSend` body with router-based flow**

Find `window._cbSend = async function () {` and replace the ENTIRE function (through its closing `};`) with:

```javascript
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
      const intent   = detectIntent(text);
      const language = detectLanguage(text);

      if (intent.action === 'reroll' && intent.category) {
        const result = await callLLM(
          buildRerollPrompt(intent.category, intent.target, language),
          text
        );
        typing.remove();
        if (result.dish) {
          rerollCat(intent.category, result.dish);
        }
        addMsg('bot', result.response || '...');

      } else if (intent.action === 'add_dish' && intent.category) {
        const result = await callLLM(
          buildAddPrompt(intent.category, intent.target, text, language),
          text
        );
        typing.remove();
        if (result.dish) {
          addDish(intent.category, result.dish);
        }
        addMsg('bot', result.response || ('✅ ' + (result.dish || '')));

      } else if (intent.action === 'reroll_all') {
        typing.remove();
        if (typeof window.reroll === 'function') window.reroll();
        addMsg('bot', language === 'Vietnamese'
          ? 'Đã đổi toàn bộ thực đơn cho bạn! 🍽️'
          : 'Full menu rerolled! 🍽️');

      } else {
        const result = await callLLM(buildChatPrompt(text, language), text);
        typing.remove();
        addMsg('bot', result.response || '...');
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
```

- [ ] **Step 3: Delete old `buildSystemPrompt` and `executeAction`**

Find `function buildSystemPrompt()` (the original monolithic one — NOT the three new builders). Delete the entire function including its template literal and closing `}`.

Find `function executeAction(action, data)` and delete the entire function including its switch statement and closing `}`.

These are no longer called anywhere. The `rerollCat` and `addDish` functions stay — they're called directly from `_cbSend` now.

- [ ] **Step 4: Verify no references to deleted functions remain**

Run in a terminal:
```bash
cd "C:/Phap_data_to_new_laptop/Phap_20220427/101_CLAUDE/cooking_setup"
grep -n "buildSystemPrompt\|executeAction\|callGemini" docs/meal-assistant.js
```

Expected: no output (no matches). If any line is printed, that reference must be fixed before proceeding.

- [ ] **Step 5: Commit**

```bash
git add docs/meal-assistant.js
git commit -m "refactor: router-based _cbSend, drop monolithic LLM routing"
```

---

## Task 4: Manual end-to-end browser test

**Files:** none (testing only)

Open `docs/index.html` in a browser. Make sure you have a valid Groq API key entered (⚙ menu).

- [ ] **Step 1: Test soup reroll (was the broken case)**

Type: `đổi canh khác`

Expected:
- **SOUP** card changes to a new soup
- MAIN and SIDE unchanged
- NGUYEN LIEU section updates to show new soup's ingredients
- Chat response confirms the change in Vietnamese

- [ ] **Step 2: Test main reroll with target**

Type: `đổi món chính sang sườn`

Expected:
- **MAIN** card changes to a sườn dish
- SIDE and SOUP unchanged
- NGUYEN LIEU updates
- Chat response mentions sườn

- [ ] **Step 3: Test side reroll**

Type: `đổi món phụ đi`

Expected:
- **SIDE** card changes; MAIN and SOUP unchanged

- [ ] **Step 4: Test full reroll**

Type: `đổi toàn bộ thực đơn`

Expected: all 3 cards change, ingredient section updates, chat confirms.

- [ ] **Step 5: Test add dish**

Type: `thêm bún bò Huế vào món chính`

Expected: chat shows confirmation (e.g. "Đã thêm Bún bò Huế vào món chính!"). Then type `bao nhiêu món chính?` — count should include the added dish.

- [ ] **Step 6: Test question (no routing)**

Type: `có bao nhiêu món canh?`

Expected: bot REPLIES with the count. Cards do NOT change.

- [ ] **Step 7: Test English**

Type: `change the soup to fish`

Expected: SOUP card changes to a fish soup. Response in English.

- [ ] **Step 8: Test chat / explain**

Type: `bánh canh là gì?`

Expected: bot explains bánh canh. No card changes.

- [ ] **Step 9: Push to GitHub Pages**

```bash
cd "C:/Phap_data_to_new_laptop/Phap_20220427/101_CLAUDE/cooking_setup"
git push
```

Wait ~1 minute, then verify the live site at `https://a17255.github.io/cooking-setup/` works with the same tests.
