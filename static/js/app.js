// Global Application State
let state = {
    releases: [],
    searchQuery: '',
    selectedType: 'all',
    selectedUpdate: null
};

// DOM Elements
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const typeFilters = document.getElementById('typeFilters');
const totalUpdatesCount = document.getElementById('totalUpdatesCount');
const featuresCount = document.getElementById('featuresCount');
const lastUpdatedText = document.getElementById('lastUpdatedText');
const refreshBtn = document.getElementById('refreshBtn');
const refreshSpinner = document.getElementById('refreshSpinner');
const feedTimeline = document.getElementById('feedTimeline');
const feedLoading = document.getElementById('feedLoading');
const emptyState = document.getElementById('emptyState');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');

// Tweet Drawer DOM Elements
const tweetDrawer = document.getElementById('tweetDrawer');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const cancelTweetBtn = document.getElementById('cancelTweetBtn');
const sendTweetBtn = document.getElementById('sendTweetBtn');
const tweetTextArea = document.getElementById('tweetTextArea');
const charCounter = document.getElementById('charCounter');
const selectedUpdateTextPreview = document.getElementById('selectedUpdateTextPreview');

// ==========================================================================
// Initialization & Event Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    fetchReleases();
    setupEventListeners();
});

function setupEventListeners() {
    // Refresh feed
    refreshBtn.addEventListener('click', () => fetchReleases(true));
    
    // Search input handlers
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        toggleClearSearchButton();
        renderFeed();
    });
    
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        toggleClearSearchButton();
        renderFeed();
        searchInput.focus();
    });
    
    // Type Filter click handler
    typeFilters.addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;
        
        // Remove active class from all pills, add to clicked pill
        document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
        pill.classList.add('active');
        
        state.selectedType = pill.dataset.type;
        renderFeed();
    });
    
    // Reset filters empty state button
    resetFiltersBtn.addEventListener('click', resetFilters);
    
    // Tweet Drawer actions
    closeDrawerBtn.addEventListener('click', closeTweetDrawer);
    cancelTweetBtn.addEventListener('click', closeTweetDrawer);
    
    tweetTextArea.addEventListener('input', updateCharCount);
    
    sendTweetBtn.addEventListener('click', executeTweetIntent);
}

// Toggle search clear button visibility
function toggleClearSearchButton() {
    if (state.searchQuery.length > 0) {
        clearSearchBtn.classList.add('active');
    } else {
        clearSearchBtn.classList.remove('active');
    }
}

// Reset filters back to default
function resetFilters() {
    searchInput.value = '';
    state.searchQuery = '';
    toggleClearSearchButton();
    
    document.querySelectorAll('.filter-pill').forEach(btn => {
        if (btn.dataset.type === 'all') btn.classList.add('active');
        else btn.classList.remove('active');
    });
    state.selectedType = 'all';
    
    renderFeed();
}

// ==========================================================================
// API Fetching & Processing
// ==========================================================================
async function fetchReleases(forceRefresh = false) {
    try {
        setLoadingState(true);
        
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success && data.releases) {
            state.releases = data.releases;
            updateLastUpdatedLabel(data.timestamp);
            calculateFeedStats();
            renderFeed();
        } else {
            console.error("Failed to parse releases API response.");
            showErrorState();
        }
    } catch (err) {
        console.error("Network error fetching releases: ", err);
        showErrorState();
    } finally {
        setLoadingState(false);
    }
}

function setLoadingState(isLoading) {
    if (isLoading) {
        refreshSpinner.classList.add('spinning');
        refreshBtn.disabled = true;
        feedLoading.classList.remove('hidden');
        feedTimeline.classList.add('hidden');
        emptyState.classList.add('hidden');
    } else {
        refreshSpinner.classList.remove('spinning');
        refreshBtn.disabled = false;
        feedLoading.classList.add('hidden');
        feedTimeline.classList.remove('hidden');
    }
}

