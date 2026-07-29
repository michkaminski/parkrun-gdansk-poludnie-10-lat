/*
 * Renderowanie raportu miesiecznego (doc_months) - wspolny plik JS laczony
 * przez wszystkie 7 podstron jednego miesiaca (index/frekwencja/demografia/
 * hall-of-fame/wolontariusze/rekordy/historia), dokladnie jak main.js w
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

  function ageCategoryColumns() {
    return [
      { key: "category" },
      { key: "count" },
      { key: "avg_time" },
      { key: "best_display", render: ageCategoryDisplay },
    ];
  }

  function renderAgeCategoryTables(ageCategoriesThisYear, ageCategoriesAllYears, locationAgeCategories) {
    makeSortableTable("table-age-cat-year-k", ageCategoriesThisYear.women, ageCategoryColumns());
    makeSortableTable("table-age-cat-year-m", ageCategoriesThisYear.men, ageCategoryColumns());
    makeSortableTable("table-age-cat-all-k", ageCategoriesAllYears.women, ageCategoryColumns());
    makeSortableTable("table-age-cat-all-m", ageCategoriesAllYears.men, ageCategoryColumns());
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

  function renderAgeGradedTable(rows) {
    makeSortableTable(
      "table-age-graded",
      rows,
      [
        { key: "rank" },
        { key: "name" },
        { key: "category" },
        { key: "time" },
        { key: "coefficient", render: (r) => r.coefficient.toFixed(2) },
      ],
      { collapseAfter: 50 }
    );
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
    if (!summary || !document.getElementById("location-context-strip")) return;
    setText("location-context-title", `Cała historia ${summary.location_name}`);
    setHtml(
      "location-context-strip",
      `<strong>${numberFmt.format(summary.total_editions)}</strong> edycji ·
      <strong>${numberFmt.format(summary.total_starts)}</strong> startów ·
      średnio <strong>${summary.avg_participants_per_edition}</strong> os./edycję ·
      najlepszy czas M <strong>${orDash(summary.best_time_m)}</strong>,
      K <strong>${orDash(summary.best_time_f)}</strong> ·
      mediana <strong>${orDash(summary.median_time)}</strong> ·
      najlepszy wsp. wieku <strong>${orDash(summary.best_age_coefficient)}</strong>
      (${dateFmt(summary.first_edition_date)} – ${dateFmt(summary.last_edition_date)})`
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
    if (!entry) return "brak wcześniejszych danych";
    return `${numberFmt.format(entry.value)} osób (edycja #${entry.edition_number}, ${dateFmt(entry.date)})`;
  }
  function fmtTimeBig(entry) {
    if (!entry) return "–";
    return `${entry.value}<span class="record-who">${entry.name} · ${dateFmt(entry.date)}</span>`;
  }
  function fmtTimeCompact(entry) {
    if (!entry) return "brak wcześniejszych danych";
    return `${entry.value} — ${entry.name} (${dateFmt(entry.date)})`;
  }
  function fmtCoefficientBig(entry) {
    if (!entry) return "–";
    return `${entry.value.toFixed(2)}<span class="record-who">${entry.name}, ${entry.category} · ${dateFmt(entry.date)}</span>`;
  }
  function fmtCoefficientCompact(entry) {
    if (!entry) return "brak wcześniejszych danych";
    return `${entry.value.toFixed(2)} — ${entry.name}, ${entry.category} (${dateFmt(entry.date)})`;
  }

  // Trzy stany: pobity (broken, zloty), wyrownany (tied, morski), bez zmian
  // (szary) - patrz PROJEKT_DOC_MONTHS.md, uwaga o wyrownaniach rekordu.
  function recordStatus(comparison) {
    if (comparison.broken) return "broken";
    if (comparison.tied) return "tied";
    return "none";
  }

  function recordBadgeLabel(status) {
    if (status === "broken") return "🎉 Nowy rekord!";
    if (status === "tied") return "🤝 Wyrównany rekord!";
    return "Bez zmian";
  }

  function recordCard(title, comparison, bigFmt, compactFmt) {
    const status = recordStatus(comparison);
    const cls = status === "broken" ? "is-broken" : status === "tied" ? "is-tied" : "";
    return `<div class="record-card ${cls}">
      <span class="record-badge">${recordBadgeLabel(status)}</span>
      <h4>${title}</h4>
      <div class="record-current">${bigFmt(comparison.current)}</div>
      <div class="record-previous">Poprzedni rekord: ${compactFmt(comparison.previous)}</div>
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
    setText("records-year-title", `Rekord roku ${meta.year}`);
    setText("records-month-title", `Rekord miesiąca (na przestrzeni lat) — ${meta.month_label.split(" ")[0]}`);
    setText("records-category-year-title", `Rekordy kategorii wiekowych — rok ${meta.year}`);
    setText("records-category-month-title", `Rekordy kategorii wiekowych — ${meta.month_label.split(" ")[0]} na przestrzeni lat`);

    renderCategoryRecordsTable("table-category-records-overall", "records-category-overall-empty", records.category_records_overall);
    renderCategoryRecordsTable("table-category-records-year", "records-category-year-empty", records.category_records_year);
    renderCategoryRecordsTable(
      "table-category-records-month",
      "records-category-month-empty",
      records.category_records_same_month_all_years
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
    renderVolunteerRankings(data);
    renderYearSummary(data.year_summary, data.meta);
    if (monthlyCumulative) renderCumulativeChart(monthlyCumulative, data.meta);
    renderAgeGradedTable(data.age_graded_ranking);
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
