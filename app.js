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
  lastSync: null
};

// DOM Elements
const elements = {
  form: document.getElementById('conflict-form'),
  inputDate: document.getElementById('input-date'),
  btnRefresh: document.getElementById('btn-refresh'),
  refreshIcon: document.getElementById('refresh-icon'),
  statusBar: document.getElementById('status-bar'),
  statusText: document.getElementById('status-text'),
  eventCounts: document.getElementById('event-counts'),
  resultsArea: document.getElementById('results-area'),
  resultBanner: document.getElementById('result-banner'),
  bannerIcon: document.getElementById('banner-icon'),
  bannerTitle: document.getElementById('banner-title'),
  conflictsSection: document.getElementById('conflicts-section'),
  conflictsList: document.getElementById('conflicts-list'),
  conflictCountBadge: document.getElementById('conflict-count-badge'),
  samedaySection: document.getElementById('sameday-section'),
  samedayList: document.getElementById('sameday-list'),
  samedayCountBadge: document.getElementById('sameday-count-badge'),
  toast: document.getElementById('toast')
};

/**
 * Initialize application
 */
document.addEventListener('DOMContentLoaded', async () => {
  setDefaultDates();
  attachEventListeners();
  
  // Load cached data first for instant display
  loadFromCache();
  
  // Fetch fresh data from live database
  await syncDataFromCharter();
});

/**
 * Set default date to today
 */
function setDefaultDates() {
  const today = new Date();
  elements.inputDate.value = formatDateYMD(today);
}

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
  // Form submission
  elements.form.addEventListener('submit', (e) => {
    e.preventDefault();
    checkConflicts();
  });

  // Date selection change
  elements.inputDate.addEventListener('change', () => {
    checkConflicts();
  });

  // Manual refresh button
  elements.btnRefresh.addEventListener('click', async () => {
    await syncDataFromCharter(true);
    if (elements.inputDate.value) {
      checkConflicts();
    }
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
    
    if (showNotification) {
      showToast(`Updated! ${rides.length} rides & ${oplShifts.length} shifts synced.`);
    }
  } catch (err) {
    console.error('Error syncing Charter events:', err);
    updateStatus('error', 'Sync failed. Using cached data.', `${state.rides.length} rides • ${state.oplShifts.length} shifts`);
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
 * Main Conflict Checking Logic (Conflict based on date only)
 */
function checkConflicts() {
  const targetDate = elements.inputDate.value;

  if (!targetDate) {
    showToast('Please select a date');
    return;
  }

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

  const sameDayNonConflicts = [];

  renderResults({
    conflicts,
    sameDayNonConflicts
  });
}

/**
 * Render Conflict Results to DOM
 */
function renderResults({ conflicts, sameDayNonConflicts = [] }) {
  elements.resultsArea.classList.remove('hidden');

  if (conflicts.length === 0) {
    // Green Banner - All Clear (Shrinked & Simplified)
    elements.resultBanner.className = 'result-banner banner-clear';
    elements.bannerIcon.className = 'fa-solid fa-circle-check';
    elements.bannerTitle.innerText = 'No Conflicts Found';
    
    elements.conflictsSection.classList.add('hidden');
    elements.conflictsList.innerHTML = '';
  } else {
    // Red Banner - Conflicts Found (Shrinked & Simplified)
    elements.resultBanner.className = 'result-banner banner-conflict';
    elements.bannerIcon.className = 'fa-solid fa-triangle-exclamation';
    elements.bannerTitle.innerText = 'Possible Conflict Detected';

    elements.conflictsSection.classList.remove('hidden');
    elements.conflictCountBadge.innerText = conflicts.length;
    elements.conflictsList.innerHTML = conflicts.map(c => createConflictCardHtml(c)).join('');
  }

  // Render Same Day Other Events (if any)
  if (sameDayNonConflicts.length > 0) {
    elements.samedaySection.classList.remove('hidden');
    elements.samedayCountBadge.innerText = sameDayNonConflicts.length;
    elements.samedayList.innerHTML = sameDayNonConflicts.map(s => createSameDayCardHtml(s)).join('');
  } else {
    elements.samedaySection.classList.add('hidden');
    elements.samedayList.innerHTML = '';
  }

  // Smooth scroll to results
  elements.resultsArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
 * Generate HTML for Same Day Non-Conflicting Event Card
 */
function createSameDayCardHtml(item) {
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
    <div class="event-card sameday-card">
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
