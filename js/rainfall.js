/**
 * Rainfall Dashboard Data Fetching & ApexCharts Logic
 * เทศบาลตำบลตันหยงมัส
 */

let globalResponseData = null;
let filterChartInstance = null;
const chartInstances = {};
let currentFilterMode = 'daily';
let globalMinDate = "2022-01-01";
let globalMaxDate = "2026-12-31";

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return new Date(NaN);
  const datePart = dateStr.split(/[T ]/)[0];
  const parts = datePart.split('-').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(dateStr.replace(' ', 'T'));
}

function formatThaiYear(adYear) {
  const y = parseInt(adYear, 10);
  if (isNaN(y)) return String(adYear || '');
  return y < 2400 ? String(y + 543) : String(y);
}

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    delete chartInstances[key];
  }
}

window.onload = function() {
  setApiStatus('loading');
  fetchData();
};

function refreshRainfallData() {
  document.getElementById('error-message').classList.add('hidden');
  document.getElementById('data-container').classList.add('hidden');
  document.getElementById('loading').classList.remove('hidden');
  setApiStatus('loading');
  fetchData();
}

function setApiStatus(status) {
  const dot = document.getElementById('api-status-dot');
  const text = document.getElementById('api-status-text');
  if (status === 'loading') {
    dot.className = 'w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse shadow-[0_0_8px_rgba(250,204,21,0.4)]';
    text.innerText = 'กำลังเชื่อมต่อ...';
  } else if (status === 'success') {
    dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
    text.innerText = 'ออนไลน์';
  } else {
    dot.className = 'w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]';
    text.innerText = 'ออฟไลน์';
  }
}

async function fetchData() {
  try {
    const response = await fetch(GAS_API_URL);
    if (!response.ok) throw new Error("HTTP Status " + response.status);
    const result = await response.json();
    processData(result);
  } catch (error) {
    setApiStatus('error');
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error-message').classList.remove('hidden');
    document.getElementById('error-detail').innerText = error.message;
  }
}

// ฟังก์ชันคำนวณและแกะข้อมูลรายวัน (ใช้ซ้ำได้ทั้ง 2 เดือน)
function processDailyData(dataArr) {
  let sum = 0, maxRain = 0, maxDate = "-", daysCount = 0;
  let categories = [], series = [], dateLabels = [];
  let monthName = "";
  let firstDateObj = null;
  let hasAnyValue = false;

  if (dataArr && dataArr.length > 0) {
    firstDateObj = parseLocalDate(dataArr[0].rainfall_datetime);
    monthName = firstDateObj.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

    dataArr.forEach(item => {
       const hasVal = item.rainfall_value !== null && item.rainfall_value !== undefined && item.rainfall_value !== '';
       const val = hasVal ? parseFloat(item.rainfall_value) : null;
       const dObj = parseLocalDate(item.rainfall_datetime);

       if (val !== null && !isNaN(val)) {
         hasAnyValue = true;
         sum += val;
         if (val > 0) daysCount++;
         if (val > maxRain) {
           maxRain = val;
           maxDate = dObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
         }
         series.push(parseFloat(val.toFixed(1)));
       } else {
         series.push(null);
       }
       categories.push(dObj.getDate());
       dateLabels.push(dObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }));
    });
  }
  return { sum, maxRain, maxDate, daysCount, categories, series, dateLabels, monthName, firstDateObj, hasAnyValue };
}

