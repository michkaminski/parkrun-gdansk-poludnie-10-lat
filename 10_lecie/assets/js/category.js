/*
 * Strona szczegolow pojedynczej kategorii wiekowej (?cat=VM40-44).
 * Celowo samodzielna - nie laduje main.js/charts.js (te ciagna caly
 * dashboard z 16 plikow JSON), tylko wlasny, maly fetch + render.
 */

(function () {
  "use strict";

  const numberFmt = new Intl.NumberFormat("pl-PL");
  const dateFmt = (iso) => {
    if (!iso) return "–";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  };

  const GROUP_NAMES = { J: "Junior", S: "Senior", V: "Weteran" };
  const GENDER_NAMES = { M: "mężczyźni", W: "kobiety" };

  function categoryLabel(code) {
    const group = GROUP_NAMES[code[0] ? code[0].toUpperCase() : ""] || "Kategoria";
    const genderLabel = GENDER_NAMES[code[1] ? code[1].toUpperCase() : ""] || "";
    const ageSpec = code.slice(2);
    return { group, genderLabel, ageSpec };
  }

  // Kopia makeSortableTable z main.js - swiadoma duplikacja, zeby ta strona
  // zostala lekka i niezalezna od reszty dashboardu.
  function makeSortableTable(tableId, rows, columns) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const tbody = table.querySelector("tbody");
    const ths = table.querySelectorAll("thead th[data-key]");

    let sortKey = table.dataset.defaultSort || null;
    let sortDir = table.dataset.defaultDir || "desc";

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

      tbody.innerHTML = sorted
        .map((row, i) => {
          const cells = columns
            .map((col) => {
              if (col.key === "rank") return `<td class="rank-cell">${i + 1}</td>`;
              const value = col.render ? col.render(row) : row[col.key];
              const cls = col.key === "name" ? ' class="cell-name"' : "";
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
    }

    ths.forEach((th) => {
      if (th.dataset.key === "rank") return;
      if (!th.querySelector(".sort-arrow")) {
        const arrow = document.createElement("span");
        arrow.className = "sort-arrow";
        arrow.textContent = "↕";
        th.appendChild(arrow);
      }
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
    });

    render();
  }

  let categoryChart = null;
  function buildCategoryChart(startsByYear) {
    const ctx = document.getElementById("chart-category-year");
    if (!ctx || typeof Chart === "undefined") return;
    if (categoryChart) categoryChart.destroy();

    const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const gridline = cssVar("--gridline");
    const textMuted = cssVar("--text-muted");
    const seriesColor = cssVar("--series-3");

    Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";

    categoryChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: startsByYear.map((y) => y.year),
        datasets: [
          {
            label: "Starty",
            data: startsByYear.map((y) => y.count),
            backgroundColor: seriesColor,
            borderRadius: 4,
            maxBarThickness: 40,
          },
        ],
      },
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

  let categoryMonthChart = null;
  function buildCategoryMonthChart(startsByMonth) {
    const ctx = document.getElementById("chart-category-month");
    if (!ctx || typeof Chart === "undefined") return;
    if (categoryMonthChart) categoryMonthChart.destroy();

    const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const gridline = cssVar("--gridline");
    const textMuted = cssVar("--text-muted");
    const seriesColor = cssVar("--series-4");

    Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";

    categoryMonthChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: startsByMonth.map((m) => m.month_label),
        datasets: [
          {
            label: "Starty",
            data: startsByMonth.map((m) => m.count),
            backgroundColor: seriesColor,
            borderRadius: 2,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: textMuted, maxRotation: 60, minRotation: 60, autoSkip: true, maxTicksLimit: 30 } },
          y: { grid: { color: gridline, drawTicks: false }, ticks: { color: textMuted }, beginAtZero: true },
        },
      },
    });
  }

  // Mini-kopia hexToRgba z charts.js - zduplikowana (nie importowana),
  // zeby ta strona byla samodzielna.
  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const bigint = parseInt(h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  let timeDistributionChart = null;
  function buildTimeDistributionChart(histogram, color) {
    const ctx = document.getElementById("chart-category-time-distribution");
    if (!ctx || typeof Chart === "undefined") return;
    if (timeDistributionChart) timeDistributionChart.destroy();

    const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const gridline = cssVar("--gridline");
    const textMuted = cssVar("--text-muted");

    timeDistributionChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: histogram.map((b) => b.label),
        datasets: [
          {
            label: "Liczba wyników",
            data: histogram.map((b) => b.count),
            borderColor: color,
            backgroundColor: hexToRgba(color, 0.18),
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: textMuted, maxTicksLimit: 12 } },
          y: { grid: { color: gridline, drawTicks: false }, ticks: { color: textMuted }, beginAtZero: true },
        },
      },
    });
  }

  function initThemeToggle(onThemeChange) {
    const btn = document.getElementById("theme-toggle");
    const stored = localStorage.getItem("parkrun-theme");
    if (stored) {
      document.documentElement.setAttribute("data-theme", stored);
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effective = stored || (prefersDark ? "dark" : "light");
    btn.textContent = effective === "dark" ? "☀️" : "🌙";

    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const prefersDark2 = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const currentlyDark = current === "dark" || (!current && prefersDark2);
      const next = currentlyDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("parkrun-theme", next);
      btn.textContent = next === "dark" ? "☀️" : "🌙";
      onThemeChange();
    });
  }

  function renderNotFound(cat) {
    document.getElementById("category-content").style.display = "none";
    document.getElementById("category-not-found").hidden = false;
    document.getElementById("category-title").textContent = "Nie znaleziono kategorii";
    document.getElementById("category-subtitle").textContent = cat
      ? `Brak danych dla kategorii "${cat}".`
      : "Nie podano kategorii w adresie strony.";
  }

  function render(cat, entry) {
    const label = categoryLabel(cat);
    document.title = `${cat} — parkrun Gdańsk Południe`;
    document.getElementById("category-title").textContent = cat;
    document.getElementById("category-subtitle").textContent =
      `${label.group}, ${label.genderLabel} — wiek ${label.ageSpec}`;

    const bt = entry.best_time;
    const kpis = [
      { label: "Startów w kategorii", value: numberFmt.format(entry.total_starts) },
      { label: "Unikalnych uczestników", value: numberFmt.format(entry.unique_participants) },
      {
        label: "Najlepszy czas",
        value: bt ? bt.time : "–",
        sub: bt ? `${bt.name} · ${dateFmt(bt.date)} · edycja #${bt.edition_number}` : "brak danych",
      },
    ];
    document.getElementById("category-kpi-grid").innerHTML = kpis
      .map(
        (k) => `
      <div class="kpi-tile">
        <span class="kpi-value">${k.value}</span>
        <span class="kpi-label">${k.label}</span>
        <span class="kpi-sub">${k.sub || ""}</span>
      </div>`
      )
      .join("");

    buildCategoryChart(entry.starts_by_year);
    buildCategoryMonthChart(entry.starts_by_month);

    const genderColorVar = entry.gender === "K" ? "--series-2" : "--series-1";
    const genderColor = getComputedStyle(document.documentElement).getPropertyValue(genderColorVar).trim();
    buildTimeDistributionChart(entry.time_distribution, genderColor);

    makeSortableTable("table-category-top-times", entry.top_times, [
      { key: "rank" },
      { key: "name" },
      { key: "seconds", render: (r) => r.time },
      { key: "date", render: (r) => dateFmt(r.date) },
      { key: "edition_number", render: (r) => "#" + r.edition_number },
    ]);

    // Nie makeSortableTable - top_attendance ma dense-rank z remisami na
    // granicy (jak attendance_extremes.json na stronie glownej), wiec
    // pokazujemy rzeczywiste pole "rank" (moze sie powtarzac), a nie
    // pozycje w tabeli.
    document.querySelector("#table-category-top-attendance tbody").innerHTML = entry.top_attendance
      .map(
        (r) => `<tr>
          <td class="rank-cell">${r.rank}</td>
          <td>#${r.edition_number}</td>
          <td>${dateFmt(r.date)}</td>
          <td>${numberFmt.format(r.count)}</td>
        </tr>`
      )
      .join("");

    makeSortableTable("table-category-top-age-graded", entry.top_age_graded, [
      { key: "rank" },
      { key: "name" },
      { key: "seconds", render: (r) => r.time },
      { key: "coefficient", render: (r) => r.coefficient.toFixed(2) },
      { key: "date", render: (r) => dateFmt(r.date) },
    ]);

    makeSortableTable("table-category-winners", entry.winners, [
      { key: "rank" },
      { key: "name" },
      { key: "wins" },
      { key: "second" },
      { key: "third" },
    ]);
  }

  const cat = new URLSearchParams(location.search).get("cat");

  fetch("data/category_details.json")
    .then((r) => {
      if (!r.ok) throw new Error(`Nie udalo sie wczytac data/category_details.json (${r.status})`);
      return r.json();
    })
    .then((data) => {
      const entry = cat ? data[cat] : null;
      if (!entry) {
        renderNotFound(cat);
        initThemeToggle(() => {});
        return;
      }
      render(cat, entry);
      initThemeToggle(() => {
        buildCategoryChart(entry.starts_by_year);
        buildCategoryMonthChart(entry.starts_by_month);
        const genderColorVar = entry.gender === "K" ? "--series-2" : "--series-1";
        const genderColor = getComputedStyle(document.documentElement).getPropertyValue(genderColorVar).trim();
        buildTimeDistributionChart(entry.time_distribution, genderColor);
      });
    })
    .catch((err) => {
      console.error(err);
      renderNotFound(cat);
      initThemeToggle(() => {});
    });
})();
