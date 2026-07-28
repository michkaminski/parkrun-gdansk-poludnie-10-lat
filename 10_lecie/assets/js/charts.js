/*
 * Definicje wykresow Chart.js dla strony parkrun Gdansk Poludnie.
 * Kolory sa zawsze czytane z CSS custom properties w momencie (re)budowy
 * wykresow, zeby przelaczenie motywu jasny/ciemny odswiezalo tez wykresy.
 */

(function (window) {
  "use strict";

  let chartInstances = [];
  let showAgeLabels = false;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function palette() {
    return {
      textPrimary: cssVar("--text-primary"),
      textSecondary: cssVar("--text-secondary"),
      textMuted: cssVar("--text-muted"),
      gridline: cssVar("--gridline"),
      baseline: cssVar("--baseline"),
      surface: cssVar("--surface-1"),
      cardBg: cssVar("--card-bg"),
      brandGold: cssVar("--brand-gold"),
      brandTeal: cssVar("--brand-teal"),
      series1: cssVar("--series-1"),
      series2: cssVar("--series-2"),
      series3: cssVar("--series-3"),
      series4: cssVar("--series-4"),
      seq250: cssVar("--seq-250"),
      seq350: cssVar("--seq-350"),
      seq450: cssVar("--seq-450"),
      seq550: cssVar("--seq-550"),
      seq650: cssVar("--seq-650"),
    };
  }

  function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function baseFont() {
    return { family: "system-ui, -apple-system, 'Segoe UI', sans-serif", size: 12 };
  }

  const numberFmt = new Intl.NumberFormat("pl-PL");

  // Plugin lokalny (nie rejestrowany globalnie) - dopisuje wartosc na koncu
  // kazdego slupka. Uzywany tylko tam, gdzie to jedna seria - przy wielu
  // seriach (stacked) zrobilby z wykresu szum.
  const barEndValueLabels = {
    id: "barEndValueLabels",
    afterDatasetsDraw(chart) {
      const c = palette();
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const dataset = chart.data.datasets[0];
      ctx.save();
      ctx.fillStyle = c.textSecondary;
      ctx.font = "600 11px " + baseFont().family;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      meta.data.forEach((bar, i) => {
        const value = dataset.data[i];
        if (value === undefined || value === null) return;
        ctx.fillText(numberFmt.format(value), bar.x + 6, bar.y);
      });
      ctx.restore();
    },
  };

  // Jak barEndValueLabels, ale dla pojedynczego pionowego bar-chartu -
  // dopisuje wartosc nad kazdym slupkiem.
  const topBarValueLabels = {
    id: "topBarValueLabels",
    afterDatasetsDraw(chart) {
      const c = palette();
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const dataset = chart.data.datasets[0];
      ctx.save();
      ctx.fillStyle = c.textSecondary;
      ctx.font = "600 10px " + baseFont().family;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      meta.data.forEach((bar, i) => {
        const value = dataset.data[i];
        if (value === undefined || value === null) return;
        ctx.fillText(numberFmt.format(value), bar.x, bar.y - 4);
      });
      ctx.restore();
    },
  };

  // Plugin dla pogrupowanych (nie-stackowanych) pionowych bar-chartow -
  // dopisuje wartosc procentowa nad kazdym slupkiem wszystkich datasetow.
  const groupedBarPctLabels = {
    id: "groupedBarPctLabels",
    afterDatasetsDraw(chart) {
      const c = palette();
      const { ctx } = chart;
      ctx.save();
      ctx.font = "600 10px " + baseFont().family;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = c.textSecondary;
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;
        meta.data.forEach((bar, i) => {
          const value = dataset.data[i];
          if (value === undefined || value === null) return;
          ctx.fillText(`${value}%`, bar.x, bar.y - 4);
        });
      });
      ctx.restore();
    },
  };

  // Fabryka pluginu do stackowanych bar-chartow: dopisuje wartosc na srodku
  // kazdego segmentu, ale tylko gdy segment jest wystarczajaco wysoki, zeby
  // etykieta sie zmiescila - inaczej robi sie szum na cienkich paskach.
  // Kolor tekstu delikatny (alpha < 1), dobrany do jasnosci segmentu: ciemny
  // tekst na jasniejszych (pierwsze kroki rampy), jasny na ciemniejszych.
  // Wlaczane/wylaczane globalnie przez checkbox (initAgeLabelsToggle),
  // domyslnie wylaczone.
  //
  // leaderForTopSegment: dla najmniejszych segmentow NAJWYZSZEGO datasetu
  // (nic nad nim w stosie) rysuje kreske w gore i etykiete nad slupkiem,
  // zamiast pomijac ja calkowicie. Ma sens tylko gdy nad slupkiem jest
  // realnie wolna przestrzen (stack nie siega osi/gornej granicy) - dlatego
  // NIE jest wlaczone dla wykresu 100%-stacked, gdzie suma zawsze siega 100%.
  function stackedSegmentLabels(formatFn, { minHeight = 9, darkFromIndex = 2, leaderForTopSegment = false } = {}) {
    return {
      id: "stackedSegmentLabels",
      afterDatasetsDraw(chart) {
        if (!showAgeLabels) return;
        const c = palette();
        const { ctx } = chart;
        const lastIndex = chart.data.datasets.length - 1;
        ctx.save();
        ctx.font = "600 10px " + baseFont().family;
        ctx.textAlign = "center";
        chart.data.datasets.forEach((dataset, datasetIndex) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (meta.hidden) return;
          const insideColor = datasetIndex >= darkFromIndex ? "rgba(255,255,255,0.85)" : "rgba(11,11,11,0.65)";
          meta.data.forEach((bar, i) => {
            const value = dataset.data[i];
            if (!value) return;
            const segmentHeight = Math.abs(bar.base - bar.y);
            if (segmentHeight >= minHeight) {
              ctx.fillStyle = insideColor;
              ctx.textBaseline = "middle";
              ctx.fillText(formatFn(value), bar.x, (bar.y + bar.base) / 2);
              return;
            }
            if (!leaderForTopSegment || datasetIndex !== lastIndex) return;
            const tipY = bar.y - 12;
            ctx.strokeStyle = c.textMuted;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bar.x, bar.y);
            ctx.lineTo(bar.x, tipY);
            ctx.stroke();
            ctx.fillStyle = c.textSecondary;
            ctx.textBaseline = "bottom";
            ctx.fillText(formatFn(value), bar.x, tipY - 2);
          });
        });
        ctx.restore();
      },
    };
  }

  // Checkbox(y) "Pokaz liczby na slupkach" - jeden globalny stan
  // (showAgeLabels) dzielony przez oba wykresy grup wiekowych. Spiete tylko
  // raz przy starcie skryptu - elementy sa statycznym HTML, przezywaja
  // niszczenie/odtwarzanie wykresow przy zmianie motywu.
  //
  // Gdy etykiety sa wlaczone, podnosimy tez y.max ponad realny zakres danych
  // na obu wykresach - bez tego najwyzszy (ostatni) segment siega dokladnie
  // do gornej krawedzi plot area (w 100%-stacked suma = 100%, w liczbach
  // bezwzglednych "ladny" tick czesto siedzi tuz nad najwyzszym slupkiem) i
  // nie ma fizycznie miejsca na kreske + etykiete ponad slupkiem. Podnoszenie
  // y.max (a nie np. layout.padding) tworzy ta przestrzen WEWNATRZ plot area,
  // wiec legenda nad wykresem zostaje na miejscu.
  const PCT_HEADROOM_MAX = 112;

  function initAgeLabelsToggle() {
    const checkboxes = Array.from(document.querySelectorAll(".age-labels-toggle"));
    if (!checkboxes.length) return;
    checkboxes.forEach((cb) => {
      cb.checked = showAgeLabels;
      cb.addEventListener("change", () => {
        showAgeLabels = cb.checked;
        checkboxes.forEach((other) => {
          other.checked = showAgeLabels;
        });
        const absChart = Chart.getChart("chart-age-groups");
        if (absChart) {
          absChart.options.scales.y.max = showAgeLabels ? absChart.$labelHeadroomMax : undefined;
          absChart.update("none");
        }
        const pctChart = Chart.getChart("chart-age-groups-pct");
        if (pctChart) {
          pctChart.options.scales.y.max = showAgeLabels ? PCT_HEADROOM_MAX : 100;
          pctChart.update("none");
        }
      });
    });
  }

  function applyGlobalDefaults() {
    const c = palette();
    Chart.defaults.font.family = baseFont().family;
    Chart.defaults.color = c.textSecondary;
    Chart.defaults.borderColor = c.gridline;
    Chart.defaults.plugins.tooltip.backgroundColor = c.cardBg;
    Chart.defaults.plugins.tooltip.titleColor = c.textPrimary;
    Chart.defaults.plugins.tooltip.bodyColor = c.textSecondary;
    Chart.defaults.plugins.tooltip.borderColor = c.gridline;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.displayColors = true;
  }

  function destroyAll() {
    chartInstances.forEach((c) => c.destroy());
    chartInstances = [];
  }

  function register(chart) {
    chartInstances.push(chart);
    return chart;
  }

  function commonScaleGrid(c) {
    return { color: c.gridline, drawTicks: false };
  }

  // Adnotacje typu "label" sa domyslnie wysrodkowane na swoim punkcie - gdy
  // ten punkt siedzi blisko lewej/prawej krawedzi wykresu (np. rekord z
  // ostatnich paru miesiecy danych), tekst etykiety wychodzi poza plot area
  // i zostaje ucinany. Przesuwamy go wtedy do wewnatrz.
  function edgeAwareXAdjust(index, length, shift = 55, edgeCount = 5) {
    if (index <= edgeCount) return shift;
    if (index >= length - 1 - edgeCount) return -shift;
    return 0;
  }

  // ---------------------------------------------------------------------
  // C. Frekwencja - wykres glowny (bary + srednia 12-edycji + skumulowana)
  // ---------------------------------------------------------------------
  function buildAttendanceChart(timeline) {
    const c = palette();
    const ctx = document.getElementById("chart-attendance");
    if (!ctx) return;

    const labels = timeline.map((t) => t.date);
    const raw = timeline.map((t) => t.participants);
    const rolling12 = timeline.map((t) => t.rolling_avg_12);
    const cumulative = timeline.map((t) => t.cumulative_avg);

    const record = timeline.reduce((max, t) => (t.participants > max.participants ? t : max), timeline[0]);
    const recordIndex = timeline.indexOf(record);
    const recordXAdjust = edgeAwareXAdjust(recordIndex, timeline.length);

    const covidStartIdx = timeline.findIndex((t) => t.date >= "2020-03-01");
    const covidEndIdx = timeline.findIndex((t) => t.date >= "2021-12-31");

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Frekwencja (edycja)",
            data: raw,
            backgroundColor: hexToRgba(c.textMuted, 0.28),
            borderRadius: 3,
            barPercentage: 1.0,
            categoryPercentage: 1.0,
            order: 3,
          },
          {
            type: "line",
            label: "Średnia z 12 edycji",
            data: rolling12,
            borderColor: c.series1,
            backgroundColor: hexToRgba(c.series1, 0.12),
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
            fill: false,
            order: 1,
          },
          {
            type: "line",
            label: "Skumulowana średnia od startu",
            data: cumulative,
            borderColor: c.series2,
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            tension: 0.15,
            fill: false,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 14, boxHeight: 2, usePointStyle: false } },
          annotation: {
            annotations: {
              covidBox: covidStartIdx >= 0 && covidEndIdx >= 0 ? {
                type: "box",
                xMin: covidStartIdx,
                xMax: covidEndIdx,
                backgroundColor: hexToRgba(c.textMuted, 0.10),
                borderWidth: 0,
                label: {
                  display: true,
                  content: "Przerwa pandemiczna",
                  position: "start",
                  color: c.textMuted,
                  font: { size: 10, weight: "600" },
                },
              } : undefined,
              recordPoint: {
                type: "point",
                xValue: recordIndex,
                yValue: record.participants,
                backgroundColor: c.brandGold,
                radius: 5,
                borderWidth: 2,
                borderColor: c.cardBg,
              },
              recordLabel: {
                type: "label",
                xValue: recordIndex,
                yValue: record.participants,
                content: ["Rekord: " + record.participants],
                color: c.textPrimary,
                font: { size: 11, weight: "700" },
                yAdjust: -18,
                xAdjust: recordXAdjust,
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 10, color: c.textMuted },
          },
          y: {
            grid: commonScaleGrid(c),
            ticks: { color: c.textMuted },
            beginAtZero: true,
          },
        },
      },
    });
    register(chart);
  }

  // ---------------------------------------------------------------------
  // C. Frekwencja - wersja miesieczna (bary = suma uczestnikow w miesiacu)
  // ---------------------------------------------------------------------
  function buildMonthlyAttendanceChart(timeline) {
    const c = palette();
    const ctx = document.getElementById("chart-attendance-monthly");
    if (!ctx) return;

    const labels = timeline.map((t) => t.month_label);
    const raw = timeline.map((t) => t.total_participants);
    const rolling12 = timeline.map((t) => t.rolling_avg_12);
    const cumulative = timeline.map((t) => t.cumulative_avg);

    const record = timeline.reduce((max, t) => (t.total_participants > max.total_participants ? t : max), timeline[0]);
    const recordIndex = timeline.indexOf(record);
    const recordXAdjust = edgeAwareXAdjust(recordIndex, timeline.length);

    const covidStartIdx = timeline.findIndex((t) => t.date >= "2020-03-01");
    const covidEndIdx = timeline.findIndex((t) => t.date >= "2021-12-31");

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Frekwencja (miesiąc)",
            data: raw,
            backgroundColor: hexToRgba(c.textMuted, 0.28),
            borderRadius: 3,
            barPercentage: 1.0,
            categoryPercentage: 1.0,
            order: 3,
          },
          {
            type: "line",
            label: "Średnia z 12 miesięcy",
            data: rolling12,
            borderColor: c.series1,
            backgroundColor: hexToRgba(c.series1, 0.12),
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
            fill: false,
            order: 1,
          },
          {
            type: "line",
            label: "Skumulowana średnia od startu",
            data: cumulative,
            borderColor: c.series2,
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            tension: 0.15,
            fill: false,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 14, boxHeight: 2, usePointStyle: false } },
          annotation: {
            annotations: {
              covidBox: covidStartIdx >= 0 && covidEndIdx >= 0 ? {
                type: "box",
                xMin: covidStartIdx,
                xMax: covidEndIdx,
                backgroundColor: hexToRgba(c.textMuted, 0.10),
                borderWidth: 0,
                label: {
                  display: true,
                  content: "Przerwa pandemiczna",
                  position: "start",
                  color: c.textMuted,
                  font: { size: 10, weight: "600" },
                },
              } : undefined,
              recordPoint: {
                type: "point",
                xValue: recordIndex,
                yValue: record.total_participants,
                backgroundColor: c.brandGold,
                radius: 5,
                borderWidth: 2,
                borderColor: c.cardBg,
              },
              recordLabel: {
                type: "label",
                xValue: recordIndex,
                yValue: record.total_participants,
                content: ["Rekord: " + record.total_participants],
                color: c.textPrimary,
                font: { size: 11, weight: "700" },
                yAdjust: -18,
                xAdjust: recordXAdjust,
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 10, color: c.textMuted },
          },
          y: {
            grid: commonScaleGrid(c),
            ticks: { color: c.textMuted },
            beginAtZero: true,
          },
        },
      },
    });
    register(chart);
  }

  // ---------------------------------------------------------------------
  // D. Rok po roku
  // ---------------------------------------------------------------------
  function buildYearlyChart(yearly) {
    const c = palette();
    const ctx = document.getElementById("chart-yearly");
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: yearly.map((y) => y.year),
        datasets: [
          {
            type: "bar",
            label: "Średnia / edycję",
            data: yearly.map((y) => y.avg_participants),
            backgroundColor: c.series1,
            borderRadius: 4,
            maxBarThickness: 24,
            order: 2,
          },
          {
            type: "line",
            label: "Mediana / edycję",
            data: yearly.map((y) => y.median_participants),
            borderColor: c.series2,
            backgroundColor: c.series2,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: c.series2,
            pointBorderColor: c.cardBg,
            pointBorderWidth: 2,
            tension: 0.15,
            fill: false,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 14, boxHeight: 2 } },
          tooltip: {
            callbacks: {
              afterLabel: (item) => {
                if (item.datasetIndex !== 0) return undefined;
                const y = yearly[item.dataIndex];
                return `Edycji w roku: ${y.editions_count}`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.textMuted } },
          y: { grid: commonScaleGrid(c), ticks: { color: c.textMuted }, beginAtZero: true },
        },
      },
    });
    register(chart);
  }

  // ---------------------------------------------------------------------
  // D. Suma uczestnikow na rok
  // ---------------------------------------------------------------------
  function buildYearlyTotalChart(yearly) {
    const c = palette();
    const ctx = document.getElementById("chart-yearly-total");
    if (!ctx) return;

    const maxVal = Math.max(...yearly.map((y) => y.total_participants));
    const suggestedMax = Math.ceil((maxVal * 1.12) / 500) * 500;

    const chart = new Chart(ctx, {
      type: "bar",
      plugins: [topBarValueLabels],
      data: {
        labels: yearly.map((y) => y.year),
        datasets: [
          {
            label: "Suma uczestników",
            data: yearly.map((y) => y.total_participants),
            backgroundColor: c.series3,
            borderRadius: 4,
            maxBarThickness: 24,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (item) => {
                const y = yearly[item.dataIndex];
                return `Edycji w roku: ${y.editions_count}`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.textMuted } },
          y: { grid: commonScaleGrid(c), ticks: { color: c.textMuted }, beginAtZero: true, suggestedMax },
        },
      },
    });
    register(chart);
  }

  // ---------------------------------------------------------------------
  // E. Podzial plci - stacked bar (custom HTML, nie Chart.js)
  // ---------------------------------------------------------------------
  function buildGenderStackedBar(genderOverall) {
    const c = palette();
    const el = document.getElementById("gender-stacked-bar");
    if (!el) return;

    const total = genderOverall.women + genderOverall.men + genderOverall.unknown;
    const segments = [
      { label: "Mężczyźni", value: genderOverall.men, color: c.series1 },
      { label: "Kobiety", value: genderOverall.women, color: c.series2 },
      { label: "Brak danych", value: genderOverall.unknown, color: c.textMuted },
    ];

    const barHtml = segments
      .map((s, i) => {
        const pct = (100 * s.value) / total;
        const gap = i < segments.length - 1 ? "margin-right:2px;" : "";
        return `<div title="${s.label}: ${s.value.toLocaleString("pl-PL")} (${pct.toFixed(1)}%)" style="flex-basis:${pct}%;background:${s.color};${gap}height:100%;"></div>`;
      })
      .join("");

    const legendHtml = segments
      .map(
        (s) =>
          `<span style="display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;color:${c.textSecondary};margin-right:16px;">
             <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;"></span>
             ${s.label} — ${numberFmt.format(s.value)} (${((100 * s.value) / total).toFixed(1)}%)
           </span>`
      )
      .join("");

    el.innerHTML = `
      <div style="display:flex;width:100%;height:28px;border-radius:8px;overflow:hidden;">${barHtml}</div>
      <div style="margin-top:12px;">${legendHtml}</div>
    `;
  }

  // ---------------------------------------------------------------------
  // E. Udzial kobiet i mezczyzn w czasie - pogrupowane slupki z etykietami %
  // ---------------------------------------------------------------------
  function buildGenderTrendChart(genderByYear) {
    const c = palette();
    const ctx = document.getElementById("chart-gender-trend");
    if (!ctx) return;

    const maxPct = Math.max(...genderByYear.flatMap((y) => [y.women_pct, y.men_pct]));
    const suggestedMax = Math.ceil((maxPct + 10) / 10) * 10;

    const chart = new Chart(ctx, {
      type: "bar",
      plugins: [groupedBarPctLabels],
      data: {
        labels: genderByYear.map((y) => y.year),
        datasets: [
          {
            label: "Kobiety",
            data: genderByYear.map((y) => y.women_pct),
            backgroundColor: c.series2,
            borderRadius: 3,
            maxBarThickness: 22,
          },
          {
            label: "Mężczyźni",
            data: genderByYear.map((y) => y.men_pct),
            backgroundColor: c.series1,
            borderRadius: 3,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { boxWidth: 14, boxHeight: 14 } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.textMuted } },
          y: {
            grid: commonScaleGrid(c),
            ticks: { color: c.textMuted, callback: (v) => v + "%" },
            beginAtZero: true,
            suggestedMax,
          },
        },
      },
    });
    register(chart);
  }

  // ---------------------------------------------------------------------
  // E. Grupy wiekowe w czasie (ordinal ramp, stacked)
  // ---------------------------------------------------------------------
  function buildAgeGroupsChart(groupsByYear, ageBands) {
    const c = palette();
    const ctx = document.getElementById("chart-age-groups");
    if (!ctx) return;

    const ramp = [c.seq250, c.seq350, c.seq450, c.seq550, c.seq650];
    const maxTotal = Math.max(
      ...groupsByYear.map((y) => ageBands.reduce((sum, band) => sum + (y[band.key] || 0), 0))
    );

    const chart = new Chart(ctx, {
      type: "bar",
      plugins: [stackedSegmentLabels((v) => numberFmt.format(v), { leaderForTopSegment: true })],
      data: {
        labels: groupsByYear.map((y) => y.year),
        datasets: ageBands.map((band, i) => ({
          label: band.label,
          data: groupsByYear.map((y) => y[band.key]),
          backgroundColor: ramp[i % ramp.length],
          stack: "s",
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { boxWidth: 14, boxHeight: 14 } } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: c.textMuted } },
          y: { stacked: true, grid: commonScaleGrid(c), ticks: { color: c.textMuted } },
        },
      },
    });
    // Uzywane przez toggle "Pokaz liczby" - gdy wlaczony, podnosimy y.max
    // ponad najwyzszy slupek, zeby bylo miejsce na kreske + etykiete nad nim.
    chart.$labelHeadroomMax = Math.ceil((maxTotal * 1.12) / 500) * 500;
    register(chart);
  }

  // ---------------------------------------------------------------------
  // E. Grupy wiekowe w czasie - udzial procentowy (100% stacked)
  // ---------------------------------------------------------------------
  function buildAgeGroupsPctChart(groupsByYear, ageBands) {
    const c = palette();
    const ctx = document.getElementById("chart-age-groups-pct");
    if (!ctx) return;

    const ramp = [c.seq250, c.seq350, c.seq450, c.seq550, c.seq650];

    const chart = new Chart(ctx, {
      type: "bar",
      plugins: [stackedSegmentLabels((v) => Math.round(v) + "%", { leaderForTopSegment: true })],
      data: {
        labels: groupsByYear.map((y) => y.year),
        datasets: ageBands.map((band, i) => ({
          label: band.label,
          data: groupsByYear.map((y) => y[band.key + "_pct"]),
          backgroundColor: ramp[i % ramp.length],
          stack: "s",
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 14, boxHeight: 14 } },
          tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${item.formattedValue}%` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: c.textMuted } },
          y: {
            stacked: true,
            grid: commonScaleGrid(c),
            ticks: { color: c.textMuted, callback: (v) => v + "%" },
            min: 0,
            max: 100,
            // Gdy etykiety wlaczone, y.max chwilowo rosnie ponad 100 zeby
            // zrobic miejsce na kreske nad najwyzszym segmentem (patrz
            // initAgeLabelsToggle) - tu wycinamy ticki ponad 100%, zeby os
            // nigdy nie pokazywala nieistniejacego "112%".
            afterBuildTicks: (scale) => {
              scale.ticks = scale.ticks.filter((t) => t.value <= 100);
            },
          },
        },
      },
    });
    register(chart);
  }

  // ---------------------------------------------------------------------
  // E. Rozklad kategorii wiekowych (poziomy bar, wiele kategorii, 1 hue)
  // ---------------------------------------------------------------------
  function buildAgeCategoriesChart(categories) {
    const c = palette();
    const ctx = document.getElementById("chart-age-categories");
    if (!ctx) return;

    const sorted = [...categories].sort((a, b) => a.count - b.count);

    const chart = new Chart(ctx, {
      type: "bar",
      plugins: [barEndValueLabels],
      data: {
        labels: sorted.map((cat) => cat.category),
        datasets: [
          {
            label: "Starty",
            data: sorted.map((cat) => cat.count),
            backgroundColor: c.series1,
            borderRadius: 3,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 40 } },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: commonScaleGrid(c), ticks: { color: c.textMuted }, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: c.textMuted, font: { size: 11 } } },
        },
      },
    });
    register(chart);
  }

  // ---------------------------------------------------------------------
  // Hall of Fame: rozklad czasow (linia/obszar - ksztalt "gorki")
  // ---------------------------------------------------------------------
  function buildTimeDistributionChart(canvasId, histogram, color) {
    const c = palette();
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: histogram.map((b) => b.label),
        datasets: [
          {
            label: "Liczba wyników",
            data: histogram.map((b) => b.count),
            borderColor: color || c.series1,
            backgroundColor: hexToRgba(color || c.series1, 0.18),
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
          x: { grid: { display: false }, ticks: { color: c.textMuted, maxTicksLimit: 12 } },
          y: { grid: commonScaleGrid(c), ticks: { color: c.textMuted }, beginAtZero: true },
        },
      },
    });
    register(chart);
  }

  // ---------------------------------------------------------------------
  // G. Wolontariusze - wykres glowny (bary + srednia 12-edycji + skumulowana)
  // ---------------------------------------------------------------------
  function buildVolunteersChart(timeline) {
    const c = palette();
    const ctx = document.getElementById("chart-volunteers");
    if (!ctx) return;

    const labels = timeline.map((t) => t.date);
    const raw = timeline.map((t) => t.volunteers);
    const rolling12 = timeline.map((t) => t.rolling_avg_12);
    const cumulative = timeline.map((t) => t.cumulative_avg);

    const record = timeline.reduce((max, t) => (t.volunteers > max.volunteers ? t : max), timeline[0]);
    const recordIndex = timeline.indexOf(record);
    const recordXAdjust = edgeAwareXAdjust(recordIndex, timeline.length);

    const covidStartIdx = timeline.findIndex((t) => t.date >= "2020-03-01");
    const covidEndIdx = timeline.findIndex((t) => t.date >= "2021-12-31");

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Wolontariusze (edycja)",
            data: raw,
            backgroundColor: hexToRgba(c.textMuted, 0.28),
            borderRadius: 3,
            barPercentage: 1.0,
            categoryPercentage: 1.0,
            order: 3,
          },
          {
            type: "line",
            label: "Średnia z 12 edycji",
            data: rolling12,
            borderColor: c.series4,
            backgroundColor: hexToRgba(c.series4, 0.12),
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
            fill: false,
            order: 1,
          },
          {
            type: "line",
            label: "Skumulowana średnia od startu",
            data: cumulative,
            borderColor: c.series3,
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            tension: 0.15,
            fill: false,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 14, boxHeight: 2, usePointStyle: false } },
          annotation: {
            annotations: {
              covidBox: covidStartIdx >= 0 && covidEndIdx >= 0 ? {
                type: "box",
                xMin: covidStartIdx,
                xMax: covidEndIdx,
                backgroundColor: hexToRgba(c.textMuted, 0.10),
                borderWidth: 0,
                label: {
                  display: true,
                  content: "Przerwa pandemiczna",
                  position: "start",
                  color: c.textMuted,
                  font: { size: 10, weight: "600" },
                },
              } : undefined,
              recordPoint: {
                type: "point",
                xValue: recordIndex,
                yValue: record.volunteers,
                backgroundColor: c.brandGold,
                radius: 5,
                borderWidth: 2,
                borderColor: c.cardBg,
              },
              recordLabel: {
                type: "label",
                xValue: recordIndex,
                yValue: record.volunteers,
                content: ["Rekord: " + record.volunteers],
                color: c.textPrimary,
                font: { size: 11, weight: "700" },
                yAdjust: -18,
                xAdjust: recordXAdjust,
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 10, color: c.textMuted },
          },
          y: {
            grid: commonScaleGrid(c),
            ticks: { color: c.textMuted },
            beginAtZero: true,
          },
        },
      },
    });
    register(chart);
  }

  // ---------------------------------------------------------------------
  // G. Wolontariusze rok po roku (srednia/edycje + unikalni wolontariusze)
  // ---------------------------------------------------------------------
  function buildVolunteersYearlyChart(yearly) {
    const c = palette();
    const ctx = document.getElementById("chart-volunteers-yearly");
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: yearly.map((y) => y.year),
        datasets: [
          {
            type: "bar",
            label: "Średnia / edycję",
            data: yearly.map((y) => y.avg_volunteers_per_edition),
            backgroundColor: c.series4,
            borderRadius: 4,
            maxBarThickness: 24,
            order: 3,
          },
          {
            type: "bar",
            label: "Średnia / miesiąc",
            data: yearly.map((y) => y.avg_volunteers_per_month),
            backgroundColor: hexToRgba(c.series4, 0.45),
            borderRadius: 4,
            maxBarThickness: 24,
            order: 2,
          },
          {
            type: "line",
            label: "Unikalni wolontariusze w roku",
            data: yearly.map((y) => y.unique_volunteers),
            borderColor: c.series3,
            backgroundColor: c.series3,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: c.series3,
            pointBorderColor: c.cardBg,
            pointBorderWidth: 2,
            tension: 0.15,
            fill: false,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 14, boxHeight: 2 } },
          tooltip: {
            callbacks: {
              afterLabel: (item) => {
                if (item.datasetIndex !== 0) return undefined;
                const y = yearly[item.dataIndex];
                return `Wpisów wolontariackich łącznie: ${numberFmt.format(y.total_volunteer_entries)} · edycji: ${y.editions_count}`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.textMuted } },
          y: { grid: commonScaleGrid(c), ticks: { color: c.textMuted }, beginAtZero: true },
        },
      },
    });
    register(chart);
  }

  // ---------------------------------------------------------------------
  // G. Wolontariusze - wersja miesieczna (bary = suma wpisow w miesiacu)
  // ---------------------------------------------------------------------
  function buildVolunteersMonthlyChart(timeline) {
    const c = palette();
    const ctx = document.getElementById("chart-volunteers-monthly");
    if (!ctx) return;

    const labels = timeline.map((t) => t.month_label);
    const raw = timeline.map((t) => t.total_volunteers);
    const rolling12 = timeline.map((t) => t.rolling_avg_12);
    const cumulative = timeline.map((t) => t.cumulative_avg);

    const record = timeline.reduce((max, t) => (t.total_volunteers > max.total_volunteers ? t : max), timeline[0]);
    const recordIndex = timeline.indexOf(record);
    const recordXAdjust = edgeAwareXAdjust(recordIndex, timeline.length);

    const covidStartIdx = timeline.findIndex((t) => t.date >= "2020-03-01");
    const covidEndIdx = timeline.findIndex((t) => t.date >= "2021-12-31");

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Wolontariusze (miesiąc)",
            data: raw,
            backgroundColor: hexToRgba(c.textMuted, 0.28),
            borderRadius: 3,
            barPercentage: 1.0,
            categoryPercentage: 1.0,
            order: 3,
          },
          {
            type: "line",
            label: "Średnia z 12 miesięcy",
            data: rolling12,
            borderColor: c.series4,
            backgroundColor: hexToRgba(c.series4, 0.12),
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
            fill: false,
            order: 1,
          },
          {
            type: "line",
            label: "Skumulowana średnia od startu",
            data: cumulative,
            borderColor: c.series3,
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            tension: 0.15,
            fill: false,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 14, boxHeight: 2, usePointStyle: false } },
          annotation: {
            annotations: {
              covidBox: covidStartIdx >= 0 && covidEndIdx >= 0 ? {
                type: "box",
                xMin: covidStartIdx,
                xMax: covidEndIdx,
                backgroundColor: hexToRgba(c.textMuted, 0.10),
                borderWidth: 0,
                label: {
                  display: true,
                  content: "Przerwa pandemiczna",
                  position: "start",
                  color: c.textMuted,
                  font: { size: 10, weight: "600" },
                },
              } : undefined,
              recordPoint: {
                type: "point",
                xValue: recordIndex,
                yValue: record.total_volunteers,
                backgroundColor: c.brandGold,
                radius: 5,
                borderWidth: 2,
                borderColor: c.cardBg,
              },
              recordLabel: {
                type: "label",
                xValue: recordIndex,
                yValue: record.total_volunteers,
                content: ["Rekord: " + record.total_volunteers],
                color: c.textPrimary,
                font: { size: 11, weight: "700" },
                yAdjust: -18,
                xAdjust: recordXAdjust,
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 10, color: c.textMuted },
          },
          y: {
            grid: commonScaleGrid(c),
            ticks: { color: c.textMuted },
            beginAtZero: true,
          },
        },
      },
    });
    register(chart);
  }

  window.ParkrunCharts = {
    buildAll(data) {
      destroyAll();
      applyGlobalDefaults();
      buildAttendanceChart(data.attendance_timeline);
      buildMonthlyAttendanceChart(data.monthly_timeline);
      buildYearlyChart(data.yearly_summary);
      buildYearlyTotalChart(data.yearly_summary);
      buildGenderStackedBar(data.gender_split.overall);
      buildGenderTrendChart(data.gender_split.by_year);
      buildAgeGroupsChart(data.age_categories.groups_by_year, data.age_categories.age_bands);
      buildAgeGroupsPctChart(data.age_categories.groups_by_year, data.age_categories.age_bands);
      buildAgeCategoriesChart(data.age_categories.categories);
      buildTimeDistributionChart("chart-time-distribution-all", data.time_distribution.all, palette().series3);
      buildTimeDistributionChart("chart-time-distribution-women", data.time_distribution.women, palette().series2);
      buildTimeDistributionChart("chart-time-distribution-men", data.time_distribution.men, palette().series1);
      buildVolunteersChart(data.volunteers_timeline);
      buildVolunteersMonthlyChart(data.volunteers_monthly_timeline);
      buildVolunteersYearlyChart(data.volunteers_yearly);
    },
  };

  initAgeLabelsToggle();
})(window);