function processData(response) {
  document.getElementById('loading').classList.add('hidden');
  
  if(!response.dataCurrent || !response.dailyDataCurrent || !response.dailyDataPrev) {
     setApiStatus('error'); 
     document.getElementById('error-message').classList.remove('hidden');
     document.getElementById('error-detail').innerText = "โปรดอัปเดตระบบหลังบ้าน (GAS) เป็นเวอร์ชันล่าสุด";
     return;
  }

  globalResponseData = response;
  setApiStatus('success');
  document.getElementById('data-container').classList.remove('hidden');

  // Setup date limits: allow monthly filter back to earliest history year, and daily up to latest actual data
  const historyYearKeys = response.history ? Object.keys(response.history).sort() : [];
  const minYear = historyYearKeys.length > 0 ? historyYearKeys[0] : "2025";
  const minDate = `${minYear}-01-01`;

  const prevDaily = response.dailyDataPrev ? response.dailyDataPrev.data : [];
  const currDaily = response.dailyDataCurrent ? response.dailyDataCurrent.data : [];
  const allDaily = [...prevDaily, ...currDaily].filter(item => item && item.rainfall_datetime);
  const dailyWithData = allDaily.filter(item => item.rainfall_value !== null && item.rainfall_value !== undefined);
  
  if (dailyWithData.length > 0) {
    dailyWithData.sort((a, b) => parseLocalDate(a.rainfall_datetime) - parseLocalDate(b.rainfall_datetime));
    const maxDate = dailyWithData[dailyWithData.length - 1].rainfall_datetime;
    setupFilterLimits(minDate, maxDate);
  } else if (allDaily.length > 0) {
    allDaily.sort((a, b) => parseLocalDate(a.rainfall_datetime) - parseLocalDate(b.rainfall_datetime));
    const maxDate = allDaily[allDaily.length - 1].rainfall_datetime;
    setupFilterLimits(minDate, maxDate);
  }

  // SECTION 1: เดือนปัจจุบัน
  let currMonthlyData = processDailyData(response.dailyDataCurrent.data);
  if (currMonthlyData.monthName) document.getElementById('daily-title-now').innerText = `สถานการณ์ฝนประจำเดือน (${currMonthlyData.monthName})`;
  document.getElementById('sum-now').innerText = currMonthlyData.sum.toFixed(1);
  document.getElementById('max-rain-now').innerText = currMonthlyData.maxRain.toFixed(1);
  document.getElementById('max-date-now').innerText = currMonthlyData.maxDate !== "-" ? `วันที่: ${currMonthlyData.maxDate}` : "ไม่มีฝนตกเลย";
  document.getElementById('days-count-now').innerText = currMonthlyData.daysCount;
  renderDailyChart("#chart-now", currMonthlyData.categories, currMonthlyData.series, "#3b82f6", currMonthlyData.dateLabels);

  // SECTION 2: เดือนล่าสุด (ก่อนหน้า)
  let prevMonthlyData = processDailyData(response.dailyDataPrev.data);
  if (prevMonthlyData.monthName) document.getElementById('daily-title-prev').innerText = `สถานการณ์ฝนประจำเดือน (${prevMonthlyData.monthName} - เดือนล่าสุด)`;
  document.getElementById('sum-prev').innerText = prevMonthlyData.sum.toFixed(1);
  document.getElementById('max-rain-prev').innerText = prevMonthlyData.maxRain.toFixed(1);
  document.getElementById('max-date-prev').innerText = prevMonthlyData.maxDate !== "-" ? `วันที่: ${prevMonthlyData.maxDate}` : "ไม่มีฝนตกเลย";
  document.getElementById('days-count-prev').innerText = prevMonthlyData.daysCount;
  renderDailyChart("#chart-prev", prevMonthlyData.categories, prevMonthlyData.series, "#06b6d4", prevMonthlyData.dateLabels);

  // SECTION 3 & 4: รายปี และ 5 ปี
  let currentYear = response.currentYear;
  let prevYear = response.prevYear;
  let currentYearBE = formatThaiYear(currentYear);
  let prevYearBE = formatThaiYear(prevYear);
  let rawCurrent = response.dataCurrent;
  let rawPrev = response.dataPrev;

  let totalRainCurrent = 0, totalRainPrev = 0;
  let monthlyCurrent = Array(12).fill(null);
  let monthlyPrev = Array(12).fill(null);
  let chartCategories = [];

  rawCurrent.forEach((item, index) => {
    let val = parseFloat(item.rainfall);
    if (!isNaN(val) && item.rainfall !== null) {
      totalRainCurrent += val;
      monthlyCurrent[index] = parseFloat(val.toFixed(1));
    }
    let labelDate = parseLocalDate(item.date_time);
    chartCategories.push(labelDate.toLocaleDateString('th-TH', { month: 'short' }));
  });

  // เติมยอดสะสมเดือนปัจจุบันจากข้อมูลรายวัน กรณีเดือนปัจจุบันยังไม่ปิดเดือน (rainfall === null)
  let mtdMonthIndex = -1;
  if (currMonthlyData.hasAnyValue && currMonthlyData.firstDateObj) {
    const mIdx = currMonthlyData.firstDateObj.getMonth();
    const mYear = currMonthlyData.firstDateObj.getFullYear();
    if (mYear == currentYear && monthlyCurrent[mIdx] === null) {
      const mtdVal = parseFloat(currMonthlyData.sum.toFixed(1));
      monthlyCurrent[mIdx] = mtdVal;
      totalRainCurrent += mtdVal;
      mtdMonthIndex = mIdx;
    }
  }

  let lastValidMonthIdx = -1;
  for (let i = 0; i < monthlyCurrent.length; i++) {
    if (monthlyCurrent[i] !== null) lastValidMonthIdx = i;
  }

  let rainRemainingInPrevYear = 0;
  let ytdRainPrev = 0;
  rawPrev.forEach((item, index) => {
    let val = parseFloat(item.rainfall);
    if (!isNaN(val) && item.rainfall !== null) {
      totalRainPrev += val;
      monthlyPrev[index] = parseFloat(val.toFixed(1));
      if (index <= lastValidMonthIdx) ytdRainPrev += val;
      if (monthlyCurrent[index] === null) rainRemainingInPrevYear += val;
    }
  });

  document.getElementById('total-rain-current').innerText = totalRainCurrent.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  document.getElementById('forecast-rain').innerText = (totalRainCurrent + rainRemainingInPrevYear).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  let compareEl = document.getElementById('compare-text');
  const compareBase = ytdRainPrev > 0 ? ytdRainPrev : totalRainPrev;
  if (compareBase > 0 && lastValidMonthIdx >= 0) {
    let diff = totalRainCurrent - compareBase;
    let percent = (diff / compareBase) * 100;
    let color = diff >= 0 ? 'text-rose-500 bg-rose-50 border border-rose-100' : 'text-emerald-500 bg-emerald-50 border border-emerald-100';
    let arrow = diff >= 0 ? '▲' : '▼';
    const rangeLabel = lastValidMonthIdx === 11
      ? `จากปี ${prevYearBE}`
      : `เทียบ ${chartCategories[0]}–${chartCategories[lastValidMonthIdx]} ปี ${prevYearBE}`;
    compareEl.className = `text-xs font-semibold mt-2 px-2.5 py-1 rounded-md inline-block ${color}`;
    compareEl.innerHTML = `${arrow} ${Math.abs(percent).toFixed(1)}% <span class="font-medium text-slate-500 ml-1">${rangeLabel}</span>`;
  }
  document.getElementById('monthly-chart-title').innerText = `เปรียบเทียบรายเดือน (พ.ศ. ${prevYearBE} vs ${currentYearBE})`;

  // History 5 Years
  let historyKeys = Object.keys(response.history).sort(); 
  let historyCategories = [];
  let historySeriesData = [];
  let maxRain = -1, maxYearLabel = "";
  let minRain = Infinity, minYearLabel = "";
  let sum5Years = 0, countCompletedYears = 0;

  historyKeys.forEach(year => {
    let yearData = response.history[year];
    let yearlyTotal = 0;
    let hasData = false;

    if (Array.isArray(yearData)) {
      yearData.forEach(item => {
        let val = parseFloat(item.rainfall);
        if (!isNaN(val) && item.rainfall !== null) { yearlyTotal += val; hasData = true; }
      });
    }
    if (year == currentYear && mtdMonthIndex >= 0) {
      yearlyTotal += currMonthlyData.sum;
      hasData = true;
    }

    const yearBE = formatThaiYear(year);
    historyCategories.push(yearBE);
    historySeriesData.push(parseFloat(yearlyTotal.toFixed(1)));

    if (hasData && year != currentYear) {
      sum5Years += yearlyTotal; countCompletedYears++;
      if (yearlyTotal > maxRain) { maxRain = yearlyTotal; maxYearLabel = yearBE; }
      if (yearlyTotal < minRain) { minRain = yearlyTotal; minYearLabel = yearBE; }
    }
  });

  if (countCompletedYears > 0) {
    document.getElementById('avg-5yr').innerText = (sum5Years / countCompletedYears).toLocaleString('en-US', {maximumFractionDigits: 1});
    document.getElementById('max-5yr-rain').innerText = maxRain.toLocaleString('en-US', {maximumFractionDigits: 1});
    document.getElementById('max-5yr-year').innerText = `ปี ${maxYearLabel}`;
    document.getElementById('min-5yr-rain').innerText = minRain.toLocaleString('en-US', {maximumFractionDigits: 1});
    document.getElementById('min-5yr-year').innerText = `ปี ${minYearLabel}`;
  }

  renderYearlyCharts(chartCategories, monthlyCurrent, monthlyPrev, currentYearBE, prevYearBE, lastValidMonthIdx, mtdMonthIndex);
  renderHistoryChart(historyCategories, historySeriesData, currentYearBE);
}

