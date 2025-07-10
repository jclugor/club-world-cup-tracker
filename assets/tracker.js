/* =========================================================
   1.  Helpers
========================================================= */
// points calculator for a single prediction
const pts = (p, a) => {
  if (!p) return 0;
  const [ph, pa] = p.split('-').map(Number);
  const [ah, aa] = a.split('-').map(Number);
  const d = ph - pa, D = ah - aa;
  if (ph === ah && pa === aa) return 5;
  if (d === D) return 3;
  if (Math.sign(d) === Math.sign(D)) return 2;
  return 0;
};

// colour palette for individual prediction cells (0 / 2 / 3 / 5)
const huePts = { 0: 0, 2: 25, 3: 55, 5: 130 };
const colPts = n => `hsl(${huePts[n] ?? 0} 75% 55%)`;

/* =========================================================
   2.  Main
========================================================= */
(async () => {
  /* ---------- load CSV ---------- */
  const csv = await (await fetch('data.csv?nocache=' + Date.now())).text();
  const { data } = Papa.parse(csv, { header: true, skipEmptyLines: true });

  const friends = Object.keys(data[0]).slice(4);
  if (!friends.length) return;

  /* ---------- extract Bonus row (if any) ---------- */
  const bonusRowIdx = data.findIndex(r => r.date.trim().toLowerCase() === 'bonus');
  const bonus = Object.fromEntries(friends.map(f => [f, 0]));   // default 0

  if (bonusRowIdx !== -1) {
    const br = data[bonusRowIdx];
    friends.forEach(f => bonus[f] = Number(br[f] || 0));
    data.splice(bonusRowIdx, 1);        // remove bonus row from match list
  }

  /* ---------- per-match scoring ---------- */
  data.forEach(r => {
    r.match = `${r.local} vs ${r.visitor}`.slice(0, 24);   // abbreviate
    friends.forEach(f => r[`${f}_pts`] = pts(r[f], r.score));
  });

  /* ---- cumulative totals (start at 0) ---- */
  const totals = Object.fromEntries(
    friends.map(f => [f, Array(dates.length).fill(0)])
  );

  dates.forEach((d, i) => friends.forEach(f => {
    const todayPts = data
      .filter(r => r.date === d)
      .reduce((s, r) => s + r[`${f}_pts`], 0);
    totals[f][i] = (i ? totals[f][i - 1] : 0) + todayPts;
  }));

  // add bonus exactly once
  friends.forEach(f => {
    totals[f] = totals[f].map(v => v + bonus[f]);
  });


  const lastTotals = friends.map(f => totals[f].at(-1));
  const minPts = Math.min(...lastTotals);
  const maxPts = Math.max(...lastTotals);

  /* ---------- categorical palette for lines ---------- */
  const palette = friends.map((_, i) => `hsl(${Math.round(i * 360 / friends.length)} 70% 50%)`);

  /* ===================================================
       3.  Chart.js  (drag-pan + wheel/pinch zoom)
  =================================================== */
  Chart.register(ChartZoom);
  const ctx = document.getElementById('cumulative');

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: friends.map((f, i) => ({
        label: f,
        data: totals[f],
        borderColor: palette[i],
        backgroundColor: palette[i].replace(/hsl\(/, 'hsla(').replace(')', ',0.2)'),
        pointBackgroundColor: palette[i],
        tension: 0.25,
        pointRadius: 4,
        pointHoverRadius: 6
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y} pts` } },
        zoom: {
          pan:  { enabled: true, mode: 'x' },
          zoom: { wheel: { enabled:true }, pinch:{ enabled:true }, mode:'x' }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Match date' } },
        y: { beginAtZero: true, title: { display: true, text: 'Total points' } }
      }
    }
  });

  /* ---------- Reset zoom ---------- */
  document.getElementById('resetZoom').onclick = () => chart.resetZoom();

  /* ---------- legend (0 / 2 / 3 / 5) ---------- */
  document.getElementById('pts-legend').innerHTML =
    [0,2,3,5].map(n => `<span class="legend-box" style="background:${colPts(n)}"></span>${n}`)
             .join(' ');

  /* ===================================================
       4.  Standings summary  (includes bonus)
  =================================================== */
  const standings = friends
    .map((f, i) => ({ name: f, points: lastTotals[i] }))
    .sort((a, b) => b.points - a.points);

  const summaryHTML = `
    <table id="standings-summary">
      <thead><tr><th>Pos</th><th>Jugador</th><th>Puntos</th></tr></thead>
      <tbody>
        ${standings.map((s,i)=>`<tr><td>${i+1}</td><td>${s.name}</td><td>${s.points}</td></tr>`).join('')}
      </tbody>
    </table>`;
  document.getElementById('tablePane').insertAdjacentHTML('afterbegin', summaryHTML);

  /* ===================================================
       5.  Per-match DataTable (bonus row skipped)
  =================================================== */
  const tableData = data.map(r => {
    const row={date:r.date,match:r.match,actual:r.score};
    friends.forEach(f=>{row[f]=r[f]||'';row[`${f}_pts`]=r[`${f}_pts`]});
    return row;
  });

  const columns = [
    { title:'Date',  data:'date' },
    { title:'Match', data:'match', className:'match-cell' },
    { title:'Score', data:'actual' },
    ...friends.map(f=>({
      title:f,
      data:f,
      createdCell:(td,_,row)=>{td.style.background=colPts(row[`${f}_pts`]);}
    }))
  ];

  new DataTable('#leaderboard',{
    data:tableData,
    columns,
    order:[[0,'desc']],
    paging:false,
    scrollY:'60vh',
    scrollX:true,
    scrollCollapse:true
  });

  /* ===================================================
       6.  Draggable splitter
  =================================================== */
  const drag = document.getElementById('dragBar');
  const chartPane = document.getElementById('chartPane');
  let startX, startW;
  drag.addEventListener('mousedown', e => {
    startX = e.clientX;
    startW = chartPane.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
    const move = e2 => chartPane.style.flexBasis = `${startW + (e2.clientX - startX)}px`;
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.userSelect = 'auto'; };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
})();
