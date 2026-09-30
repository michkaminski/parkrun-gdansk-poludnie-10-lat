/*
 * Renderowanie raportu miesiecznego (doc_months) - wspolny plik JS laczony
 * przez wszystkie 8 podstron jednego miesiaca (index/frekwencja/demografia/
 * hall-of-fame/rankingi/wolontariusze/rekordy/historia), dokladnie jak main.js w
 * doc_subweb: kazda funkcja renderujaca jest bezpieczna do wywolania na
 * stronie, ktora nie ma jej elementow - po prostu nic wtedy nie robi.
 * Wszystkie dane pochodza z jednego lokalnego data.json (w tym
 * "location_context"/"monthly_cumulative" - kontekst calej historii
 * lokalizacji, ale juz obciety po stronie Pythona do konca TEGO miesiaca,
 * zeby raport za czerwiec nigdy nie pokazal danych z lipca). Zadna strona
 * nie linkuje do katalogow (lokalizacja/rok) ani do innych miesiecy - raport
 * ma wygladac samodzielnie, nawigacja tylko miedzy tymi 7 podstronami tego
 * samego miesiaca.
 */

(function () {
  "use strict";

  const numberFmt = new Intl.NumberFormat("pl-PL");
  const dateFmt = (iso) => {
    if (!iso) return "–";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  };
  const orDash = (v) => (v === null || v === undefined || v === "" ? "–" : v);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  // -------------------------------------------------------------------
  // Sortowalne/zwijalne tabele - kopia wzorca z docs/doc_subweb (celowa
  // duplikacja miedzy samodzielnymi stronami, patrz komentarz w category.js)
  // -------------------------------------------------------------------
  function makeSortableTable(tableId, rows, columns, options) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const tbody = table.querySelector("tbody");
    const ths = table.querySelectorAll("thead th[data-key]");
    const collapseAfter = options && options.collapseAfter;

    let sortKey = table.dataset.defaultSort || null;
    let sortDir = table.dataset.defaultDir || "desc";
    let expanded = false;

    let toggleBtn = null;
    if (collapseAfter && rows.length > collapseAfter) {
      toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "table-expand-toggle";
      const scrollWrap = table.closest(".table-scroll") || table;
      scrollWrap.insertAdjacentElement("afterend", toggleBtn);
      toggleBtn.addEventListener("click", () => {
        expanded = !expanded;
        render();
      });
    }

    function render() {
      let sorted = rows.slice();
      if (sortKey) {
        sorted.sort((a, b) => {
          const av = a[sortKey];
          const bv = b[sortKey];
          let cmp;
          if (typeof av === "number" && typeof bv === "number") {
            cmp = av - bv;
          } else {
            cmp = String(av).localeCompare(String(bv), "pl");
          }
          return sortDir === "asc" ? cmp : -cmp;
        });
      }

      const visible = collapseAfter && !expanded ? sorted.slice(0, collapseAfter) : sorted;

      tbody.innerHTML = visible
        .map((row) => {
          const cells = columns
            .map((col) => {
              const value = col.render ? col.render(row) : orDash(row[col.key]);
              const cls = /name|display/.test(col.key) ? ' class="cell-name"' : "";
              return `<td${cls}>${value}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");

      ths.forEach((th) => {
        th.classList.remove("sorted-asc", "sorted-desc");
        if (th.dataset.key === sortKey) th.classList.add(sortDir === "asc" ? "sorted-asc" : "sorted-desc");
      });

      if (toggleBtn) {
        toggleBtn.textContent = expanded ? "Zwiń ↑" : `Pokaż wszystkie ${numberFmt.format(rows.length)} →`;
        toggleBtn.setAttribute("aria-expanded", String(expanded));
      }
    }

    ths.forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (sortKey === key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = key;
          const sample = rows.find((r) => r[key] !== undefined && r[key] !== null);
          sortDir = sample && typeof sample[key] === "number" ? "desc" : "asc";
        }
        render();
      });
      if (!th.querySelector(".sort-arrow")) {
        const arrow = document.createElement("span");
        arrow.className = "sort-arrow";
        arrow.textContent = "↕";
        th.appendChild(arrow);
      }
    });

    render();
  }

  // -------------------------------------------------------------------
  // Motyw jasny/ciemny, nawigacja aktywna - kopia wzorca z main.js
  // -------------------------------------------------------------------
  function initThemeToggle(onChange) {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const stored = localStorage.getItem("parkrun-theme");
    if (stored) document.documentElement.setAttribute("data-theme", stored);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effective = stored || (prefersDark ? "dark" : "light");
    btn.textContent = effective === "dark" ? "☀️" : "🌙";

    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const currentlyDark = current === "dark" || (!current && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const next = currentlyDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("parkrun-theme", next);
      btn.textContent = next === "dark" ? "☀️" : "🌙";
      if (onChange) onChange();
    });
  }

  function markActiveNav() {
    const here = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".site-nav a").forEach((link) => {
      const href = link.getAttribute("href");
      if (href === here) link.classList.add("active");
    });
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // -------------------------------------------------------------------
  // Wykresy
  // -------------------------------------------------------------------
  const charts = {};

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function barChart(canvasId, key, labels, values, colorVar) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === "undefined") return;
    destroyChart(key);
    const color = cssVar(colorVar);
    const gridline = cssVar("--gridline");
    const textMuted = cssVar("--text-muted");
    charts[key] = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 4, maxBarThickness: 40 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: textMuted } },
          y: { grid: { color: gridline, drawTicks: false }, ticks: { color: textMuted }, beginAtZero: true },
        },
      },
    });
  }

  function renderYoyCharts(yearOverYear) {
    if (!document.getElementById("chart-yoy-total") && !document.getElementById("chart-yoy-avg")) return;
    const chronological = yearOverYear.slice().sort((a, b) => a.year - b.year);
    barChart("chart-yoy-total", "yoyTotal", chronological.map((r) => r.year), chronological.map((r) => r.total_participants), "--series-1");
    barChart("chart-yoy-avg", "yoyAvg", chronological.map((r) => r.year), chronological.map((r) => r.avg_participants), "--series-3");
  }

  function renderAgeCategoryCharts(ageCategoriesThisYear) {
    if (!document.getElementById("chart-age-cat-year-k") && !document.getElementById("chart-age-cat-year-m")) return;
    barChart(
      "chart-age-cat-year-k",
      "ageCatK",
      ageCategoriesThisYear.women.map((c) => c.category),
      ageCategoriesThisYear.women.map((c) => c.count),
      "--series-2"
    );
    barChart(
      "chart-age-cat-year-m",
      "ageCatM",
      ageCategoriesThisYear.men.map((c) => c.category),
      ageCategoriesThisYear.men.map((c) => c.count),
      "--series-1"
    );
  }

  function renderCumulativeChart(monthlyCumulative, meta) {
    const ctx = document.getElementById("chart-cumulative");
    if (!ctx || typeof Chart === "undefined" || !monthlyCumulative) return;
    destroyChart("cumulative");

    const gridline = cssVar("--gridline");
    const textMuted = cssVar("--text-muted");
    const seriesColor = cssVar("--series-1");
    const goldColor = cssVar("--brand-gold");

    const currentIdx = monthlyCumulative.findIndex((m) => m.year === meta.year && m.month === meta.month);

    charts.cumulative = new Chart(ctx, {
      type: "line",
      data: {
        labels: monthlyCumulative.map((m) => m.month_label),
        datasets: [
          {
            label: "Średnia krocząca (łączna frekwencja miesięczna)",
            data: monthlyCumulative.map((m) => m.cumulative_avg),
            borderColor: seriesColor,
            backgroundColor: "transparent",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          annotation:
            currentIdx >= 0
              ? {
                  annotations: {
                    currentMonth: {
                      type: "line",
                      xMin: currentIdx,
                      xMax: currentIdx,
                      borderColor: goldColor,
                      borderWidth: 2,
                      borderDash: [4, 4],
                      label: {
                        display: true,
                        content: meta.month_label,
                        position: "start",
                        backgroundColor: goldColor,
                        color: "#0b0b0b",
                        font: { size: 11, weight: "bold" },
                      },
                    },
                  },
                }
              : {},
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textMuted, maxTicksLimit: 14 } },
          y: { grid: { color: gridline, drawTicks: false }, ticks: { color: textMuted }, beginAtZero: true },
        },
      },
    });
  }

  // -------------------------------------------------------------------
  // Tabele
  // -------------------------------------------------------------------
  function renderEditionsTable(editions) {
    makeSortableTable("table-editions", editions, [
      { key: "edition_number", render: (r) => "#" + r.edition_number },
      { key: "date", render: (r) => dateFmt(r.date) },
      { key: "participants_count" },
      { key: "men_count" },
      { key: "women_count" },
      { key: "avg_time_m" },
      { key: "avg_time_f" },
      { key: "best_time_m" },
      { key: "best_time_f" },
      { key: "median_time" },
      { key: "best_age_coefficient" },
      { key: "volunteers_count" },
    ]);
  }

  // Laczy nazwisko+czas w jedna komorke ("20:29 — Dorota ZMUDA") zamiast
  // dwoch osobnych kolumn - mniej kolumn = mniej poziomego scrolla (patrz
  // uwaga #1 z przegladu).
  function personDisplay(person) {
    if (!person) return "–";
    return `${person.time} — ${person.name}`;
  }

  function renderYearOverYearTable(rows) {
    const flat = rows.map((r) => ({
      ...r,
      best_woman_display: personDisplay(r.best_woman),
      best_man_display: personDisplay(r.best_man),
    }));
    makeSortableTable("table-year-over-year", flat, [
      { key: "year" },
      { key: "editions_count" },
      { key: "total_participants" },
      { key: "avg_participants" },
      { key: "avg_time" },
      { key: "median_time" },
      { key: "best_woman_display" },
      { key: "best_man_display" },
    ]);
  }

  function ageCategoryDisplay(entry) {
    if (!entry.best_time) return "–";
    return `${entry.best_time} — ${entry.best_name}`;
  }

  function ageCategoryDisplayAllYears(entry) {
    if (!entry.best_time) return "–";
    const yearPart = entry.best_year ? ` (${entry.best_year})` : "";
    return `${entry.best_time} — ${entry.best_name}${yearPart}`;
  }

  function ageCategoryColumns() {
    return [
      { key: "category" },
      { key: "count" },
      { key: "avg_time" },
      { key: "best_display", render: ageCategoryDisplay },
    ];
  }

  function ageCategoryColumnsAllYears() {
    return [
      { key: "category" },
      { key: "count" },
      { key: "avg_time" },
      { key: "best_display", render: ageCategoryDisplayAllYears },
    ];
  }

  const MONTH_EDITIONS_ADJECTIVE = {
    1: "styczniowych",
    2: "lutowych",
    3: "marcowych",
    4: "kwietniowych",
    5: "majowych",
    6: "czerwcowych",
    7: "lipcowych",
    8: "sierpniowych",
    9: "wrześniowych",
    10: "październikowych",
    11: "listopadowych",
    12: "grudniowych",
  };

  const MONTH_IN_MONTH_LOCATIVE = {
    1: "styczniu",
    2: "lutym",
    3: "marcu",
    4: "kwietniu",
    5: "maju",
    6: "czerwcu",
    7: "lipcu",
    8: "sierpniu",
    9: "wrześniu",
    10: "październiku",
    11: "listopadzie",
    12: "grudniu",
  };

  const MONTH_GENITIVE = {
    1: "stycznia",
    2: "lutego",
    3: "marca",
    4: "kwietnia",
    5: "maja",
    6: "czerwca",
    7: "lipca",
    8: "sierpnia",
    9: "września",
    10: "października",
    11: "listopada",
    12: "grudnia",
  };

  function monthNameFromMeta(meta) {
    return (meta.month_label || "").split(" ")[0] || "Miesiąc";
  }

  function renderFrekwencjaHeadings(meta) {
    if (document.body.dataset.page !== "frekwencja") return;
    const monthName = monthNameFromMeta(meta);
    const monthNum = meta.month;
    const monthGenitive = MONTH_GENITIVE[monthNum] || monthName.toLowerCase();
    const monthLocative = MONTH_IN_MONTH_LOCATIVE[monthNum] || monthName.toLowerCase();

    setText("yoy-section-kicker", `${monthName}, rok po roku`);
    setText("yoy-compare-title", `Porównanie ${monthGenitive} z poprzednimi latami`);
    setText(
      "yoy-compare-desc",
      `${monthName} w każdym roku historii tej lokalizacji (ten sam miesiąc kalendarzowy).`
    );
    setText("yoy-chart-total-title", `Frekwencja ${monthGenitive} na przestrzeni lat`);
    setText("yoy-chart-avg-title", `Średnia frekwencja na edycję w ${monthLocative}`);
  }

  function renderDemografiaHeadings(meta) {
    if (document.body.dataset.page !== "demografia") return;
    const monthLabel = meta.month_label;
    const monthName = monthNameFromMeta(meta);
    const monthNum = meta.month;
    const editionsAdj = MONTH_EDITIONS_ADJECTIVE[monthNum] || `${monthName.toLowerCase()}ych`;
    const monthLocative = MONTH_IN_MONTH_LOCATIVE[monthNum] || monthName.toLowerCase();
    const genderMonth = (gender) => `${gender} — ${monthLabel}`;

    setText("age-cat-year-title", monthLabel);
    setText("age-cat-year-chart-k-title", genderMonth("Kobiety"));
    setText("age-cat-year-chart-m-title", genderMonth("Mężczyźni"));
    setText("age-cat-year-table-k-title", genderMonth("Kobiety"));
    setText("age-cat-year-table-m-title", genderMonth("Mężczyźni"));

    setText("age-cat-all-years-title", `${monthName} — wszystkie lata`);
    setText(
      "age-cat-all-years-desc",
      `Porównanie wyłącznie ${editionsAdj} edycji ze wszystkich lat historii parkrun ${meta.location_name}. Zestawienie obejmuje frekwencję, liczbę uczestników, średnie czasy oraz najlepsze wyniki w kategoriach wiekowych osiągnięte w miesiącu ${monthLocative} w poszczególnych latach.`
    );
    const genderAllYears = (gender) => `${gender} — ${monthName.toLowerCase()} (wszystkie lata)`;
    setText("age-cat-all-table-k-title", genderAllYears("Kobiety"));
    setText("age-cat-all-table-m-title", genderAllYears("Mężczyźni"));
  }

  function renderAgeCategoryTables(ageCategoriesThisYear, ageCategoriesAllYears, locationAgeCategories) {
    makeSortableTable("table-age-cat-year-k", ageCategoriesThisYear.women, ageCategoryColumns());
    makeSortableTable("table-age-cat-year-m", ageCategoriesThisYear.men, ageCategoryColumns());
    makeSortableTable("table-age-cat-all-k", ageCategoriesAllYears.women, ageCategoryColumnsAllYears());
    makeSortableTable("table-age-cat-all-m", ageCategoriesAllYears.men, ageCategoryColumnsAllYears());
    if (locationAgeCategories) {
      makeSortableTable("table-location-cat-k", locationAgeCategories.women, ageCategoryColumns(), { collapseAfter: 8 });
      makeSortableTable("table-location-cat-m", locationAgeCategories.men, ageCategoryColumns(), { collapseAfter: 8 });
    }
  }

  function renderRunnerRankings(data) {
    makeSortableTable("table-perfect-runners", data.perfect_attendance_runners, [{ key: "name" }, { key: "editions_count" }]);
    makeSortableTable(
      "table-top-runners-ytd",
      data.top_runners_year_to_date,
      [{ key: "rank" }, { key: "name" }, { key: "editions_count" }],
      { collapseAfter: 15 }
    );
    makeSortableTable(
      "table-top-runners-all",
      data.top_runners_all_time,
      [{ key: "rank" }, { key: "name" }, { key: "editions_count" }],
      { collapseAfter: 15 }
    );
  }

  function renderVolunteerRankings(data) {
    makeSortableTable("table-perfect-volunteers", data.perfect_attendance_volunteers, [{ key: "name" }, { key: "editions_count" }]);
    makeSortableTable(
      "table-top-volunteers-ytd",
      data.top_volunteers_year_to_date,
      [{ key: "rank" }, { key: "name" }, { key: "editions_count" }],
      { collapseAfter: 15 }
    );
    makeSortableTable(
      "table-top-volunteers-all",
      data.top_volunteers_all_time,
      [{ key: "rank" }, { key: "name" }, { key: "editions_count" }],
      { collapseAfter: 15 }
    );
  }

  function categoryAgeSortKey(category) {
    const match = String(category || "").match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 9999;
  }

  function podiumPlaceCell(entry) {
    if (!entry) {
      return '<td class="podium-place-cell"><span class="podium-empty">–</span></td>';
    }
    return `<td class="podium-place-cell">
      <span class="podium-inline">
        <span class="podium-name cell-name">${escapeHtml(entry.name)}</span>
        <span class="podium-time">${escapeHtml(orDash(entry.time))}</span>
      </span>
    </td>`;
  }

  function podiumAtPlace(top, place) {
    if (!top || !top.length) return null;
    return top.find((row) => row.place === place) || top[place - 1] || null;
  }

  function categoryEntryGender(cat) {
    if (cat.gender === "K" || cat.gender === "M") return cat.gender;
    const code = cat.category || "";
    if (code.length >= 2 && code.charAt(1) === "W") return "K";
    if (code.length >= 2 && code.charAt(1) === "M") return "M";
    return null;
  }

  function categoryLabelHtml(cat) {
    const count =
      cat.participants_count != null
        ? `<span class="category-count">${numberFmt.format(cat.participants_count)}</span>`
        : "";
    return `<span class="category-code">${escapeHtml(cat.category)}</span>${count}`;
  }

  function editionCategoriesMatrixHtml(edition, gender, title) {
    const rows = (edition.categories || [])
      .filter((cat) => categoryEntryGender(cat) === gender)
      .sort((a, b) => categoryAgeSortKey(a.category) - categoryAgeSortKey(b.category));
    if (!rows.length) {
      return `<div class="table-card table-card-nested"><h4>${escapeHtml(title)}</h4><p class="chart-caption">Brak wyników w kategoriach.</p></div>`;
    }
    const head = "<tr><th>Kat. wiek.</th><th>1. miejsce</th><th>2. miejsce</th><th>3. miejsce</th></tr>";
    const body = rows
      .map((cat) => {
        const top = cat.top || [];
        return `<tr>
          <td class="category-with-count">${categoryLabelHtml(cat)}</td>
          ${podiumPlaceCell(podiumAtPlace(top, 1))}
          ${podiumPlaceCell(podiumAtPlace(top, 2))}
          ${podiumPlaceCell(podiumAtPlace(top, 3))}
        </tr>`;
      })
      .join("");
    return `<div class="table-card table-card-nested edition-categories-table-wrap">
      <h4>${escapeHtml(title)}</h4>
      <div class="table-scroll"><table class="data-table edition-categories-matrix"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    </div>`;
  }

  function podiumTableHtml(title, rows, options) {
    const opts = options || {};
    const showCoeff = opts.showCoefficient;
    const hideTitle = opts.hideTitle;
    const showDate = opts.showDate;
    let head = showCoeff
      ? "<tr><th>Msc</th><th>Uczestnik</th><th>Kat.</th>"
      : "<tr><th>Msc</th><th>Uczestnik</th><th>Kat.</th>";
    if (showDate) head += "<th>Edycja</th>";
    head += showCoeff ? "<th>Czas</th><th>Wsp.</th></tr>" : "<th>Czas</th></tr>";
    const titleHtml = title && !hideTitle ? `<h4>${escapeHtml(title)}</h4>` : "";
    if (!rows || !rows.length) {
      return `<div class="table-card table-card-nested">${titleHtml}<p class="chart-caption">Brak wyników.</p></div>`;
    }
    const body = rows
      .map((row) => {
        const coeffCell = showCoeff ? `<td>${orDash(row.coefficient != null ? row.coefficient.toFixed(2) : null)}</td>` : "";
        const dateCell = showDate ? `<td>${dateFmt(row.date)}</td>` : "";
        return `<tr>
          <td>${row.place}</td>
          <td class="cell-name">${escapeHtml(row.name)}</td>
          <td>${escapeHtml(orDash(row.category))}</td>
          ${dateCell}
          <td>${escapeHtml(orDash(row.time))}</td>
          ${coeffCell}
        </tr>`;
      })
      .join("");
    return `<div class="table-card table-card-nested">${titleHtml}
      <div class="table-scroll"><table class="data-table podium-table"><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`;
  }

  function rankingPodiumBlockHtml(block, options) {
    const opts = options || {};
    const showDate = !!opts.showDate;
    const tableOpts = { showDate };
    const times = `<div class="edition-ranking-subsection">
          <h4 class="edition-ranking-subtitle">Pierwsza trójka — czasy</h4>
          <div class="edition-ranking-pair">
            ${podiumTableHtml("Kobiety", block.top_women, tableOpts)}
            ${podiumTableHtml("Mężczyźni", block.top_men, tableOpts)}
          </div>
        </div>`;
    const ag = `<div class="edition-ranking-subsection edition-ranking-ag-table">
          <h4 class="edition-ranking-subtitle">Pierwsza trójka — współczynnik wieku</h4>
          ${podiumTableHtml("", block.top_age_graded, { showCoefficient: true, hideTitle: true, showDate })}
        </div>`;
    const categories = block.categories || [];
    let categoriesBlock = "";
    if (categories.length) {
      const catSummary = opts.monthCategoriesSummary || "Kategorie wiekowe — pierwsze trójki (wg czasu)";
      categoriesBlock = `<details class="record-category-standings edition-ranking-subsection edition-ranking-categories">
            <summary>${escapeHtml(catSummary)}</summary>
            <div class="edition-ranking-categories-stack">
              ${editionCategoriesMatrixHtml(block, "K", "Kobiety")}
              ${editionCategoriesMatrixHtml(block, "M", "Mężczyźni")}
            </div>
          </details>`;
    }
    return `${times}${ag}${categoriesBlock}`;
  }

  function editionRankingCardHtml(block, cardOpts) {
    const isMonth = cardOpts && cardOpts.isMonth;
    const cardClass = isMonth ? "edition-ranking-card edition-ranking-card--month" : "edition-ranking-card";
    let head;
    if (isMonth) {
      head = `<div class="edition-ranking-head">
        <span class="edition-ranking-badge edition-ranking-badge--month">Cały miesiąc</span>
        <h3>${escapeHtml(cardOpts.title || "Podsumowanie miesiąca")}</h3>
        ${cardOpts.lede ? `<p class="edition-ranking-lede">${escapeHtml(cardOpts.lede)}</p>` : ""}
      </div>`;
    } else {
      head = `<div class="edition-ranking-head">
        <span class="edition-ranking-badge">Edycja #${block.edition_number}</span>
        <h3>${dateFmt(block.date)}</h3>
      </div>`;
    }
    const body = rankingPodiumBlockHtml(block, {
      showDate: isMonth,
      monthCategoriesSummary: cardOpts && cardOpts.monthCategoriesSummary,
    });
    return `<article class="${cardClass}">${head}<div class="edition-ranking-card-body">${body}</div></article>`;
  }

  function renderEditionRankings(editionRankings, meta) {
    const root =
      document.getElementById("edition-rankings-root") ||
      document.getElementById("edition-podium-times-root") ||
      document.getElementById("edition-podium-ag-root");
    if (!root) return;
    const editions = (editionRankings && editionRankings.editions) || [];
    if (!editions.length) {
      root.innerHTML = "<p class=\"chart-caption\">Brak edycji w tym miesiącu.</p>";
      return;
    }

    const monthName = meta ? monthNameFromMeta(meta) : "";
    const editionsHtml = editions.map((edition) => editionRankingCardHtml(edition, { isMonth: false })).join("");

    let monthHtml = "";
    const monthBlock = editionRankings && editionRankings.month;
    if (monthBlock) {
      monthHtml = `<div class="edition-rankings-month-wrap">
        ${editionRankingCardHtml(monthBlock, {
          isMonth: true,
          title: `Podsumowanie — ${monthName}`,
          lede: "Jeden najlepszy wynik na zawodnika w miesiącu. W kategoriach wiekowych — najlepszy czas danej osoby w tej kategorii.",
          monthCategoriesSummary: "Kategorie wiekowe — pierwsze trójki w miesiącu (najlepszy czas w kategorii)",
        })}
      </div>`;
    }

    root.innerHTML = `<div class="edition-rankings-editions">${editionsHtml}</div>${monthHtml}`;
  }

  function renderRankingiHeadings(meta) {
    if (document.body.dataset.page !== "rankingi") return;
    const monthName = monthNameFromMeta(meta);
    const monthLocative = MONTH_IN_MONTH_LOCATIVE[meta.month] || monthName.toLowerCase();
    setText("edition-rankings-title", `Rankingi — ${monthName}`);
    setText(
      "edition-rankings-desc",
      `Każda edycja ${monthLocative} w osobnej karcie; na dole podsumowanie miesiąca (jeden wynik na zawodnika).`
    );
  }

  function ageGradedStatusLabel(status) {
    if (status === "new") return "NEW";
    if (status === "tied") return "Wyrównany";
    return "–";
  }

  function ageGradedColumns(withRecordScope) {
    const cols = [
      { key: "rank" },
      { key: "name" },
      { key: "category" },
      { key: "time" },
      { key: "coefficient", render: (r) => r.coefficient.toFixed(2) },
      { key: "date", render: (r) => dateFmt(r.date) },
    ];
    if (withRecordScope) {
      cols.push({ key: "record_status", render: (r) => ageGradedStatusLabel(r.record_status) });
    }
    return cols;
  }

  function renderAgeGradedScope(detailsId, captionId, tableId, rows, captionText) {
    const details = document.getElementById(detailsId);
    const table = document.getElementById(tableId);
    if (!details || !table) return;
    if (!rows || !rows.length) {
      details.hidden = true;
      return;
    }
    details.hidden = false;
    if (captionId) setText(captionId, captionText);
    makeSortableTable(tableId, rows, ageGradedColumns(true), { collapseAfter: 50 });
  }

  function kpiGrid(id, tiles) {
    setHtml(
      id,
      tiles
        .map(
          (t) => `<div class="kpi-tile">
            <span class="kpi-value">${t.value}</span>
            <span class="kpi-label">${t.label}</span>
          </div>`
        )
        .join("")
    );
  }

  function renderMonthSummary(summary, meta) {
    if (!document.getElementById("month-summary-kpi-grid")) return;
    kpiGrid("month-summary-kpi-grid", [
      { label: "Edycji w tym miesiącu", value: numberFmt.format(summary.editions_count) },
      { label: "Uczestnictw", value: numberFmt.format(summary.total_participants) },
      { label: "Kobiety / Mężczyźni", value: `${numberFmt.format(summary.women_count)} / ${numberFmt.format(summary.men_count)}` },
      { label: "Średnio na edycję", value: summary.avg_participants },
      { label: "Najlepszy czas M", value: orDash(summary.best_time_m) },
      { label: "Najlepszy czas K", value: orDash(summary.best_time_f) },
      { label: "Mediana czasu", value: orDash(summary.median_time) },
      { label: "Najlepszy wsp. wieku", value: orDash(summary.best_age_coefficient) },
      { label: "Wolontariuszy", value: numberFmt.format(summary.volunteers_count) },
    ]);
  }

  function renderYearSummary(summary, meta) {
    if (!document.getElementById("year-summary-kpi-grid")) return;
    setText("year-summary-title", `Statystyki w roku ${meta.year} (stan na: ${meta.month_label})`);
    kpiGrid("year-summary-kpi-grid", [
      { label: "Edycji w roku", value: numberFmt.format(summary.editions_count) },
      { label: "Uczestnictw w roku", value: numberFmt.format(summary.total_participants) },
      { label: "Kobiety / Mężczyźni", value: `${numberFmt.format(summary.women_count)} / ${numberFmt.format(summary.men_count)}` },
      { label: "Średnio na edycję", value: summary.avg_participants },
      { label: "Najlepszy czas M", value: orDash(summary.best_time_m) },
      { label: "Najlepszy czas K", value: orDash(summary.best_time_f) },
      { label: "Mediana czasu", value: orDash(summary.median_time) },
      { label: "Najlepszy wsp. wieku", value: orDash(summary.best_age_coefficient) },
      { label: "Wolontariuszy", value: numberFmt.format(summary.volunteers_count) },
    ]);
  }

  function renderLocationContext(summary) {
    if (!summary || !document.getElementById("location-context-kpi-grid")) return;
    setText("location-context-title", `Cała historia ${summary.location_name}`);
    kpiGrid("location-context-kpi-grid", [
      { label: "Edycji", value: numberFmt.format(summary.total_editions) },
      { label: "Startów", value: numberFmt.format(summary.total_starts) },
      { label: "Średnio na edycję", value: summary.avg_participants_per_edition },
      { label: "Najlepszy czas M", value: orDash(summary.best_time_m) },
      { label: "Najlepszy czas K", value: orDash(summary.best_time_f) },
      { label: "Mediana czasu", value: orDash(summary.median_time) },
      { label: "Najlepszy wsp. wieku", value: orDash(summary.best_age_coefficient) },
    ]);
    setText(
      "location-context-range",
      `Okres: ${dateFmt(summary.first_edition_date)} – ${dateFmt(summary.last_edition_date)}`
    );
  }

  // -------------------------------------------------------------------
  // Zakladka "Rekordy" - patrz build_records_section w export_month_data.py
  // -------------------------------------------------------------------
  function pluralRecordsWord(n) {
    if (n === 1) return "rekord";
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "rekordy";
    return "rekordów";
  }

  function pluralRecordsVerb(n) {
    if (n === 1) return "padł";
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "padły";
    return "padło";
  }

  function fmtAttendanceBig(entry) {
    if (!entry) return "–";
    return `${numberFmt.format(entry.value)}<span class="record-who">edycja #${entry.edition_number} · ${dateFmt(entry.date)}</span>`;
  }
  function fmtAttendanceCompact(entry) {
    if (!entry) return "–";
    return `${numberFmt.format(entry.value)} osób (edycja #${entry.edition_number}, ${dateFmt(entry.date)})`;
  }
  function fmtTimeBig(entry) {
    if (!entry) return "–";
    return `${entry.value}<span class="record-who">${entry.name} · ${dateFmt(entry.date)}</span>`;
  }
  function fmtTimeCompact(entry) {
    if (!entry) return "–";
    return `${entry.value} — ${entry.name} (${dateFmt(entry.date)})`;
  }
  function fmtCoefficientBig(entry) {
    if (!entry) return "–";
    return `${entry.value.toFixed(2)}<span class="record-who">${entry.name}, ${entry.category} · ${dateFmt(entry.date)}</span>`;
  }
  function fmtCoefficientCompact(entry) {
    if (!entry) return "–";
    return `${entry.value.toFixed(2)} — ${entry.name}, ${entry.category} (${dateFmt(entry.date)})`;
  }
  // Trzy stany: pobity (broken, zloty), wyrownany (tied, morski), bez zmian
  // (szary) - patrz PROJEKT_DOC_MONTHS.md, uwaga o wyrownaniach rekordu.
  function recordStatus(comparison) {
    if (comparison.broken) return "broken";
    if (comparison.tied) return "tied";
    return "none";
  }

  function recordMonthBest(comparison) {
    return comparison.month_best != null ? comparison.month_best : comparison.current;
  }

  function recordStanding(comparison) {
    if (comparison.standing_record != null) return comparison.standing_record;
    if (comparison.broken) return recordMonthBest(comparison);
    return comparison.previous || recordMonthBest(comparison);
  }

  function recordChangeBadge(status) {
    if (status === "broken") return `<span class="record-change-tag is-new">NEW</span>`;
    if (status === "tied") return `<span class="record-change-tag is-tied">Wyrównany</span>`;
    return "";
  }

  function recordCardCompareLine(status, comparison, compactFmt) {
    const monthBest = recordMonthBest(comparison);
    const prior = comparison.previous;
    if (status === "broken") {
      if (prior) return `Poprzedni rekord: ${compactFmt(prior)}`;
      return "Pierwszy rekord w tym zakresie.";
    }
    if (status === "tied" && prior) {
      return `Wyrównano wcześniejszy rekord: ${compactFmt(prior)}`;
    }
    if (status === "none" && monthBest && prior) {
      return `W tym miesiącu najlepiej: ${compactFmt(monthBest)} — rekord nie pobity`;
    }
    if (status === "none" && monthBest && !prior) {
      return "Pierwszy wynik w tym zakresie w historii raportu.";
    }
    return "";
  }

  function recordCard(title, comparison, bigFmt, compactFmt) {
    const status = recordStatus(comparison);
    const cls =
      status === "broken" ? "is-broken" : status === "tied" ? "is-tied" : status === "none" ? "is-unchanged" : "";
    const mainEntry = status === "broken" ? recordMonthBest(comparison) : recordStanding(comparison);
    const compareLine = recordCardCompareLine(status, comparison, compactFmt);
    const compareHtml = compareLine ? `<div class="record-compare">${compareLine}</div>` : "";

    return `<div class="record-card ${cls}">
      <div class="record-card-head">
        <h4>${title}</h4>
        ${recordChangeBadge(status)}
      </div>
      <div class="record-current">${bigFmt(mainEntry)}</div>
      ${compareHtml}
    </div>`;
  }

  function renderScopeGrid(gridId, scope) {
    setHtml(gridId, [
      recordCard("Frekwencja", scope.attendance, fmtAttendanceBig, fmtAttendanceCompact),
      recordCard("Najlepszy czas — mężczyźni", scope.time_m, fmtTimeBig, fmtTimeCompact),
      recordCard("Najlepszy czas — kobiety", scope.time_f, fmtTimeBig, fmtTimeCompact),
      recordCard("Współczynnik wieku", scope.age_coefficient, fmtCoefficientBig, fmtCoefficientCompact),
    ].join(""));
  }

  function categoryStandingColumns() {
    return [
      { key: "category" },
      { key: "time" },
      { key: "name" },
      { key: "date", render: (row) => dateFmt(row.date) },
    ];
  }

  function renderCategoryStandings(detailsId, tableKId, tableMId, standings) {
    const details = document.getElementById(detailsId);
    if (!details) return;
    if (!standings) {
      details.hidden = true;
      return;
    }
    const women = standings.women || [];
    const men = standings.men || [];
    if (!women.length && !men.length) {
      details.hidden = true;
      return;
    }
    details.hidden = false;
    makeSortableTable(tableKId, women, categoryStandingColumns());
    makeSortableTable(tableMId, men, categoryStandingColumns());
  }

  function renderCategoryRecordsTable(tableId, emptyId, categoryRecords) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = (categoryRecords || []).map((c) => ({
      category: c.label,
      status: c.broken ? "🎉 nowy rekord" : "🤝 wyrównany rekord",
      new_time: c.current.value,
      new_name: c.current.name,
      previous_display: c.previous ? `${c.previous.value} — ${c.previous.name} (${dateFmt(c.previous.date)})` : "–",
    }));
    const emptyNote = document.getElementById(emptyId);
    if (rows.length) {
      if (emptyNote) emptyNote.hidden = true;
      table.closest(".table-card").style.display = "";
      makeSortableTable(tableId, rows, [
        { key: "category" },
        { key: "status" },
        { key: "new_time" },
        { key: "new_name" },
        { key: "previous_display" },
      ]);
    } else {
      if (emptyNote) emptyNote.hidden = false;
      table.closest(".table-card").style.display = "none";
    }
  }

  function renderRecords(records, meta) {
    const banner = document.getElementById("records-summary-banner");
    if (!banner || !records) return;

    const dims = ["attendance", "time_m", "time_f", "age_coefficient"];
    const allComparisons = [records.overall, records.year, records.same_month_all_years].flatMap((scope) =>
      dims.map((k) => scope[k])
    );
    const allCategoryRecords = [
      ...records.category_records_overall,
      ...records.category_records_year,
      ...records.category_records_same_month_all_years,
    ];
    const brokenCount = allComparisons.filter((c) => c.broken).length + allCategoryRecords.filter((c) => c.broken).length;
    const tiedCount = allComparisons.filter((c) => c.tied).length + allCategoryRecords.filter((c) => c.tied).length;

    if (brokenCount > 0) {
      // "wyrownano" to forma bezosobowa - nie odmienia sie przez liczbe,
      // wiec nie potrzebuje osobnej funkcji koniugacji jak pluralRecordsVerb.
      const tiedPart = tiedCount > 0 ? ` i wyrównano ${tiedCount} ${pluralRecordsWord(tiedCount)}` : "";
      banner.className = "records-summary-banner has-records";
      banner.textContent = `🎉 ${pluralRecordsVerb(brokenCount)} ${brokenCount} ${pluralRecordsWord(brokenCount)}${tiedPart} w tym miesiącu!`;
    } else if (tiedCount > 0) {
      banner.className = "records-summary-banner has-ties-only";
      banner.textContent = `🤝 Żaden rekord nie padł, ale wyrównano ${tiedCount} ${pluralRecordsWord(tiedCount)} w tym miesiącu.`;
    } else {
      banner.className = "records-summary-banner no-records";
      banner.textContent = "Żaden rekord nie padł w tym miesiącu.";
    }

    renderScopeGrid("records-overall-grid", records.overall);
    renderScopeGrid("records-year-grid", records.year);
    renderScopeGrid("records-month-grid", records.same_month_all_years);
    setText("records-overall-title", "Rekordy ogólne");
    setText("records-year-title", `Rekordy roku ${meta.year}`);
    setText("records-month-title", `Rekordy miesiąca (na przestrzeni lat) — ${monthNameFromMeta(meta)}`);
    setText("records-category-year-title", `Rekordy kategorii wiekowych — rok ${meta.year}`);
    setText(
      "records-category-month-title",
      `Rekordy kategorii wiekowych — miesiąca ${monthNameFromMeta(meta).toLowerCase()} na przestrzeni lat`
    );

    renderCategoryRecordsTable("table-category-records-overall", "records-category-overall-empty", records.category_records_overall);
    renderCategoryRecordsTable("table-category-records-year", "records-category-year-empty", records.category_records_year);
    renderCategoryRecordsTable(
      "table-category-records-month",
      "records-category-month-empty",
      records.category_records_same_month_all_years
    );

    renderCategoryStandings(
      "category-standings-overall",
      "table-category-standings-overall-k",
      "table-category-standings-overall-m",
      records.category_standings_overall
    );
    renderCategoryStandings(
      "category-standings-year",
      "table-category-standings-year-k",
      "table-category-standings-year-m",
      records.category_standings_year
    );
    renderCategoryStandings(
      "category-standings-month",
      "table-category-standings-month-k",
      "table-category-standings-month-m",
      records.category_standings_same_month_all_years
    );

    const monthName = monthNameFromMeta(meta).toLowerCase();
    renderAgeGradedScope(
      "age-graded-overall",
      "age-graded-overall-caption",
      "table-age-graded-overall",
      records.age_graded_overall,
      "Ranking uczestników według najlepszego współczynnika wieku w całej historii lokalizacji (stan na koniec raportowanego miesiąca)."
    );
    renderAgeGradedScope(
      "age-graded-year",
      "age-graded-year-caption",
      "table-age-graded-year",
      records.age_graded_year,
      `Ranking według najlepszego współczynnika w roku ${meta.year} (do końca ${meta.month_label}).`
    );
    renderAgeGradedScope(
      "age-graded-month",
      "age-graded-month-caption",
      "table-age-graded-month",
      records.age_graded_same_month_all_years,
      `Ranking według najlepszego współczynnika w edycjach miesiąca ${monthName} ze wszystkich lat historii.`
    );
  }

  function renderHeader(meta) {
    const sectionLabel = document.body.dataset.sectionLabel;
    document.title = sectionLabel
      ? `${sectionLabel} — parkrun ${meta.location_name}, ${meta.month_label}`
      : `parkrun ${meta.location_name} — ${meta.month_label}`;
    setText("brand-label", `parkrun ${meta.location_name}`);
    setText("location-kicker", meta.location_name);
    setText("hero-eyebrow", `${meta.location_name} — ${meta.month_label}`);
    setText("month-title", `Statystyki — ${meta.month_label}`);
    // Cienki pasek na podstronach innych niz index.html (tam ta sama tresc
    // jest juz w hero) - element moze nie istniec na danej stronie,
    // setText bezpiecznie nic wtedy nie robi.
    setText("month-banner-label", `Statystyki — ${meta.month_label}`);
    renderFrekwencjaHeadings(meta);
    renderDemografiaHeadings(meta);
    renderRankingiHeadings(meta);
  }

  function render(data) {
    const locationContext = data.location_context;
    const monthlyCumulative = data.monthly_cumulative;

    renderHeader(data.meta);
    markActiveNav();
    renderMonthSummary(data.month_summary, data.meta);
    renderEditionsTable(data.editions);
    renderYearOverYearTable(data.year_over_year);
    renderYoyCharts(data.year_over_year);
    renderAgeCategoryCharts(data.age_categories_this_year);
    renderAgeCategoryTables(data.age_categories_this_year, data.age_categories_all_years, locationContext && locationContext.age_categories);
    renderRunnerRankings(data);
    renderEditionRankings(data.edition_rankings, data.meta);
    renderVolunteerRankings(data);
    renderYearSummary(data.year_summary, data.meta);
    if (monthlyCumulative) renderCumulativeChart(monthlyCumulative, data.meta);
    renderRecords(data.records, data.meta);
    renderLocationContext(locationContext);
  }

  fetch("data.json")
    .then((r) => {
      if (!r.ok) throw new Error(`Nie udalo sie wczytac data.json (${r.status})`);
      return r.json();
    })
    .then((data) => {
      render(data);
      initThemeToggle(() => {
        renderYoyCharts(data.year_over_year);
        renderAgeCategoryCharts(data.age_categories_this_year);
        if (data.monthly_cumulative) renderCumulativeChart(data.monthly_cumulative, data.meta);
      });
    })
    .catch((err) => {
      console.error(err);
      setText("month-title", "Nie udało się wczytać danych tego miesiąca");
      initThemeToggle(() => {});
    });
})();