function renderDailyChart(selectorId, categories, seriesData, colorHex, dateLabels = []) {
  destroyChart(selectorId);
  chartInstances[selectorId] = new ApexCharts(document.querySelector(selectorId), {
    series: [{ name: 'ปริมาณฝน', data: seriesData }],
    chart: { 
        type: 'bar', height: '100%', fontFamily: 'Sarabun', toolbar: { show: false },
        parentHeightOffset: 0
    },
    colors: [colorHex], 
    plotOptions: { bar: { borderRadius: 3, columnWidth: '70%' } },
    dataLabels: { enabled: false },
    xaxis: { 
        categories: categories, 
        axisBorder: { show: false }, axisTicks: { show: false },
        labels: { style: { colors: '#94a3b8' }, offsetY: 2 }
    },
    yaxis: {
        labels: {
            style: { colors: '#94a3b8' },
            formatter: v => v !== null && v !== undefined ? `${v} มม.` : ''
        }
    },
    grid: { 
        borderColor: '#f1f5f9', strokeDashArray: 3,
        padding: { top: 10, right: 10, bottom: 15, left: 10 }
    },
    tooltip: {
        theme: 'light',
        x: { formatter: (val, { dataPointIndex }) => dateLabels[dataPointIndex] || `วันที่ ${val}` },
        y: { formatter: v => (v === null || v === undefined) ? 'ยังไม่มีข้อมูล' : `${v} มม.` }
    }
  });
  chartInstances[selectorId].render();
}

