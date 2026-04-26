import json
import os
import re


def _format_qty(value, unit):
    unit = unit.strip().lower()
    if unit in ("g", "gram", "grams"):
        if value >= 1000:
            return f"{value / 1000:.1f} kg"
        return f"{int(round(value))} g"
    if unit in ("kg", "kilogram", "kilograms"):
        return f"{value:.1f} kg"
    if unit in ("egg", "eggs", "pcs"):
        return f"{int(round(value))} {unit}"
    if unit:
        return f"{value:.1f} {unit}" if value % 1 else f"{int(value)} {unit}"
    return f"{value:.1f}" if value % 1 else f"{int(value)}"


def _parse_gradient(gradient):
    items = []
    for token in gradient.split(","):
        chunk = token.strip()
        if not chunk:
            continue
        match = re.match(r"^([0-9]*\.?[0-9]+)\s*([a-zA-Z]+)?\s*(.*)$", chunk)
        if not match:
            items.append({"item": chunk, "qty_per_person": 0.0, "unit": ""})
            continue
        qty = float(match.group(1))
        unit = match.group(2) or ""
        item = match.group(3).strip() or unit
        if not item:
            item = chunk
        items.append({"item": item, "qty_per_person": qty, "unit": unit})
    return items


def _aggregate_items(gradients, count):
    aggregated = {}
    for gradient in gradients:
        for row in _parse_gradient(gradient):
            key = (row["item"].lower(), row["unit"].lower())
            aggregated.setdefault(key, {
                "item": row["item"],
                "unit": row["unit"],
                "qty_per_person": 0.0,
            })
            aggregated[key]["qty_per_person"] += row["qty_per_person"]

    items = list(aggregated.values())
    items.sort(key=lambda x: x["item"].lower())
    return [
        {
            "item": row["item"],
            "unit": row["unit"],
            "qty": _format_qty(row["qty_per_person"] * count, row["unit"]),
        }
        for row in items
    ]


