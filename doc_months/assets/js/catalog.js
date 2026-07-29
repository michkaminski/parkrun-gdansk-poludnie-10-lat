/*
 * Renderuje trzy poziomy stron-katalogow doc_months (lista lokalizacji /
 * lista lat / lista miesiecy) z jednego, wspolnego manifest.json. Poziom i
 * sciezka do manifestu sa zaszyte w kazdym z trzech szablonow HTML
 * (data-level + data-manifest-path na <body>, patrz pipeline/templates/
 * catalog-*.html) - ten plik JS jest wspolny, bo logika renderowania listy
 * kart jest identyczna, rozni sie tylko to, ktory poziom manifestu bierze
 * i jak buduje linki "w dol".
 */

(function () {
  "use strict";

  const numberFmt = new Intl.NumberFormat("pl-PL");

  function pathSegments() {
    return window.location.pathname
      .split("/")
      .filter((seg) => seg && seg !== "index.html");
  }

  function currentLocationId() {
    const segs = pathSegments();
    return segs[segs.length - 1];
  }

  function currentLocationAndYear() {
    const segs = pathSegments();
    return { locationId: segs[segs.length - 2], year: Number(segs[segs.length - 1]) };
  }

  function initThemeToggle() {
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
    });
  }

  function renderCards(rows) {
    const grid = document.getElementById("hub-grid");
    if (!grid) return;
    if (!rows.length) {
      grid.innerHTML = `<p>Brak wygenerowanych stron na tym poziomie jeszcze.</p>`;
      return;
    }
    grid.innerHTML = rows
      .map(
        (r) => `<a class="hub-card" href="${r.href}">
          <span class="hub-kicker">${r.kicker}</span>
          <h3>${r.title}</h3>
          <p>${r.subtitle}</p>
          <span class="hub-arrow">Zobacz →</span>
        </a>`
      )
      .join("");
  }

  function renderRoot(manifest) {
    document.getElementById("page-heading").textContent = "Raporty miesięczne parkrun";
    document.getElementById("page-subheading").textContent = "Wybierz lokalizację.";
    const rows = manifest.locations.map((loc) => {
      const monthsCount = loc.years.reduce((sum, y) => sum + y.months.length, 0);
      return {
        href: `${loc.id}/`,
        kicker: "Lokalizacja",
        title: loc.name,
        subtitle: `${loc.years.length} lat, ${monthsCount} wygenerowanych miesięcy`,
      };
    });
    renderCards(rows);
  }

  function renderLocation(manifest) {
    const locationId = currentLocationId();
    const location = manifest.locations.find((l) => l.id === locationId);
    if (!location) {
      document.getElementById("page-heading").textContent = "Nie znaleziono lokalizacji";
      return;
    }
    document.getElementById("page-heading").textContent = location.name;
    document.getElementById("page-subheading").textContent = "Wybierz rok.";
    const rows = location.years.map((y) => {
      const total = y.months.reduce((sum, m) => sum + m.total_participants, 0);
      return {
        href: `${y.year}/`,
        kicker: "Rok",
        title: String(y.year),
        subtitle: `${y.months.length} miesięcy, ${numberFmt.format(total)} uczestnictw`,
      };
    });
    renderCards(rows);
  }

  function renderYear(manifest) {
    const { locationId, year } = currentLocationAndYear();
    const location = manifest.locations.find((l) => l.id === locationId);
    const yearEntry = location && location.years.find((y) => y.year === year);
    if (!yearEntry) {
      document.getElementById("page-heading").textContent = "Nie znaleziono roku";
      return;
    }
    document.getElementById("page-heading").textContent = `${location.name} — ${year}`;
    document.getElementById("page-subheading").textContent = "Wybierz miesiąc.";
    const rows = yearEntry.months
      .slice()
      .sort((a, b) => a.month - b.month)
      .map((m) => ({
        href: `${String(m.month).padStart(2, "0")}/`,
        kicker: "Miesiąc",
        title: m.label,
        subtitle: `${m.editions_count} edycje, ${numberFmt.format(m.total_participants)} uczestnictw`,
      }));
    renderCards(rows);
  }

  const level = document.body.dataset.level;
  const manifestPath = document.body.dataset.manifestPath || "manifest.json";

  initThemeToggle();

  fetch(manifestPath)
    .then((r) => {
      if (!r.ok) throw new Error(`Nie udalo sie wczytac ${manifestPath} (${r.status})`);
      return r.json();
    })
    .then((manifest) => {
      if (level === "root") renderRoot(manifest);
      else if (level === "location") renderLocation(manifest);
      else if (level === "year") renderYear(manifest);
    })
    .catch((err) => {
      console.error(err);
      document.getElementById("page-heading").textContent = "Nie udało się wczytać katalogu";
    });
})();
