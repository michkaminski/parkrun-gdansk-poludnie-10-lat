/*
 * Ladowanie danych JSON, wypelnianie KPI/tabel/osi czasu i obsluga motywu.
 * Wersja dla wielostronicowej wersji serwisu (doc_subweb): kazda strona laduje
 * ten sam komplet danych i to samo renderowanie, ale kazda funkcja renderujaca
 * jest bezpieczna do wywolania na stronie, ktora nie ma jej elementow -
 * po prostu nic wtedy nie robi.
 */

(function () {
  "use strict";

  const DATA_FILES = [
    "kpis",
    "attendance_timeline",
    "monthly_timeline",
    "frequent_attendance",
    "time_distribution",
    "attendance_extremes",
    "monthly_attendance",
    "yearly_summary",
    "gender_split",
    "age_categories",
    "top_runners",
    "best_times",
    "age_graded",
    "gender_wins",
    "milestones",
    "volunteers_timeline",
    "volunteers_monthly_timeline",
    "volunteers_yearly",
    "top_volunteers",
  ];

  const numberFmt = new Intl.NumberFormat("pl-PL");
  const dateFmt = (iso) => {
    if (!iso) return "–";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  };

  function loadAll() {
    return Promise.all(
      DATA_FILES.map((name) =>
        fetch(`data/${name}.json`).then((r) => {
          if (!r.ok) throw new Error(`Nie udalo sie wczytac data/${name}.json (${r.status})`);
          return r.json();
        })
      )
    ).then((results) => {
      const data = {};
      DATA_FILES.forEach((name, i) => (data[name] = results[i]));
      return data;
    });
  }

  // -------------------------------------------------------------------
  // KPI + hero
  // -------------------------------------------------------------------
  function renderKpis(kpis) {
    const grid = document.getElementById("kpi-grid");
    if (!grid) return;

    const avgPerEdition = kpis.total_editions ? Math.round((kpis.total_starts / kpis.total_editions) * 10) / 10 : 0;

    const tiles = [
      { label: "Edycji rozegranych", value: kpis.total_editions, sub: "od 30.07.2016" },
      { label: "Wszystkich startów", value: kpis.total_starts, sub: `w tym ${numberFmt.format(kpis.unknown_rows)} bez identyfikacji` },
      { label: "Znanych biegaczy", value: kpis.known_participants, sub: "z unikalnym profilem parkrun" },
      {
        label: "Rekord frekwencji",
        value: kpis.record_attendance.count,
        sub: `edycja #${kpis.record_attendance.edition_number} · ${dateFmt(kpis.record_attendance.date)}`,
      },
      { label: "Średnia na edycję", value: avgPerEdition, sub: "uczestników na starcie", isFloat: true },
    ];

    grid.innerHTML = tiles
      .map(
        (t) => `
      <div class="kpi-tile">
        <span class="kpi-value">${t.isFloat ? t.value : numberFmt.format(t.value)}</span>
        <span class="kpi-label">${t.label}</span>
        <span class="kpi-sub">${t.sub}</span>
      </div>`
      )
      .join("");
  }

  function renderVolunteerKpis(kpis) {
    const grid = document.getElementById("volunteer-kpi-grid");
    if (!grid) return;

    const tiles = [
      { label: "Wpisów wolontariackich", value: kpis.total_volunteer_entries, sub: "od 30.07.2016" },
      { label: "Unikalnych wolontariuszy", value: kpis.unique_volunteers, sub: "z unikalnym profilem parkrun" },
      { label: "Średnio na edycję", value: kpis.avg_volunteers_per_edition, sub: "wolontariuszy na starcie", isFloat: true },
      {
        label: "Rekord wolontariuszy",
        value: kpis.record_volunteers.count,
        sub: `edycja #${kpis.record_volunteers.edition_number} · ${dateFmt(kpis.record_volunteers.date)}`,
      },
    ];

    grid.innerHTML = tiles
      .map(
        (t) => `
      <div class="kpi-tile">
        <span class="kpi-value">${t.isFloat ? t.value : numberFmt.format(t.value)}</span>
        <span class="kpi-label">${t.label}</span>
        <span class="kpi-sub">${t.sub}</span>
      </div>`
      )
      .join("");
  }

  // -------------------------------------------------------------------
  // Os czasu
  // -------------------------------------------------------------------
  const MILESTONE_CLASS = {
    anniversary: "milestone-anniversary",
    record: "milestone-record",
    covid: "milestone-covid",
  };

  function renderTimeline(milestones) {
    const list = document.getElementById("timeline-list");
    if (!list) return;

    list.innerHTML = milestones.timeline
      .map((m) => {
        const cls = MILESTONE_CLASS[m.type] || "";
        return `
        <div class="timeline-item ${cls}">
          <div class="timeline-date">${dateFmt(m.date)}</div>
          <div class="timeline-title">${m.title}</div>
          <div class="timeline-detail">${m.detail}</div>
        </div>`;
      })
      .join("");

    const tbody = document.querySelector("#table-runner-of-year tbody");
    if (tbody) {
      tbody.innerHTML = milestones.runner_of_year
        .slice()
        .reverse()
        .map((r) => `<tr><td>${r.year}</td><td class="cell-name">${r.names.join(", ")}</td><td>${r.starts_count}</td></tr>`)
        .join("");
    }

    const volunteerTbody = document.querySelector("#table-volunteer-of-year tbody");
    if (volunteerTbody) {
      volunteerTbody.innerHTML = milestones.volunteer_of_year
        .slice()
        .reverse()
        .map((r) => `<tr><td>${r.year}</td><td class="cell-name">${r.names.join(", ")}</td><td>${r.volunteer_count}</td></tr>`)
        .join("");
    }
  }

  function renderFrequentAttendance(groups) {
    const tbody = document.querySelector("#table-frequent-attendance tbody");
    if (!tbody) return;

    tbody.innerHTML = groups
      .map(
        (g, i) => `<tr class="is-clickable" data-group-index="${i}" tabindex="0" role="button">
          <td class="rank-cell">${g.rank}</td>
          <td>${g.participants_count}</td>
          <td>${g.occurrences}×</td>
          <td class="cell-name">Zobacz edycje →</td>
        </tr>`
      )
      .join("");

    const openRow = (row) => {
      const group = groups[Number(row.dataset.groupIndex)];
      const rows = group.editions
        .map((e) => `<tr><td>#${e.edition_number}</td><td>${dateFmt(e.date)}</td></tr>`)
        .join("");
      document.getElementById("modal-title").textContent = `${group.participants_count} uczestników — ${group.occurrences}×`;
      document.getElementById("modal-subtitle").textContent =
        `Miejsce ${group.rank} w rankingu najczęstszych frekwencji. Dokładnie ${group.participants_count} osób pojawiło się na starcie w tych edycjach:`;
      document.getElementById("modal-table-body").innerHTML = rows;
      openModal();
    };

    tbody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => openRow(row));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openRow(row);
        }
      });
    });
  }

  function renderAttendanceExtremes(extremes) {
    const fill = (tableId, rows) => {
      const tbody = document.querySelector(`#${tableId} tbody`);
      if (!tbody) return;
      tbody.innerHTML = rows
        .map(
          (r) => `<tr>
            <td class="rank-cell">${r.rank}</td>
            <td>#${r.edition_number}</td>
            <td>${dateFmt(r.date)}</td>
            <td>${numberFmt.format(r.participants_count)}</td>
          </tr>`
        )
        .join("");
    };
    fill("table-attendance-highest", extremes.highest);
    fill("table-attendance-lowest", extremes.lowest);
  }

  function renderMonthlyAttendance(monthly) {
    const fill = (tableId, rows) => {
      const tbody = document.querySelector(`#${tableId} tbody`);
      if (!tbody) return;
      tbody.innerHTML = rows
        .map(
          (r) => `<tr>
            <td class="rank-cell">${r.rank}</td>
            <td class="cell-name">${r.month_label}</td>
            <td>${r.editions_count}</td>
            <td>${numberFmt.format(r.total_participants)}</td>
          </tr>`
        )
        .join("");
    };
    fill("table-monthly-highest", monthly.highest);
    fill("table-monthly-lowest", monthly.lowest);
  }

  // -------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------
  function openModal() {
    document.getElementById("modal-overlay").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    document.getElementById("modal-overlay").hidden = true;
    document.body.style.overflow = "";
  }

  function initModal() {
    const overlay = document.getElementById("modal-overlay");
    if (!overlay) return;
    document.getElementById("modal-close").addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closeModal();
    });
  }

  // -------------------------------------------------------------------
  // Sortowalne tabele
  // -------------------------------------------------------------------
  // options.collapseAfter: gdy podane i rows.length je przekracza, tabela
  // domyslnie pokazuje tylko pierwsze N (posortowanych) wierszy, z przyciskiem
  // "Pokaz wszystkie / Zwin" pod tabela. Stan rozwiniecia przetrwa zmiane
  // sortowania (nie resetuje sie przy kazdym kliknieciu naglowka). Glowny
  // mechanizm skracania bardzo dlugiej strony glownej (patrz duze tabele
  // typu top biegacze/wolontariusze, gdzie 40+ wierszy widac dopiero po
  // kliknieciu).
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

      if (toggleBtn) {
        toggleBtn.textContent = expanded ? "Zwiń ↑" : `Pokaż wszystkie ${numberFmt.format(rows.length)} →`;
        toggleBtn.setAttribute("aria-expanded", String(expanded));
      }
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
          // Pierwsze kliknięcie: liczby malejąco (najwięcej/najlepsze pierwsze),
          // tekst/daty rosnąco (A→Z, najwcześniejsza data pierwsza).
          const sample = rows.find((r) => r[key] !== undefined && r[key] !== null);
          sortDir = sample && typeof sample[key] === "number" ? "desc" : "asc";
        }
        render();
      });
    });

    render();
  }

  function renderHallOfFame(data) {
    makeSortableTable(
      "table-top-runners",
      data.top_runners,
      [
        { key: "rank" },
        { key: "name" },
        { key: "starts_count" },
        { key: "first_start", render: (r) => dateFmt(r.first_start) },
        { key: "last_start", render: (r) => dateFmt(r.last_start) },
      ],
      { collapseAfter: 10 }
    );

    makeSortableTable("table-best-times-women", data.best_times.top_women, [
      { key: "rank" },
      { key: "name" },
      { key: "seconds", render: (r) => r.time },
      { key: "date", render: (r) => dateFmt(r.date) },
      { key: "edition_number", render: (r) => "#" + r.edition_number },
    ]);

    makeSortableTable("table-best-times-men", data.best_times.top_men, [
      { key: "rank" },
      { key: "name" },
      { key: "seconds", render: (r) => r.time },
      { key: "date", render: (r) => dateFmt(r.date) },
      { key: "edition_number", render: (r) => "#" + r.edition_number },
    ]);

    const categoryLinkColumn = {
      key: "category",
      render: (r) =>
        `<a href="category.html?cat=${encodeURIComponent(r.category)}" target="_blank" rel="noopener">${r.category}</a>`,
    };

    makeSortableTable(
      "table-best-by-category-women",
      data.best_times.by_category_women,
      [
        { key: "rank" },
        categoryLinkColumn,
        { key: "name" },
        { key: "seconds", render: (r) => r.time },
        { key: "date", render: (r) => dateFmt(r.date) },
      ],
      { collapseAfter: 10 }
    );

    makeSortableTable(
      "table-best-by-category-men",
      data.best_times.by_category_men,
      [
        { key: "rank" },
        categoryLinkColumn,
        { key: "name" },
        { key: "seconds", render: (r) => r.time },
        { key: "date", render: (r) => dateFmt(r.date) },
      ],
      { collapseAfter: 10 }
    );

    makeSortableTable(
      "table-age-graded",
      data.age_graded,
      [
        { key: "rank" },
        { key: "name" },
        { key: "category" },
        { key: "seconds", render: (r) => r.time },
        { key: "coefficient", render: (r) => r.coefficient.toFixed(2) },
        { key: "date", render: (r) => dateFmt(r.date) },
      ],
      { collapseAfter: 10 }
    );

    makeSortableTable(
      "table-gender-wins-women",
      data.gender_wins.women,
      [{ key: "rank" }, { key: "name" }, { key: "wins" }],
      { collapseAfter: 10 }
    );

    makeSortableTable(
      "table-gender-wins-men",
      data.gender_wins.men,
      [{ key: "rank" }, { key: "name" }, { key: "wins" }],
      { collapseAfter: 10 }
    );
  }

  function renderVolunteers(topVolunteers) {
    makeSortableTable(
      "table-top-volunteers",
      topVolunteers,
      [
        { key: "rank" },
        { key: "name" },
        { key: "volunteer_count" },
        { key: "starts_count" },
        { key: "first_volunteer_date", render: (r) => dateFmt(r.first_volunteer_date) },
        { key: "last_volunteer_date", render: (r) => dateFmt(r.last_volunteer_date) },
      ],
      { collapseAfter: 10 }
    );
  }

  // -------------------------------------------------------------------
  // Motyw jasny/ciemny
  // -------------------------------------------------------------------
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
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const currentlyDark = current === "dark" || (!current && prefersDark);
      const next = currentlyDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("parkrun-theme", next);
      btn.textContent = next === "dark" ? "☀️" : "🌙";
      onThemeChange();
    });
  }

  // -------------------------------------------------------------------
  // Nawigacja: kazda sekcja to teraz osobna podstrona, wiec zamiast
  // scrollspy po prostu podswietlamy link, ktorego href odpowiada
  // aktualnemu plikowi.
  // -------------------------------------------------------------------
  function initStaticNavHighlight() {
    const here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".site-nav a[href]").forEach((link) => {
      const href = link.getAttribute("href").split("?")[0];
      if (href === here) link.classList.add("active");
    });
  }

  function initBackToTop() {
    const btn = document.getElementById("back-to-top");
    if (!btn) return;

    const updateVisibility = () => {
      btn.classList.toggle("is-visible", window.scrollY > 600);
    };
    window.addEventListener("scroll", updateVisibility, { passive: true });
    updateVisibility();

    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  initStaticNavHighlight();
  initBackToTop();

  // -------------------------------------------------------------------
  // Start
  // -------------------------------------------------------------------
  loadAll()
    .then((data) => {
      renderKpis(data.kpis);
      renderVolunteerKpis(data.kpis);
      renderTimeline(data.milestones);
      renderFrequentAttendance(data.frequent_attendance);
      renderAttendanceExtremes(data.attendance_extremes);
      renderMonthlyAttendance(data.monthly_attendance);
      renderHallOfFame(data);
      renderVolunteers(data.top_volunteers);
      initModal();

      window.ParkrunCharts.buildAll(data);
      initThemeToggle(() => window.ParkrunCharts.buildAll(data));
    })
    .catch((err) => {
      console.error(err);
      document.querySelector("main").insertAdjacentHTML(
        "afterbegin",
        `<div class="container" style="padding-top:24px;color:#c0392b;">
          Nie udało się wczytać danych (${err.message}). Jeśli otwierasz plik lokalnie z dysku,
          uruchom prosty serwer HTTP (np. <code>python -m http.server</code>) w folderze doc_subweb/.
        </div>`
      );
    });
})();