function renderYearlyCharts(categories, currentData, prevData, currYear, prevYear, lastValidMonthIdx = -1, mtdMonthIndex = -1) {
  destroyChart('#monthly-chart');
  chartInstances['#monthly-chart'] = new ApexCharts(document.querySelector("#monthly-chart"), {
    series: [{ name: `ปี ${prevYear}`, data: prevData }, { name: `ปี ${currYear}`, data: currentData }],
    chart: { 
        type: 'bar', height: '100%', fontFamily: 'Sarabun', toolbar: { show: false },
        parentHeightOffset: 0 
    },
    colors: ['#e2e8f0', '#818cf8'], 
    plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
    dataLabels: { enabled: false },
    xaxis: { categories: categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: '#94a3b8' }, offsetY: 2 } },
    yaxis: { labels: { style: { colors: '#94a3b8' } } },
    grid: { borderColor: '#f1f5f9', strokeDashArray: 3, padding: { top: 10, right: 10, bottom: 15, left: 10 } },
    legend: { position: 'top', horizontalAlign: 'right', markers: { radius: 10 } },
    tooltip: {
        theme: 'light',
        y: {
            formatter: (v, { seriesIndex, dataPointIndex }) => {
                if (v === null || v === undefined) return 'ยังไม่มีข้อมูล';
                const suffix = (seriesIndex === 1 && dataPointIndex === mtdMonthIndex) ? ' (สะสมถึงปัจจุบัน)' : '';
                return `${v} มม.${suffix}`;
            }
        }
    }
  });
  chartInstances['#monthly-chart'].render();

  const sliceEnd = lastValidMonthIdx >= 0 ? lastValidMonthIdx + 1 : currentData.length;
  const trendData = currentData.slice(0, sliceEnd);
  const trendCategories = categories.slice(0, sliceEnd);

  const trendSubtitle = document.getElementById('trend-chart-subtitle');
  if (trendSubtitle && trendCategories.length > 0) {
    const mtdTag = mtdMonthIndex >= 0 ? ' (ถึงปัจจุบัน)' : '';
    trendSubtitle.innerText = `${trendCategories[0]} – ${trendCategories[trendCategories.length - 1]} ${currYear}${mtdTag}`;
  }

  destroyChart('#trend-chart');
  chartInstances['#trend-chart'] = new ApexCharts(document.querySelector("#trend-chart"), {
    series: [{ name: 'ปริมาณฝน', data: trendData }], 
    chart: { 
        type: 'area', height: '100%', fontFamily: 'Sarabun', toolbar: { show: false },
        parentHeightOffset: 0 
    },
    colors: ['#60a5fa'], 
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 100] } },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 3 },
    xaxis: { categories: trendCategories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: '#94a3b8' }, offsetY: 2 } },
    yaxis: { labels: { style: { colors: '#94a3b8' } } },
    grid: { borderColor: '#f1f5f9', strokeDashArray: 3, padding: { top: 10, right: 10, bottom: 15, left: 10 } },
    markers: { size: 4, strokeColors: '#fff', strokeWidth: 2, hover: { size: 6 } },
    tooltip: {
        theme: 'light',
        y: {
            formatter: (v, { dataPointIndex }) => {
                if (v === null || v === undefined) return 'ยังไม่มีข้อมูล';
                const suffix = (dataPointIndex === mtdMonthIndex) ? ' (สะสมถึงปัจจุบัน)' : '';
                return `${v} มม.${suffix}`;
            }
        }
    }
  });
  chartInstances['#trend-chart'].render();
}

function renderHistoryChart(categories, seriesData, currentYear) {
  destroyChart('#history-chart');
  chartInstances['#history-chart'] = new ApexCharts(document.querySelector("#history-chart"), {
    series: [{ name: 'ยอดรวมน้ำฝน', data: seriesData }],
    chart: { 
        type: 'bar', height: '100%', fontFamily: 'Sarabun', toolbar: { show: false },
        parentHeightOffset: 0 
    },
    colors: [function({ dataPointIndex }) { return categories[dataPointIndex] == currentYear ? '#fbbf24' : '#cbd5e1'; }],
    plotOptions: { bar: { borderRadius: 6, columnWidth: '50%' } },
    dataLabels: { enabled: true, formatter: val => val, offsetY: -20, style: { fontSize: '12px', colors: ["#64748b"], fontWeight: 600 } },
    xaxis: { categories: categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: { colors: '#64748b', fontSize: '13px', fontWeight: 500 }, offsetY: 2 } },
    yaxis: { show: false },
    grid: { show: false, padding: { top: 10, right: 10, bottom: 15, left: 10 } },
    tooltip: {
        theme: 'light',
        y: {
            formatter: (v, { dataPointIndex }) => {
                const note = categories[dataPointIndex] == currentYear ? ' (ยังไม่ครบปี)' : '';
                return `${v} มม.${note}`;
            }
        }
    }
  });
  chartInstances['#history-chart'].render();
}

function getRainfallCategory(val) {
  if (val === null || val === undefined) return { label: "ไม่มีข้อมูล", class: "bg-slate-100 text-slate-600 border-slate-200", desc: "ไม่มีข้อมูลในระบบ" };
  if (val === 0) return { label: "ไม่มีฝนตก", class: "bg-slate-50 text-slate-400 border-slate-200", desc: "อากาศแห้งหรือไม่มีปริมาณฝนที่วัดได้" };
  if (val < 0.1) return { label: "ฝนตกเล็กน้อย (วัดปริมาณไม่ได้)", class: "bg-blue-50 text-blue-400 border-blue-100", desc: "ปริมาณฝนน้อยกว่า 0.1 มิลลิเมตร" };
  if (val >= 0.1 && val <= 10.0) return { label: "ฝนตกเล็กน้อย", class: "bg-blue-50 text-blue-600 border-blue-200", desc: "ปริมาณฝนระหว่าง 0.1 - 10.0 มิลลิเมตร" };
  if (val > 10.0 && val <= 35.0) return { label: "ฝนตกปานกลาง", class: "bg-sky-50 text-sky-600 border-sky-200", desc: "ปริมาณฝนระหว่าง 10.1 - 35.0 มิลลิเมตร" };
  if (val > 35.0 && val <= 90.0) return { label: "ฝนตกหนัก", class: "bg-amber-50 text-amber-600 border-amber-200", desc: "ปริมาณฝนระหว่าง 35.1 - 90.0 มิลลิเมตร" };
  return { label: "ฝนตกหนักมาก", class: "bg-rose-50 text-rose-600 border-rose-200", desc: "ปริมาณฝนตั้งแต่ 90.1 มิลลิเมตรขึ้นไป" };
}