function updateLastUpdatedLabel(isoString) {
    const date = new Date(isoString);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    lastUpdatedText.innerHTML = `<i class="fa-solid fa-clock"></i> Synced: ${dateStr} at ${timeStr}`;
}

function showErrorState() {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('h2').textContent = "Connection Error";
    emptyState.querySelector('p').textContent = "We encountered an error loading the BigQuery release feed. Please try refreshing.";
}

// ==========================================================================
// State Calculations & Rendering
// ==========================================================================
function calculateFeedStats() {
    let totalItems = 0;
    let totalFeatures = 0;
    
    state.releases.forEach(rel => {
        if (!rel.updates) return;
        rel.updates.forEach(up => {
            totalItems++;
            if (up.type.toLowerCase() === 'feature') {
                totalFeatures++;
            }
        });
    });
    
    totalUpdatesCount.textContent = totalItems;
    featuresCount.textContent = totalFeatures;
}

// Render filtered and searched timeline items
function renderFeed() {
    feedTimeline.innerHTML = '';
    
    let renderedCount = 0;
    
    state.releases.forEach(release => {
        // Filter the updates in this release date node
        const filteredUpdates = release.updates.filter(update => {
            // Type match
            const matchesType = state.selectedType === 'all' || 
                                update.type.toLowerCase() === state.selectedType;
                                
            // Search keyword match
            const matchesSearch = !state.searchQuery || 
                                 update.text.toLowerCase().includes(state.searchQuery) ||
                                 update.type.toLowerCase().includes(state.searchQuery) ||
                                 release.date.toLowerCase().includes(state.searchQuery);
                                 
            return matchesType && matchesSearch;
        });
        
        // If this date node has matching updates, render it
        if (filteredUpdates.length > 0) {
            renderedCount += filteredUpdates.length;
            
            const nodeElem = document.createElement('div');
            nodeElem.className = 'timeline-node';
            
            const headerElem = document.createElement('div');
            headerElem.className = 'timeline-date-header';
            
            const dateTitle = document.createElement('h2');
            dateTitle.textContent = release.date;
            
            const dateLink = document.createElement('a');
            dateLink.className = 'timeline-date-link';
            dateLink.href = release.link;
            dateLink.target = '_blank';
            dateLink.setAttribute('aria-label', `View release notes details for ${release.date}`);
            dateLink.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i>';
            
            headerElem.appendChild(dateTitle);
            headerElem.appendChild(dateLink);
            nodeElem.appendChild(headerElem);
            
            const updatesList = document.createElement('div');
            updatesList.className = 'node-updates-list';
            
            filteredUpdates.forEach(update => {
                const card = document.createElement('div');
                card.className = `update-card ${state.selectedUpdate && state.selectedUpdate.id === update.id ? 'selected' : ''}`;
                card.dataset.id = update.id;
                
                // Clicking the card anywhere selects it
                card.addEventListener('click', (e) => {
                    // Ignore clicks on standard links inside the card
                    if (e.target.tagName === 'A') return;
                    
                    selectUpdate(update, release.date, release.link);
                });
                
                // Header of card (Type badge + selection circle)
                const cardHeader = document.createElement('div');
                cardHeader.className = 'card-header';
                
                const typeClass = getBadgeClass(update.type);
                const badge = document.createElement('span');
                badge.className = `badge ${typeClass}`;
                badge.textContent = update.type;
                
                const selectIndicator = document.createElement('div');
                selectIndicator.className = 'select-indicator';
                selectIndicator.innerHTML = '<i class="fa-solid fa-check"></i>';
                
                cardHeader.appendChild(badge);
                cardHeader.appendChild(selectIndicator);
                card.appendChild(cardHeader);
                
                // Content of card
                const cardContent = document.createElement('div');
                cardContent.className = 'card-content';
                cardContent.innerHTML = update.html;
                card.appendChild(cardContent);
                
                // Actions (Share Tweet)
                const cardActions = document.createElement('div');
                cardActions.className = 'card-actions';
                
                const shareBtn = document.createElement('button');
                shareBtn.className = 'btn-tweet-card';
                shareBtn.innerHTML = '<i class="fa-brands fa-twitter"></i> Select to Tweet';
                shareBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent duplicate card click events
                    selectUpdate(update, release.date, release.link);
                    openTweetDrawer();
                });
                
                cardActions.appendChild(shareBtn);
                card.appendChild(cardActions);
                
                updatesList.appendChild(card);
            });
            
            nodeElem.appendChild(updatesList);
            feedTimeline.appendChild(nodeElem);
        }
    });
    
    // Toggle Empty State if no updates matched
    if (renderedCount === 0) {
        feedTimeline.classList.add('hidden');
        emptyState.classList.remove('hidden');
    } else {
        feedTimeline.classList.remove('hidden');
        emptyState.classList.add('hidden');
    }
}

