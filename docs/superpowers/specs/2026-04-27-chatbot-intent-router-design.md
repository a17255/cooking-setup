# Chatbot Intent Router — Deep Fix Design

**Date:** 2026-04-27
**Status:** Approved

---

## Problem

Current chatbot (`docs/meal-assistant.js`) relies entirely on Groq's LLM to decide:
1. Which action to execute (`reroll_main`/`reroll_side`/`reroll_soup`/`add_dish`/`chat`)
2. Which specific dish to target
3. The response text

Groq frequently mis-routes: user asks to change **soup**, Groq returns `reroll_main`. The display updates the wrong category while the text says something else. LLM-based routing is inherently fragile for this structured task.

---

## Solution

Move **routing** from Groq into `meal-assistant.js` using Vietnamese/English keyword detection. Let Groq do only what LLMs excel at: natural-language dish selection and friendly reply generation.

---

## Architecture

```
User message
     │
     ▼
detectIntent(message)              ← local, deterministic
     │
     ├─ { action:"reroll", category:"soup", target:"cá" }   (high confidence)
     │        │
     │        ▼
     │   callLLM(focused prompt: pick dish from soup list matching "cá")
     │        │
     │        ▼
     │   Groq → { dish, response }
     │        │
     │        ▼
     │   rerollCat('soup', dish)   +   addMsg('bot', response)
     │
     ├─ { action:"add_dish", category:"main", target:"bún bò Huế" }
     │        │
     │        ▼
     │   callLLM(focused prompt: confirm add + suggest full dish name)
     │        │
     │        ▼
     │   Groq → { dish, response }
     │        │
     │        ▼
     │   addDish('main', dish)   +   addMsg('bot', response)
     │
     ├─ { action:"reroll_all" }
     │        │
     │        ▼
     │   window.reroll()   +   short confirmation message
     │
     └─ { action:"chat" }   (unknown intent / search / count / explain / today)
              │
              ▼
        callLLM(open-ended cooking assistant)
              │
              ▼
        Groq → { response }
              │
              ▼
        addMsg('bot', response)
```

---

## Intent Detection Rules

Case-insensitive substring match on the user's message (Vietnamese without diacritics must also match).

| Keyword match | Intent | Category |
|---|---|---|
| `canh` / `súp` / `sup` / `soup` | reroll | soup |
| `món chính` / `mon chinh` / `main` (standalone) | reroll | main |
| `món phụ` / `mon phu` / `món rau` / `side` / `rau` | reroll | side |
| Contains BOTH `thêm`/`add` AND (soup/main/side keyword) | add_dish | (detected) |
| Contains `đổi` / `change` / `reroll` without any category word | reroll | all |
| None of the above | chat | — |

**Target extraction:** After identifying category, remove the following stopwords from the message (case-insensitive, whole-word): `đổi`, `doi`, `change`, `reroll`, `sang`, `thành`, `thanh`, `to`, `canh`, `súp`, `sup`, `soup`, `món`, `mon`, `chính`, `chinh`, `main`, `phụ`, `phu`, `rau`, `side`, `thêm`, `them`, `add`, `vào`, `vao`, `khác`, `khac`, `other`, `different`. The remaining text (trimmed) is the target. If remainder is empty or only whitespace, target is null (random pick).

---

## LLM Prompts (simplified)

**Reroll prompt** (when category detected):
```
You help a Vietnamese family pick dinner dishes.

The user wants a new {category} dish.
{If target: "They prefer something related to: {target}"}

Available {category} dishes:
{comma-separated list of allMeals[category] + getAdded()[category]}

Pick ONE dish name from the list. Respond ONLY as JSON:
{"dish": "<exact dish name from the list>", "response": "<friendly 1-sentence reply in {language}>"}
```

**Add-dish prompt:**
```
The user wants to add a dish to the {category} category.
User's request: "{user message}"
{If target: "They mentioned: {target}"}

Suggest ONE dish name (Vietnamese). Respond ONLY as JSON:
{"dish": "<full dish name>", "response": "<friendly 1-sentence confirmation in {language}>"}
```

**Chat prompt** (fallback):
```
You are a Vietnamese family meal assistant.

Today's menu: {main} | {side} | {soup}
Available meals: main ({n}): {...} | side ({n}): {...} | soup ({n}): {...}

User: "{message}"

Reply conversationally in the SAME language as the user. Concise (1-3 sentences).
Respond ONLY as JSON: {"response":"..."}
```

---

## Language Detection for Response

Simple heuristic — pass the result to Groq's prompt as `{language}`:

```
isVietnamese =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(msg)
  || /\b(có|là|không|thêm|đổi|canh|súp|món|chính|phụ|rau|cá|sườn|hôm nay|bao nhiêu|gì|của|cho|đi|nhé)\b/i.test(msg);

language = isVietnamese ? 'Vietnamese' : 'English';
```

---

## Error Handling

No change from existing — same 429/400/403/SyntaxError/TypeError branches. The local router doesn't add new failure modes since it's deterministic.

---

## Files Changed

| File | Change |
|---|---|
| `docs/meal-assistant.js` | Add `detectIntent()` + `extractTarget()` + `detectLanguage()`. Refactor `_cbSend` to use router. Replace single monolithic `buildSystemPrompt` with three focused prompts. |

Single-file change. No new files, no Python changes.

---

## Out of Scope

- Weekly-plan, today's-menu, explain-dish, count, search — these all go through the `chat` path (LLM-only) as before. Routing them locally is YAGNI; they're free-form Q&A.
- Touch keyboard / voice input.
- Message history (still stateless per call).