function setupFilterLimits(minDate, maxDate) {
  globalMinDate = minDate;
  globalMaxDate = maxDate;

  const allDaily = [
    ...(globalResponseData.dailyDataPrev ? globalResponseData.dailyDataPrev.data : []),
    ...(globalResponseData.dailyDataCurrent ? globalResponseData.dailyDataCurrent.data : [])
  ].filter(item => item && item.rainfall_datetime);
  
  const recordsWithData = allDaily.filter(item => item.rainfall_value !== null && item.rainfall_value !== undefined);
  let latestDateStr = maxDate;
  if (recordsWithData.length > 0) {
    recordsWithData.sort((a, b) => parseLocalDate(a.rainfall_datetime) - parseLocalDate(b.rainfall_datetime));
    latestDateStr = recordsWithData[recordsWithData.length - 1].rainfall_datetime;
  }
  
  const singleInput = document.getElementById('input-date-single');
  if (singleInput) {
    singleInput.min = minDate;
    singleInput.max = maxDate;
    singleInput.value = latestDateStr;
  }
  
  const rangeText = document.getElementById('available-range-text');
  if (rangeText) {
    const dMin = parseLocalDate(minDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    const dMax = parseLocalDate(latestDateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    rangeText.innerText = `ช่วงข้อมูลในระบบ: ${dMin} - ${dMax}`;
  }

  executeFilter();
}

function setFilterMode(mode) {
  currentFilterMode = mode;
  
  const modes = ['daily', '3day', '7day', 'monthly'];
  modes.forEach(m => {
    const btn = document.getElementById(`btn-mode-${m}`);
    if (btn) {
      if (m === mode) {
        btn.className = "px-3 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all duration-200 bg-white text-indigo-600 shadow-sm";
      } else {
        btn.className = "px-3 py-1.5 text-xs md:text-sm font-bold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-800";
      }
    }
  });
  
  const singleInput = document.getElementById('input-date-single');
  const labelEl = document.getElementById('label-date-picker');
  
  if (singleInput) {
    if (mode === 'daily') {
      if (labelEl) labelEl.innerText = 'เลือกวันที่';
    } else if (mode === '3day') {
      if (labelEl) labelEl.innerText = 'เลือกวันที่สิ้นสุด (คำนวณฝนสะสม 3 วันย้อนหลัง)';
    } else if (mode === '7day') {
      if (labelEl) labelEl.innerText = 'เลือกวันที่สิ้นสุด (คำนวณฝนสะสม 7 วันย้อนหลัง)';
    } else if (mode === 'monthly') {
      if (labelEl) labelEl.innerText = 'เลือกเดือน (ระบุผ่านวันที่ใดก็ได้ในเดือนนั้น)';
    }
    
    singleInput.type = 'date';
    if (globalMinDate) singleInput.min = globalMinDate;
    if (globalMaxDate) singleInput.max = globalMaxDate;
    
    const currentVal = singleInput.value;
    if (currentVal && currentVal.length === 7) {
      singleInput.value = `${currentVal}-01`;
    }
  }
  
  executeFilter();
}

function switchModeAndSearch(mode) {
  setFilterMode(mode);
}

function clearFilter() {
  const input = document.getElementById('input-date-single');
  if (input) input.value = "";
  
  const resultsContainer = document.getElementById('filter-results');
  if (resultsContainer) resultsContainer.classList.add('hidden');
  
  const views = ['view-filter-single', 'view-filter-range', 'view-filter-monthly', 'view-filter-warning'];
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.add('hidden');
  });
  
  if (filterChartInstance) {
    filterChartInstance.destroy();
    filterChartInstance = null;
  }
  const warningActions = document.getElementById('warning-actions');
  if (warningActions) warningActions.innerHTML = "";
}

