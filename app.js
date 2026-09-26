/**
 * Conflicts App - Charter Schedule Checker
 * Logic for fetching live events from Firebase Firestore and detecting time conflicts for all family members.
 */

const CONFIG = {
  apiKey: "AIzaSyCavQ8zBEmRF7Xtxej2iGjOEb8Voe0G3vg",
  projectId: "charter-tracker-youssef",
  charterUrl: "https://charter-ivory.vercel.app"
};

// Application State
const state = {
  rides: [],
  oplShifts: [],
  isLoading: false,
  lastSync: null,
  selectedDate: formatDateYMD(new Date()),
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth()
};

// DOM Elements
const elements = {
  btnRefresh: document.getElementById('btn-refresh'),
  refreshIcon: document.getElementById('refresh-icon'),
  statusBar: document.getElementById('status-bar'),
  statusText: document.getElementById('status-text'),
  eventCounts: document.getElementById('event-counts'),
  calPrev: document.getElementById('cal-prev'),
  calNext: document.getElementById('cal-next'),
  calMonthYear: document.getElementById('cal-month-year'),
  calTodayBtn: document.getElementById('cal-today-btn'),
  calendarDays: document.getElementById('calendar-days'),
  selectedDateText: document.getElementById('selected-date-text'),
  resultsArea: document.getElementById('results-area'),
  resultBanner: document.getElementById('result-banner'),
  bannerIcon: document.getElementById('banner-icon'),
  bannerTitle: document.getElementById('banner-title'),
  conflictsSection: document.getElementById('conflicts-section'),
  conflictsList: document.getElementById('conflicts-list'),
  conflictCountBadge: document.getElementById('conflict-count-badge'),
  toast: document.getElementById('toast')
};

/**
 * Initialize application
 */
document.addEventListener('DOMContentLoaded', async () => {
  attachEventListeners();
  renderCalendar();
  checkConflicts(state.selectedDate);
  
  // Load cached data first for instant display
  loadFromCache();
  
  // Fetch fresh data from live database
  await syncDataFromCharter();
});

/**
 * Format Date object to YYYY-MM-DD
 */
function formatDateYMD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Attach UI event listeners
 */
function attachEventListeners() {
  // Calendar Month Navigation
  elements.calPrev.addEventListener('click', () => {
    state.viewMonth--;
    if (state.viewMonth < 0) {
      state.viewMonth = 11;
      state.viewYear--;
    }
    renderCalendar();
  });

  elements.calNext.addEventListener('click', () => {
    state.viewMonth++;
    if (state.viewMonth > 11) {
      state.viewMonth = 0;
      state.viewYear++;
    }
    renderCalendar();
  });

  // Today shortcut button
  elements.calTodayBtn.addEventListener('click', () => {
    const today = new Date();
    state.viewYear = today.getFullYear();
    state.viewMonth = today.getMonth();
    selectDate(formatDateYMD(today));
  });

  // Calendar Day Selection (click event delegation)
  elements.calendarDays.addEventListener('click', (e) => {
    const btn = e.target.closest('.cal-day');
    if (!btn) return;
    const dateStr = btn.getAttribute('data-date');
    if (!dateStr) return;
    selectDate(dateStr);
  });

  // Manual refresh button
  elements.btnRefresh.addEventListener('click', async () => {
    await syncDataFromCharter(true);
    renderCalendar();
    checkConflicts(state.selectedDate);
  });
}

/**
 * Fetch all documents from Firestore with pagination support
 */
