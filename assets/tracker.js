/* ==== helpers ====================================================== */
// points calculator
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

// original palette for table cells (0/2/3/5)
const huePts = { 0: 0, 2: 25, 3: 55, 5: 130 };
const colPts = n => `hsl(${huePts[n] ?? 0} 75% 55%)`;

/* ==== main ========================================================= */
(async () => {
  // Load and parse CSV
  const resp = await fetch('data.csv?nocache=' + Date.now());
  const csv = await resp.text();
  const { data } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const friends = Object.keys(data[0]).slice(4);
  if (!friends.length) return;

  // Compute match labels and points
  data.forEach(r => {
    r.match = `${r.local} vs ${r.visitor}`.slice(0, 24);
    friends.forEach(f => r[`${f}_pts`] = pts(r[f], r.score));
  });

  // Calculate cumulative totals per date
  const dates = [...new Set(data.map(r => r.date))].sort();
  const totals = Object.fromEntries(friends.map(f => [f, Array(dates.length).fill(0)]));
  dates.forEach((d, i) => friends.forEach(f => {
    const sumPts = data.filter(r => r.date === d).reduce((sum, r) => sum + r[`${f}_pts`], 0);
    totals[f][i] = (totals[f][i - 1] || 0) + sumPts;
  }));
  const last = friends.map(f => totals[f].at(-1));

  // Insert standings summary table
  const tablePane = document.getElementById('tablePane');
  const summaryTable = document.createElement('table');
  summaryTable.id = 'standings-summary';
  const standings = friends.map((f, i) => ({ name: f, points: last[i] }))
    .sort((a, b) => b.points - a.points);
  summaryTable.innerHTML = `
    <thead>
      <tr><th>Pos</th><th>Jugador</th><th>Puntos</th></tr>
    </thead>
    <tbody>
      ${standings.map((s, idx) => `<tr><td>${idx+1}</td><td>${s.name}</td><td>${s.points}</td></tr>`).join('')}
    </tbody>`;
  tablePane.insertBefore(summaryTable, tablePane.firstChild);

  // Generate categorical palette for chart
  const palette = friends.map((_, i) => `hsl(${Math.round(i * 360 / friends.length)} 70% 50%)`);

  /* ==== chart (wheel/pinch zoom) =================================== */
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
        backgroundColor: palette[i].replace(/hsl\(([^)]+)\)/, 'hsla($1,0.2)'),
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
        zoom: {
          pan: { enabled: true, mode: 'x' },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Match date' } },
        y: { beginAtZero: true, title: { display: true, text: 'Total points' } }
      }
    }
  });



  // Reset zoom button
  document.getElementById('resetZoom').onclick = () => chart.resetZoom();

  /* ==== legend ===================================================== */
  document.getElementById('pts-legend').innerHTML =
    [0,2,3,5].map(n => `<span class="legend-box" style="background:${colPts(n)}"></span>${n}`).join(' ');

  /* ==== DataTable ================================================== */
  const tableData = data.map(r => {
    const row = { date: r.date, match: r.match, actual: r.score };
    friends.forEach(f => { row[f] = r[f] || ''; row[`${f}_pts`] = r[`${f}_pts`]; });
    return row;
  });
  const columns = [
    { title: 'Date', data: 'date' },
    { title: 'Match', data: 'match', className: 'match-cell' },
    { title: 'Score', data: 'actual' },
    ...friends.map(f => ({ title: f, data: f, createdCell: (td, _, row) => { td.style.background = colPts(row[`${f}_pts`]); } }))
  ];
  new DataTable('#leaderboard', { data: tableData, columns, order: [[0,'desc']], paging: false, scrollY: '60vh', scrollX: true, scrollCollapse: true });

  /* ==== splitter =================================================== */
  const drag = document.getElementById('dragBar');
  const chartPane = document.getElementById('chartPane');
  let sX, sLeft;
  drag.addEventListener('mousedown', e => {
    sX = e.clientX;
    sLeft = chartPane.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
    const move = e2 => chartPane.style.flexBasis = `${sLeft + (e2.clientX - sX)}px`;
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.userSelect = 'auto'; };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
})();