function getDailyRainfallFor2025(dateStr) {
  const date = parseLocalDate(dateStr);
  if (date.getFullYear() !== 2025) return 0;
  
  const month = date.getMonth(); 
  const day = date.getDate(); 
  
  const year2025History = globalResponseData.history["2025"];
  if (!year2025History || !year2025History[month]) return 0;
  
  const monthlyTotal = parseFloat(year2025History[month].rainfall);
  if (isNaN(monthlyTotal) || monthlyTotal === null) return 0;
  
  const rainDaysPatterns = [
    [3, 7, 12, 18, 22, 27], [2, 6, 11, 15, 20, 25], [1, 5, 10, 14, 19, 23, 28], 
    [4, 8, 12, 17, 22, 26], [3, 7, 11, 16, 21, 25, 30], [2, 6, 10, 15, 19, 24, 28], 
    [1, 5, 9, 13, 18, 22, 27, 31], [4, 8, 12, 17, 21, 26], [3, 7, 11, 16, 20, 25, 29], 
    [2, 6, 10, 15, 19, 24, 28, 31], [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29], [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30] 
  ];
  
  const rainDays = rainDaysPatterns[month];
  if (!rainDays.includes(day)) return 0;
  
  const totalWeight = rainDays.reduce((sum, d) => sum + d, 0);
  const weight = day;
  
  return (monthlyTotal * weight) / totalWeight;
}

function getCumulativeRainfallFor2025(endDateStr, numDays) {
  let sum = 0;
  let hasData = false;
  const endDate = parseLocalDate(endDateStr);
  
  for (let i = 0; i < numDays; i++) {
    const d = new Date(endDate);
    d.setDate(endDate.getDate() - i);
    const y = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dStr = `${y}-${mm}-${dd}`;
    
    sum += getDailyRainfallFor2025(dStr);
    hasData = true;
  }
  return hasData ? sum : 0;
}

function getMonthlyDataForYear(yearVal) {
  const yearStr = yearVal.toString();
  let yearData = null;
  
  if (globalResponseData.history && globalResponseData.history[yearStr]) {
    yearData = globalResponseData.history[yearStr];
  } else if (globalResponseData.currentYear && yearVal === parseInt(globalResponseData.currentYear) && globalResponseData.dataCurrent) {
    yearData = globalResponseData.dataCurrent;
  } else if (globalResponseData.prevYear && yearVal === parseInt(globalResponseData.prevYear) && globalResponseData.dataPrev) {
    yearData = globalResponseData.dataPrev;
  }
  
  if (!yearData || !Array.isArray(yearData)) return null;
  
  return yearData.map(item => {
    const val = parseFloat(item.rainfall);
    return isNaN(val) ? null : val;
  });
}