async function fetchFirestoreCollection(collectionName) {
  const docs = [];
  let pageToken = null;
  
  do {
    let url = `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/(default)/documents/${collectionName}?key=${CONFIG.apiKey}&pageSize=100`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${collectionName}: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.documents && Array.isArray(data.documents)) {
      for (const doc of data.documents) {
        const item = { id: doc.name.split('/').pop() };
        if (doc.fields) {
          for (const [key, valObj] of Object.entries(doc.fields)) {
            item[key] = Object.values(valObj)[0];
          }
        }
        docs.push(item);
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return docs;
}

/**
 * Synchronize live data from Charter Firestore
 */
async function syncDataFromCharter(showNotification = false) {
  if (state.isLoading) return;
  
  state.isLoading = true;
  elements.refreshIcon.classList.add('spinning');
  updateStatus('connecting', 'Syncing live events from Charter DB...');
  
  try {
    const [rides, oplShifts] = await Promise.all([
      fetchFirestoreCollection('rides'),
      fetchFirestoreCollection('opl_shifts')
    ]);
    
    state.rides = rides;
    state.oplShifts = oplShifts;
    state.lastSync = new Date();
    
    // Save to localStorage for instant offline access
    localStorage.setItem('conflicts_rides', JSON.stringify(rides));
    localStorage.setItem('conflicts_opl_shifts', JSON.stringify(oplShifts));
    localStorage.setItem('conflicts_last_sync', state.lastSync.toISOString());
    
    updateStatus('connected', `Connected to Charter DB`, `${rides.length} rides • ${oplShifts.length} shifts`);
    
    renderCalendar();
    checkConflicts(state.selectedDate);

    if (showNotification) {
      showToast(`Updated! ${rides.length} rides & ${oplShifts.length} shifts synced.`);
    }
  } catch (err) {
    console.error('Error syncing Charter events:', err);
    updateStatus('error', 'Sync failed. Using cached data.', `${state.rides.length} rides • ${state.oplShifts.length} shifts`);
    renderCalendar();
    checkConflicts(state.selectedDate);
    if (showNotification) {
      showToast('Sync failed. Please check internet connection.');
    }
  } finally {
    state.isLoading = false;
    elements.refreshIcon.classList.remove('spinning');
  }
}

/**
 * Load cached data from localStorage
 */
function loadFromCache() {
  try {
    const cachedRides = localStorage.getItem('conflicts_rides');
    const cachedShifts = localStorage.getItem('conflicts_opl_shifts');
    if (cachedRides && cachedShifts) {
      state.rides = JSON.parse(cachedRides);
      state.oplShifts = JSON.parse(cachedShifts);
      updateStatus('connected', 'Loaded from local cache', `${state.rides.length} rides • ${state.oplShifts.length} shifts`);
      renderCalendar();
      checkConflicts(state.selectedDate);
    }
  } catch (e) {
    console.warn('Cache load error:', e);
  }
}

/**
 * Update the status bar UI
 */
function updateStatus(type, message, counts = '') {
  elements.statusBar.className = `status-bar ${type}`;
  elements.statusText.innerText = message;
  elements.eventCounts.innerText = counts;
}

/**
 * Parse time string ("HH:MM") into minutes from midnight
 */
function parseTimeToMinutes(timeStr, referenceStartMinutes = null) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;

  // Handle 12-hour clock typing slips (e.g. 00:30 meaning 12:30 PM when start is morning)
  if (referenceStartMinutes !== null) {
    let rawMinutes = hours * 60 + minutes;
    if (rawMinutes < referenceStartMinutes && (rawMinutes + 720) > referenceStartMinutes && (rawMinutes + 720) <= 1440) {
      return rawMinutes + 720;
    }
  }

  return hours * 60 + minutes;
}

/**
 * Format minutes into "HH:MM"
 */
function formatMinutesToTime(min) {
  if (min === null || isNaN(min)) return '--:--';
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Format duration in minutes to human-readable string (e.g. "2h 15m")
 */
function formatDuration(mins) {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (h > 0 && minutes > 0) return `${h}h ${minutes}m`;
  if (h > 0) return `${h}h`;
  return `${minutes}m`;
}

/**
 * Extract time bounds from an event
 */
function getEventTimeBounds(event) {
  if (event.isOplShift) {
    const start = parseTimeToMinutes(event.timeStart);
    const end = parseTimeToMinutes(event.timeEnd, start);
    return {
      start,
      end,
      displayStart: event.timeStart || '--:--',
      displayEnd: event.timeEnd || '--:--',
      hasTime: start !== null && end !== null
    };
  }

  // Ride event
  const leave = parseTimeToMinutes(event.timeLeave);
  const apptStart = parseTimeToMinutes(event.timeApptStart);
  const startRef = leave !== null ? leave : apptStart;
  const apptEnd = parseTimeToMinutes(event.timeApptEnd, startRef);
  const ret = parseTimeToMinutes(event.timeReturn, startRef);

  // Overall effective start & end
  const starts = [leave, apptStart].filter(v => v !== null);
  const ends = [ret, apptEnd].filter(v => v !== null);

  const start = starts.length > 0 ? Math.min(...starts) : null;
  const end = ends.length > 0 ? Math.max(...ends) : null;

  return {
    start,
    end,
    displayStart: event.timeLeave || event.timeApptStart || '--:--',
    displayEnd: event.timeReturn || event.timeApptEnd || '--:--',
    leaveTime: event.timeLeave,
    returnTime: event.timeReturn,
    apptStart: event.timeApptStart,
    apptEnd: event.timeApptEnd,
    hasTime: start !== null && end !== null
  };
}

/**
 * Check if a date string ("YYYY-MM-DD") has any rides or shifts
 */
function hasEventsOnDate(dateStr) {
  const hasRide = state.rides.some(r => r.date === dateStr);
  if (hasRide) return true;
  return state.oplShifts.some(s => s.date === dateStr);
}

/**
 * Select a date and update calendar UI + results
 */
function selectDate(dateStr) {
  state.selectedDate = dateStr;
  const [y, m] = dateStr.split('-').map(Number);
  if (state.viewYear !== y || state.viewMonth !== (m - 1)) {
    state.viewYear = y;
    state.viewMonth = m - 1;
  }
  renderCalendar();
  checkConflicts(dateStr);
}

/**
 * Format and update the selected date text banner
 */
function updateSelectedDateText(dateStr) {
  if (!dateStr || !elements.selectedDateText) return;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const options = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
  elements.selectedDateText.innerText = `Events for ${dateObj.toLocaleDateString('en-US', options)}`;
}

/**
 * Render Month Calendar Grid
 */
function renderCalendar() {
  const year = state.viewYear;
  const month = state.viewMonth;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  elements.calMonthYear.innerText = `${monthNames[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const todayStr = formatDateYMD(new Date());
  const selectedStr = state.selectedDate;

  let html = '';

  // Previous month padding days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const prevDate = new Date(year, month - 1, dayNum);
    const dateStr = formatDateYMD(prevDate);
    const hasEvents = hasEventsOnDate(dateStr);
    const isSelected = dateStr === selectedStr;
    const isToday = dateStr === todayStr;

    html += `
      <button type="button" class="cal-day other-month ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}" data-date="${dateStr}" aria-label="${dateStr}">
        <span class="day-number">${dayNum}</span>
        ${hasEvents ? '<span class="event-dot"></span>' : ''}
      </button>
    `;
  }

  // Current month days
  for (let day = 1; day <= totalDays; day++) {
    const currDate = new Date(year, month, day);
    const dateStr = formatDateYMD(currDate);
    const hasEvents = hasEventsOnDate(dateStr);
    const isSelected = dateStr === selectedStr;
    const isToday = dateStr === todayStr;

    html += `
      <button type="button" class="cal-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}" data-date="${dateStr}" aria-label="${dateStr}">
        <span class="day-number">${day}</span>
        ${hasEvents ? '<span class="event-dot"></span>' : ''}
      </button>
    `;
  }

  // Next month padding days to complete 7-column grid
  const totalRendered = firstDayIndex + totalDays;
  const remainingCells = (totalRendered % 7 === 0) ? 0 : 7 - (totalRendered % 7);
  for (let day = 1; day <= remainingCells; day++) {
    const nextDate = new Date(year, month + 1, day);
    const dateStr = formatDateYMD(nextDate);
    const hasEvents = hasEventsOnDate(dateStr);
    const isSelected = dateStr === selectedStr;
    const isToday = dateStr === todayStr;

    html += `
      <button type="button" class="cal-day other-month ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}" data-date="${dateStr}" aria-label="${dateStr}">
        <span class="day-number">${day}</span>
        ${hasEvents ? '<span class="event-dot"></span>' : ''}
      </button>
    `;
  }

  elements.calendarDays.innerHTML = html;
  updateSelectedDateText(state.selectedDate);
}

/**
 * Main Conflict Checking Logic (Conflict based on date only)
 */
function checkConflicts(targetDate = state.selectedDate) {
  if (!targetDate) return;

  // Collect all events on target date for all family members
  const allEventsOnDate = [];

  // Add Rides on this date
  state.rides.forEach(r => {
    if (r.date === targetDate) {
      allEventsOnDate.push({ ...r, isOplShift: false });
    }
  });

  // Add OPL Shifts on this date
  state.oplShifts.forEach(s => {
    if (s.date === targetDate) {
      allEventsOnDate.push({ ...s, isOplShift: true });
    }
  });

  // If there is an event or more on that date, that means there is a possible conflict
  const conflicts = allEventsOnDate.map(event => ({
    event,
    timeInfo: getEventTimeBounds(event)
  }));

  // Sort conflicts chronologically by start time
  conflicts.sort((a, b) => {
    const aStart = a.timeInfo.start !== null ? a.timeInfo.start : 9999;
    const bStart = b.timeInfo.start !== null ? b.timeInfo.start : 9999;
    return aStart - bStart;
  });

  renderResults({ conflicts });
}

/**
 * Render Conflict Results to DOM under the calendar
 */
function renderResults({ conflicts }) {
  elements.resultsArea.classList.remove('hidden');

  if (conflicts.length === 0) {
    // Green Banner - No Conflicts Found
    elements.resultBanner.classList.remove('hidden');
    elements.resultBanner.className = 'result-banner banner-clear';
    elements.bannerIcon.className = 'fa-solid fa-circle-check';
    elements.bannerTitle.innerText = 'No Conflicts Found';
    
    elements.conflictsSection.classList.add('hidden');
    elements.conflictsList.innerHTML = '';
  } else {
    // Hide the banner completely - user asked to remove "Possible Conflict Detected" label
    elements.resultBanner.classList.add('hidden');

    elements.conflictsSection.classList.remove('hidden');
    elements.conflictCountBadge.innerText = conflicts.length;
    elements.conflictsList.innerHTML = conflicts.map(c => createConflictCardHtml(c)).join('');
  }
}

/**
 * Generate HTML for Conflicting Event Card
 */
function createConflictCardHtml(item) {
  const { event, timeInfo } = item;
  const isOpl = event.isOplShift;

  const requesterName = isOpl ? 'Olga' : (event.requester || 'Rita');
  const destination = isOpl ? (event.location || 'OPL Branch') : (event.destination || 'Unspecified');

  const eventTimeText = timeInfo.hasTime
    ? `${timeInfo.displayStart} – ${timeInfo.displayEnd}`
    : 'Time not specified';

  // Notes/Details
  const notesHtml = event.notes ? `
    <div class="notes-box">
      <i class="fa-regular fa-comment-dots"></i>
      <span>${escapeHtml(event.notes)}</span>
    </div>
  ` : '';

  return `
    <div class="event-card conflict-card">
      <div class="card-top-row">
        <div class="requester-tag">
          <i class="fa-solid fa-user"></i>
          <span>${escapeHtml(requesterName)}</span>
        </div>
      </div>

      <div class="event-destination">${escapeHtml(destination)}</div>

      <div class="event-time-row">
        <i class="fa-regular fa-clock"></i>
        <span>${eventTimeText}</span>
      </div>

      ${notesHtml}
    </div>
  `;
}

/**
 * Escape HTML special chars to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Toast notifications
 */
let toastTimeout;
function showToast(msg) {
  clearTimeout(toastTimeout);
  elements.toast.innerText = msg;
  elements.toast.classList.remove('hidden');
  toastTimeout = setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 2800);
}