// Map entry h3 type to matching css badge class
function getBadgeClass(type) {
    const t = type.toLowerCase();
    if (t.includes('feature')) return 'badge-feature';
    if (t.includes('change')) return 'badge-change';
    if (t.includes('issue')) return 'badge-issue';
    if (t.includes('deprecation')) return 'badge-deprecation';
    return 'badge-default';
}

// ==========================================================================
// Selection & Tweet Composer Drawer Functions
// ==========================================================================
function selectUpdate(update, date, link) {
    state.selectedUpdate = {
        ...update,
        date: date,
        link: link
    };
    
    // Update visual selection on cards
    document.querySelectorAll('.update-card').forEach(card => {
        if (card.dataset.id === update.id) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
    
    // Populate Composer fields
    selectedUpdateTextPreview.textContent = `(${date}) - [${update.type}]: ${update.text}`;
    
    // Generate intelligent default tweet text
    const defaultTweet = generateDefaultTweetText(update.type, date, update.text, link);
    tweetTextArea.value = defaultTweet;
    
    updateCharCount();
}

function generateDefaultTweetText(type, date, text, link) {
    const hashtags = " #BigQuery #GoogleCloud";
    // Shorten date format for tweet economy (e.g., "June 15, 2026" to "15 Jun")
    const cleanDate = formatDateShort(date);
    const prefix = `BigQuery ${type} (${cleanDate}): `;
    
    // Twitter 280 limits
    const overhead = prefix.length + hashtags.length + 1 + link.length + 1;
    const maxTextLen = 280 - overhead;
    
    let trimmedText = text;
    if (trimmedText.length > maxTextLen) {
        trimmedText = trimmedText.substring(0, maxTextLen - 3) + "...";
    }
    
    return `${prefix}"${trimmedText}"${hashtags} ${link}`;
}

// Simple short date format utility
function formatDateShort(dateStr) {
    try {
        const date = new Date(dateStr);
        if (isNaN(date)) return dateStr;
        const day = date.getDate();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${day} ${months[date.getMonth()]}`;
    } catch {
        return dateStr;
    }
}

// Live character counter updates
function updateCharCount() {
    const len = tweetTextArea.value.length;
    const remaining = 280 - len;
    
    charCounter.textContent = `${remaining} characters remaining`;
    
    // Visual indicators
    if (remaining < 0) {
        charCounter.className = 'char-counter danger';
        sendTweetBtn.disabled = true;
    } else if (remaining < 40) {
        charCounter.className = 'char-counter warning';
        sendTweetBtn.disabled = false;
    } else {
        charCounter.className = 'char-counter';
        sendTweetBtn.disabled = false;
    }
    
    if (len === 0) {
        sendTweetBtn.disabled = true;
    }
}

// Open / Close Drawer
function openTweetDrawer() {
    if (!state.selectedUpdate) {
        alert("Please select an update card first!");
        return;
    }
    tweetDrawer.classList.add('active');
    tweetTextArea.focus();
}

function closeTweetDrawer() {
    tweetDrawer.classList.remove('active');
}

// Trigger X / Twitter intent popup
function executeTweetIntent() {
    const text = tweetTextArea.value.trim();
    if (text.length === 0 || text.length > 280) return;
    
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer,width=550,height=420');
}