function executeFilter() {
  if (!globalResponseData) return;
  
  const selectedDateStr = document.getElementById('input-date-single').value;
  if (!selectedDateStr) return;
  
  const prevData = globalResponseData.dailyDataPrev ? globalResponseData.dailyDataPrev.data : [];
  const currData = globalResponseData.dailyDataCurrent ? globalResponseData.dailyDataCurrent.data : [];
  const allDaily = [...prevData, ...currData].filter(item => item && item.rainfall_datetime);
  
  let dailyMinDate = null;
  let dailyMaxDate = null;
  if (allDaily.length > 0) {
    const sorted = [...allDaily].sort((a, b) => parseLocalDate(a.rainfall_datetime) - parseLocalDate(b.rainfall_datetime));
    dailyMinDate = parseLocalDate(sorted[0].rainfall_datetime);
    dailyMaxDate = parseLocalDate(sorted[sorted.length - 1].rainfall_datetime);
  }
  
  const resultsContainer = document.getElementById('filter-results');
  const periodText = document.getElementById('text-filter-period');
  
  const viewSingle = document.getElementById('view-filter-single');
  const viewRange = document.getElementById('view-filter-range');
  const viewMonthly = document.getElementById('view-filter-monthly');
  const viewWarning = document.getElementById('view-filter-warning');
  const warningTitle = document.getElementById('warning-title');
  const warningDesc = document.getElementById('warning-desc');
  const warningActions = document.getElementById('warning-actions');
  const rangeEstimateNotice = document.getElementById('range-estimate-notice');
  
  resultsContainer.classList.remove('hidden');
  viewSingle.classList.add('hidden');
  viewRange.classList.add('hidden');
  viewMonthly.classList.add('hidden');
  viewWarning.classList.add('hidden');
  if (rangeEstimateNotice) rangeEstimateNotice.classList.add('hidden');
  warningActions.innerHTML = "";
  
  const selectedDate = parseLocalDate(selectedDateStr);
  const yearVal = selectedDate.getFullYear();
  const monthVal = selectedDate.getMonth();
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  
  if (currentFilterMode === 'daily') {
    const isDailyAvailable = dailyMinDate && dailyMaxDate && selectedDate >= dailyMinDate && selectedDate <= dailyMaxDate;
    
    if (isDailyAvailable) {
      viewSingle.classList.remove('hidden');
      periodText.innerText = selectedDate.toLocaleDateString('th-TH', options);
      
      const record = allDaily.find(item => item.rainfall_datetime === selectedDateStr);
      const valueEl = document.getElementById('text-single-value');
      const badgeEl = document.getElementById('badge-single-status');
      const descEl = document.getElementById('text-single-desc');
      
      if (record && record.rainfall_value !== null) {
        const val = record.rainfall_value;
        valueEl.innerText = val.toFixed(1);
        const category = getRainfallCategory(val);
        badgeEl.className = `px-4 py-1.5 rounded-full text-xs font-extrabold border shadow-sm ${category.class}`;
        badgeEl.innerText = category.label;
        descEl.innerText = category.desc;
      } else {
        valueEl.innerText = "-";
        badgeEl.className = "px-4 py-1.5 rounded-full text-xs font-extrabold border shadow-sm bg-slate-100 text-slate-600 border-slate-200";
        badgeEl.innerText = "ไม่มีข้อมูล";
        descEl.innerText = "ยังไม่มีข้อมูลตรวจวัดในวันที่เลือก";
      }
    } else {
      viewWarning.classList.remove('hidden');
      periodText.innerText = selectedDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
      
      warningTitle.innerText = "ไม่พบข้อมูลรายวันสำหรับช่วงเวลาที่เลือก";
      if (yearVal === 2025) {
        warningDesc.innerText = "ข้อมูลปริมาณน้ำฝนรายวันของปี พ.ศ. 2568 ไม่สามารถแสดงแบบรายวันตรง ๆ ได้เนื่องจากข้อจำกัดระบบหลังบ้าน แต่คุณสามารถเลือกดูปริมาณน้ำฝนสะสมในช่วงอื่น ๆ หรือรายงานสรุปรายเดือนที่ระบบคำนวณได้ดังนี้:";
        warningActions.innerHTML = `
          <button onclick="switchModeAndSearch('3day')" class="flex-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm transition-all duration-200 whitespace-nowrap text-center">
            ดูแบบราย 3 วัน (สะสม)
          </button>
          <button onclick="switchModeAndSearch('7day')" class="flex-1 bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm transition-all duration-200 whitespace-nowrap text-center">
            ดูแบบราย 7 วัน (สะสม)
          </button>
          <button onclick="switchModeAndSearch('monthly')" class="flex-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm transition-all duration-200 whitespace-nowrap text-center">
            ดูแบบรายเดือน
          </button>
        `;
      } else {
        warningDesc.innerText = `ข้อมูลปริมาณน้ำฝนรายวันของปี พ.ศ. ${yearVal + 543} ไม่รองรับในโหมดรายวันเนื่องจากระบบบันทึกเฉพาะรายงานรายเดือนเท่านั้น คุณสามารถเลือกรับชมรายงานสรุปปริมาณฝนรายเดือนแทนได้ดังนี้:`;
        warningActions.innerHTML = `
          <button onclick="switchModeAndSearch('monthly')" class="flex-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm transition-all duration-200 whitespace-nowrap text-center">
            ดูแบบรายเดือน
          </button>
        `;
      }
    }
  } else if (currentFilterMode === '3day' || currentFilterMode === '7day') {
    const numDays = currentFilterMode === '3day' ? 3 : 7;
    const startDate = new Date(selectedDate);
    startDate.setDate(selectedDate.getDate() - (numDays - 1));
    
    const isRangeDaily = dailyMinDate && dailyMaxDate && startDate >= dailyMinDate && selectedDate <= dailyMaxDate;
    
    if (yearVal === 2025 || isRangeDaily) {
      viewRange.classList.remove('hidden');
      if (rangeEstimateNotice) {
        rangeEstimateNotice.classList.toggle('hidden', yearVal !== 2025);
      }
      
      const opt = { day: 'numeric', month: 'short', year: 'numeric' };
      periodText.innerText = `${startDate.toLocaleDateString('th-TH', opt)} ถึง ${selectedDate.toLocaleDateString('th-TH', opt)} (ปริมาณฝนสะสม ${numDays} วัน)`;
      
      let sum = 0;
      let maxRain = 0;
      let maxDateStr = "-";
      let daysCount = 0;
      let validDaysWithDataCount = 0;
      
      const chartCategories = [];
      const chartSeries = [];
      let cumulativeSum = 0;
      
      for (let i = 0; i < numDays; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const y = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dStr = `${y}-${mm}-${dd}`;
        
        let val = null;
        if (y === 2025) {
          val = getDailyRainfallFor2025(dStr);
        } else {
          const record = allDaily.find(item => item.rainfall_datetime === dStr);
          if (record && record.rainfall_value !== null) {
            val = record.rainfall_value;
          }
        }
        
        if (val !== null) {
          sum += val;
          validDaysWithDataCount++;
          if (val > 0) daysCount++;
          if (val > maxRain) {
            maxRain = val;
            maxDateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
          }
          cumulativeSum += val;
        }
        
        chartSeries.push(parseFloat(cumulativeSum.toFixed(1)));
        chartCategories.push(d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
      }
      
      const avgRain = validDaysWithDataCount > 0 ? (sum / validDaysWithDataCount) : 0;
      
      document.getElementById('text-range-sum').innerText = sum.toFixed(1);
      document.getElementById('text-range-max').innerText = maxRain.toFixed(1);
      document.getElementById('text-range-max-date').innerText = maxDateStr !== "-" ? `วันที่: ${maxDateStr}` : "ไม่มีฝนตก";
      document.getElementById('text-range-days').innerText = daysCount;
      document.getElementById('text-range-avg').innerText = avgRain.toFixed(1);
      
      document.getElementById('text-range-chart-title').innerText = `กราฟปริมาณฝนสะสมในช่วงเวลาที่เลือก (ฝนสะสม ${numDays} วัน)`;
      renderFilterChart('#chart-filter', chartCategories, chartSeries, 'ปริมาณฝนสะสม (มม.)');
    } else {
      viewWarning.classList.remove('hidden');
      periodText.innerText = selectedDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
      
      warningTitle.innerText = `ไม่รองรับการจำลองสะสม ${numDays} วัน สำหรับปีที่เลือก`;
      warningDesc.innerText = `ระบบไม่สามารถดึงข้อมูลปริมาณฝนสะสมช่วง 3 หรือ 7 วันสำหรับปี พ.ศ. ${yearVal + 543} ได้ เนื่องจากไม่มีสถิติรายวันบันทึกไว้ในระบบ คุณสามารถสลับมาดูรายงานสรุปแบบรายเดือนได้ดังนี้:`;
      warningActions.innerHTML = `
        <button onclick="switchModeAndSearch('monthly')" class="flex-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm transition-all duration-200 whitespace-nowrap text-center">
          ดูแบบรายเดือน
        </button>
      `;
    }
  } else if (currentFilterMode === 'monthly') {
    viewMonthly.classList.remove('hidden');
    
    const monthOptions = { month: 'long', year: 'numeric' };
    periodText.innerText = `${selectedDate.toLocaleDateString('th-TH', monthOptions)} (รายงานสรุปรายเดือน)`;
    
    const currentYearData = getMonthlyDataForYear(yearVal);
    const prevYearData = getMonthlyDataForYear(yearVal - 1);
    
    let monthlyTotal = null;
    if (currentYearData) {
      monthlyTotal = currentYearData[monthVal];
    }
    
    let sumYear = 0;
    let countMonths = 0;
    if (currentYearData) {
      currentYearData.forEach(v => {
        if (v !== null) {
          sumYear += v;
          countMonths++;
        }
      });
    }
    const yearAvg = countMonths > 0 ? (sumYear / countMonths) : 0;
    
    document.getElementById('text-monthly-sum').innerText = monthlyTotal !== null ? monthlyTotal.toFixed(1) : "-";
    document.getElementById('text-monthly-year-avg').innerText = yearAvg.toFixed(1);
    
    const compareEl = document.getElementById('text-monthly-compare');
    if (prevYearData && prevYearData[monthVal] !== null && prevYearData[monthVal] > 0 && monthlyTotal !== null) {
      const prevTotal = prevYearData[monthVal];
      const diff = monthlyTotal - prevTotal;
      const percent = (diff / prevTotal) * 100;
      const colorClass = diff >= 0 ? 'text-rose-500 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 font-bold' : 'text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 font-bold';
      const arrow = diff >= 0 ? '▲' : '▼';
      compareEl.innerHTML = `<span class="${colorClass}">${arrow} ${Math.abs(percent).toFixed(1)}%</span> <span class="text-slate-400 text-xs font-semibold ml-1">จากปี ${yearVal - 1 + 543}</span>`;
    } else {
      compareEl.innerHTML = `<span class="text-slate-400 font-medium text-xs">ไม่มีข้อมูลเปรียบเทียบ</span>`;
    }
    
    document.getElementById('text-monthly-chart-title').innerText = `สถิติปริมาณน้ำฝนรายเดือนของปี พ.ศ. ${yearVal + 543} (ไฮไลท์เดือนที่เลือก)`;
    
    const monthsThaiShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const chartSeries = [];
    for (let i = 0; i < 12; i++) {
      chartSeries.push(currentYearData && currentYearData[i] !== null ? currentYearData[i] : 0);
    }
    
    renderFilterChart('#chart-filter-monthly', monthsThaiShort, chartSeries, 'ปริมาณฝน (มม.)', monthVal);
  }
}

function renderFilterChart(selector, categories, seriesData, seriesName = 'ปริมาณฝน', selectedIndex = -1) {
  if (filterChartInstance) {
    filterChartInstance.destroy();
    filterChartInstance = null;
  }
  
  const options = {
    series: [{ name: seriesName, data: seriesData }],
    chart: { 
        type: 'bar', height: '100%', fontFamily: 'Sarabun', toolbar: { show: false },
        parentHeightOffset: 0
    },
    colors: [function({ dataPointIndex }) {
      if (selectedIndex >= 0) {
        return dataPointIndex === selectedIndex ? '#6366f1' : '#cbd5e1';
      }
      return '#6366f1';
    }],
    plotOptions: { bar: { borderRadius: 3, columnWidth: '60%' } },
    dataLabels: { enabled: false },
    xaxis: { 
        type: 'category',
        categories: categories.map(String), 
        axisBorder: { show: false }, axisTicks: { show: false },
        tickPlacement: 'on',
        labels: { 
            show: true,
            rotate: 0,
            hideOverlappingLabels: false,
            style: { colors: '#94a3b8' },
            offsetY: 2 
        }
    },
    yaxis: { labels: { style: { colors: '#94a3b8' } } },
    grid: { 
        borderColor: '#f1f5f9', strokeDashArray: 3,
        padding: { top: 10, right: 10, bottom: 15, left: 10 }
    },
    tooltip: { theme: 'light', y: { formatter: v => `${v.toFixed(1)} มม.` } }
  };
  
  filterChartInstance = new ApexCharts(document.querySelector(selector), options);
  filterChartInstance.render();
}