def build_html(
    selection,
    sheet_url,
    generated_at,
    people_count,
    people_cfg,
    is_special_main,
    market_items,
    all_meals,
    gradient_map,
    special_list,
):
    title_date = generated_at.strftime("%Y-%m-%d")
    count = max(1, int(people_count))

    special_note = "Special main only" if is_special_main else ""
    side_label = selection["side"] or "No side (special main)"
    soup_label = selection["soup"] or "No soup (special main)"

    gradients = []
    for entry in market_items:
        gradient = entry.get("gradient", "").strip()
        if gradient:
            gradients.append(gradient)
    aggregated = _aggregate_items(gradients, count) if gradients else []
    market_list_html = "".join(
        [
            f"<div class='market-item'><span>{row['item']}</span><strong>{row['qty']}</strong></div>"
            for row in aggregated
        ]
    )
    if not market_list_html:
        protein_g = int(people_cfg.get("protein_g_per_person", 180)) * count
        vegetable_g = int(people_cfg.get("vegetable_g_per_person", 250)) * count
        carb_g = int(people_cfg.get("carb_g_per_person", 200)) * count
        soup_g = int(people_cfg.get("soup_g_per_person", 200)) * count
        herb_bundle = max(
            1,
            int(round(count / 4 * int(people_cfg.get("herb_bundle_per_4_people", 1)))),
        )
        market_list_html = "".join(
            [
                "<div class='market-note'>"
                "Add 'Gradient/1person' in AllMeals for detailed market items."
                "</div>",
                f"<div class='market-item'><span>Main dish</span><strong>{selection['main']}</strong></div>",
                f"<div class='market-item'><span>Side dish</span><strong>{side_label}</strong></div>",
                f"<div class='market-item'><span>Soup</span><strong>{soup_label}</strong></div>",
                f"<div class='market-item'><span>Protein (est)</span><strong>{_format_qty(protein_g, 'g')}</strong></div>",
                f"<div class='market-item'><span>Vegetables (est)</span><strong>{_format_qty(vegetable_g, 'g')}</strong></div>",
                f"<div class='market-item'><span>Carbs (est)</span><strong>{_format_qty(carb_g, 'g')}</strong></div>",
                f"<div class='market-item'><span>Soup base (est)</span><strong>{_format_qty(soup_g, 'g')}</strong></div>",
                f"<div class='market-item'><span>Herbs (est)</span><strong>{herb_bundle} bundle</strong></div>",
            ]
        )

    all_meals_json = json.dumps(all_meals, ensure_ascii=False)
    gradient_json = json.dumps(gradient_map, ensure_ascii=False)

    return f"""<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>Cooking Setup {title_date}</title>
    <style>
      @import url(\"https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=IBM+Plex+Sans:wght@300;400;600&display=swap\");

      :root {{
        --bg: #f2f0ea;
        --ink: #1d1a16;
        --muted: #6a6258;
        --card: #fffaf1;
        --accent: #b65f3a;
        --accent-2: #2f6f64;
        --ring: rgba(182, 95, 58, 0.12);
      }}

      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        font-family: \"IBM Plex Sans\", system-ui, sans-serif;
        color: var(--ink);
        background: radial-gradient(circle at top left, #efe6d8, transparent 45%),
                    radial-gradient(circle at bottom right, #e6f1ee, transparent 50%),
                    var(--bg);
      }}

      .page {{
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
      }}

      .card {{
        width: min(980px, 100%);
        background: var(--card);
        border-radius: 24px;
        box-shadow: 0 24px 60px rgba(38, 30, 20, 0.18);
        padding: 40px;
        border: 1px solid rgba(90, 74, 58, 0.08);
      }}

      .eyebrow {{
        text-transform: uppercase;
        letter-spacing: 0.25em;
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 10px;
      }}

      h1 {{
        font-family: \"Fraunces\", serif;
        font-size: clamp(28px, 4vw, 44px);
        margin: 0 0 18px;
      }}

      .meta {{
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        color: var(--muted);
        font-size: 14px;
      }}

      .special-note {{
        color: var(--accent);
        font-weight: 600;
      }}

      .people-row {{
        display: flex;
        gap: 12px;
        align-items: center;
        margin-top: 14px;
      }}

      .people-row label {{
        font-size: 13px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.18em;
      }}

      .people-row select {{
        padding: 6px 12px;
        border-radius: 10px;
        border: 1px solid rgba(90, 74, 58, 0.2);
        background: #fff;
        font-size: 14px;
      }}

      .action-row {{
        margin-top: 16px;
        display: flex;
        gap: 12px;
      }}

      .action-btn {{
        padding: 8px 16px;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        border: none;
        font-size: 14px;
        cursor: pointer;
      }}

      .grid {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 18px;
        margin: 28px 0 8px;
      }}

      .item {{
        padding: 18px 20px;
        border-radius: 18px;
        background: #fff7e8;
        border: 1px solid rgba(182, 95, 58, 0.08);
        box-shadow: 0 10px 20px var(--ring);
      }}

      .item h2 {{
        margin: 0 0 8px;
        font-size: 14px;
        color: var(--accent);
        text-transform: uppercase;
        letter-spacing: 0.18em;
      }}

      .item p {{
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }}

      .market {{
        margin-top: 26px;
        padding: 20px;
        border-radius: 18px;
        background: #f7efe2;
        border: 1px solid rgba(47, 111, 100, 0.18);
      }}

      .market h3 {{
        margin: 0 0 12px;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        color: var(--accent-2);
      }}

      .market-grid {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
      }}

      .market-item {{
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.7);
        font-size: 14px;
      }}

      .market-item strong {{
        font-weight: 700;
        color: var(--ink);
      }}

      .market-note {{
        grid-column: 1 / -1;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(182, 95, 58, 0.08);
        font-size: 13px;
        color: var(--muted);
      }}

      .foot {{
        margin-top: 28px;
        padding-top: 20px;
        border-top: 1px dashed rgba(120, 98, 78, 0.25);
        font-size: 13px;
        color: var(--muted);
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: space-between;
      }}

      .link {{
        color: var(--accent-2);
        text-decoration: none;
        font-weight: 600;
      }}

      @media (max-width: 600px) {{
        .card {{ padding: 28px; }}
        .item p {{ font-size: 17px; }}
      }}
    </style>
  </head>
  <body>
    <div class=\"page\">
      <main class=\"card\">
        <div class=\"eyebrow\">Daily Cooking Setup</div>
        <h1>Today’s Menu — {title_date}</h1>
        <div class=\"meta\">
          <span>Generated at {generated_at.strftime('%H:%M')}</span>
          <span id=\"people-count\">{count} people</span>
          <span>Rotation enabled</span>
          <span class=\"special-note\" id=\"special-note\">{special_note}</span>
        </div>
        <div class=\"people-row\">
          <label for=\"people-select\">People</label>
          <select id=\"people-select\" data-default=\"{count}\">
            {"".join([f"<option value='{i}'{' selected' if i == count else ''}>{i}</option>" for i in range(1, 11)])}
          </select>
        </div>
        <div class=\"action-row\">
          <button class=\"action-btn\" id=\"reroll-btn\">Change suggestion</button>
        </div>
        <section class=\"grid\">
          <article class=\"item\">
            <h2>Main</h2>
            <p id=\"meal-main\">{selection['main']}</p>
          </article>
          <article class=\"item\">
            <h2>Side</h2>
            <p id=\"meal-side\">{side_label}</p>
          </article>
          <article class=\"item\">
            <h2>Soup</h2>
            <p id=\"meal-soup\">{soup_label}</p>
          </article>
        </section>
        <section class=\"market\">
          <h3>Market quantities</h3>
          <div class=\"market-grid\" id=\"market-list\">
            {market_list_html}
          </div>
        </section>
        <div class=\"foot\">
          <span>Source: Google Sheet</span>
          <a class=\"link\" href=\"{sheet_url}\" target=\"_blank\" rel=\"noreferrer\">Open sheet</a>
        </div>
      </main>
    </div>
    <script>
      const select = document.getElementById("people-select");
      const marketList = document.getElementById("market-list");
      const countLabel = document.getElementById("people-count");
      const mealMain = document.getElementById("meal-main");
      const mealSide = document.getElementById("meal-side");
      const mealSoup = document.getElementById("meal-soup");
      const specialNote = document.getElementById("special-note");
      const rerollBtn = document.getElementById("reroll-btn");
      const allMeals = {all_meals_json};
      const gradientMap = {gradient_json};
      const specialMains = new Set({json.dumps([str(s).lower() for s in special_list])});

      function parseGradient(text) {{
        return text.split(",").map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {{
          const match = chunk.match(/^([0-9]*\.?[0-9]+)\s*([a-zA-Z]+)?\s*(.*)$/);
          if (!match) {{
            return {{ item: chunk, qty: 0, unit: "" }};
          }}
          return {{
            qty: Number(match[1]),
            unit: match[2] || "",
            item: (match[3] || match[2] || chunk).trim()
          }};
        }});
      }}

      function formatQty(value, unit) {{
        unit = unit.toLowerCase();
        if (unit === "g" || unit === "gram" || unit === "grams") {{
          if (value >= 1000) {{
            return (value / 1000).toFixed(1) + " kg";
          }}
          return Math.round(value) + " g";
        }}
        if (unit === "kg" || unit === "kilogram" || unit === "kilograms") {{
          return value.toFixed(1) + " kg";
        }}
        if (unit === "egg" || unit === "eggs" || unit === "pcs") {{
          return Math.round(value) + " " + unit;
        }}
        if (unit) {{
          return value % 1 ? value.toFixed(1) + " " + unit : Math.round(value) + " " + unit;
        }}
        return value % 1 ? value.toFixed(1) : Math.round(value).toString();
      }}

      function updateMarket(count, meals) {{
        const gradients = meals.map((meal) => gradientMap[meal.toLowerCase()] || "").filter(Boolean);
        if (!gradients.length) {{
          return;
        }}
        const aggregated = {{}};
        gradients.forEach((gradient) => {{
          parseGradient(gradient).forEach((row) => {{
            const key = row.item.toLowerCase() + "|" + row.unit.toLowerCase();
            if (!aggregated[key]) {{
              aggregated[key] = {{ item: row.item, unit: row.unit, qty: 0 }};
            }}
            aggregated[key].qty += row.qty;
          }});
        }});
        const html = Object.values(aggregated).map((row) => {{
          return "<div class='market-item'><span>" + row.item + "</span><strong>" +
            formatQty(row.qty * count, row.unit) + "</strong></div>";
        }}).join("");
        if (html) {{
          marketList.innerHTML = html;
        }}
      }}

      function pickRandom(arr) {{
        if (!arr || !arr.length) return "";
        return arr[Math.floor(Math.random() * arr.length)];
      }}

      function reroll() {{
        const main = pickRandom(allMeals.main);
        const isSpecial = specialMains.has(main.toLowerCase());
        const side = isSpecial ? "" : pickRandom(allMeals.side);
        const soup = isSpecial ? "" : pickRandom(allMeals.soup);
        mealMain.textContent = main;
        mealSide.textContent = side || "No side (special main)";
        mealSoup.textContent = soup || "No soup (special main)";
        specialNote.textContent = isSpecial ? "Special main only" : "";
        updateMarket(Number(select.value), [main, side, soup].filter(Boolean));
      }}

      select.addEventListener("change", (event) => {{
        countLabel.textContent = event.target.value + " people";
        updateMarket(Number(event.target.value), [mealMain.textContent, mealSide.textContent, mealSoup.textContent]);
      }});

      rerollBtn.addEventListener("click", reroll);
    </script>
    <script src="chatbot.js" defer></script>
  </body>
</html>
"""


def write_html(path, html):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
