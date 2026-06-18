// 🎵 Raagam Music Player - Main JavaScript
// Direct streaming via Invidious/Piped - No token needed!

// ===== CONFIG =====
const GITHUB_USER = 'vis89-svg';
const GITHUB_REPO = 'Raagam';
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main`;

// Invidious instances for search + stream
const INVIDIOUS_INSTANCES = [
    'https://invidious.privacyredirect.com',
    'https://invidious.materialio.us',
    'https://yt.cdaut.de',
    'https://invidious.protokolla.fi',
    'https://yt.artemislena.eu',
    'https://yewtu.be',
    'https://inv.tux.pizza',
    'https://iv.datura.network',
    'https://invidious.privacydev.net',
    'https://inv.nadeko.net',
];

// Piped instances for fallback search + stream
const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.syncpundit.io',
];

// ===== STATE =====
const state = {
    currentSong: null,
    queue: [],
    queueIndex: 0,
    isPlaying: false,
    shuffle: false,
    repeat: false,
    history: [],
    searchResults: [],
    currentStreamUrl: null
};

// ===== DOM ELEMENTS =====
const audio = document.getElementById('audio-player');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResultsEl = document.getElementById('search-results');
const nowPlayingInfo = document.getElementById('now-playing-info');
const btnPlay = document.getElementById('btn-play');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnShuffle = document.getElementById('btn-shuffle');
const btnRepeat = document.getElementById('btn-repeat');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const volumeSlider = document.getElementById('volume-slider');
const statusEl = document.getElementById('status');
const queueList = document.getElementById('queue-list');
const recentSongsEl = document.getElementById('recent-songs');
const librarySongsEl = document.getElementById('library-songs');
const historySongsEl = document.getElementById('history-songs');

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ===== STATUS =====
function setStatus(text, loading = false) {
    statusEl.innerHTML = `<i class="fas fa-circle"></i> ${text}`;
    statusEl.className = loading ? 'status-indicator loading' : 'status-indicator';
}

// ===== NAVIGATION =====
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        link.classList.add('active');
        document.getElementById(`view-${view}`).classList.add('active');
        if (view === 'history') renderHistory();
    });
});

// ===== QUICK SEARCH TAGS =====
document.querySelectorAll('.tag').forEach(tag => {
    tag.addEventListener('click', () => {
        searchInput.value = tag.dataset.query;
        performSearch();
    });
});

// ===== SEARCH =====
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    setStatus('Searching...', true);
    showToast(`Searching for "${query}"...`, 'info');

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelector('[data-view="search"]').classList.add('active');
    document.getElementById('view-search').classList.add('active');

    searchResultsEl.innerHTML = '<div class="empty-state"><div class="spinner"></div> Searching...</div>';

    try {
        const results = await searchYouTube(query);
        state.searchResults = results;
        renderSearchResults(results);
        setStatus(`Found ${results.length} results`);
        showToast(`Found ${results.length} songs!`, 'success');
    } catch (err) {
        searchResultsEl.innerHTML = `<p class="empty-state">Error: ${err.message}. Try again.</p>`;
        setStatus('Search failed');
        showToast('Search failed. Try again.', 'error');
    }
}

async function searchYouTube(query) {
    // Approach 1: Invidious
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const url = `${instance}/api/v1/search?q=${encodeURIComponent(query + ' audio')}&type=video&sort_by=relevance`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!resp.ok) continue;
            const data = await resp.json();
            if (!data || !data.length) continue;
            return data.slice(0, 15).map(item => ({
                id: item.videoId,
                title: item.title,
                author: item.author,
                duration: formatDuration(item.lengthSeconds),
                thumbnail: item.videoThumbnails?.[0]?.url || '',
                query: query
            }));
        } catch (e) {
            continue;
        }
    }

    // Approach 2: Piped
    for (const instance of PIPED_INSTANCES) {
        try {
            const url = `${instance}/search?q=${encodeURIComponent(query + ' audio')}&filter=videos`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!resp.ok) continue;
            const data = await resp.json();
            if (!data?.relatedItems?.length) continue;
            return data.relatedItems.slice(0, 15).map(item => ({
                id: item.url?.split('v=')[1]?.split('&')[0] || '',
                title: item.title,
                author: item.uploaderName || 'Unknown',
                duration: formatDuration(item.duration || 0),
                thumbnail: item.thumbnail || '',
                query: query
            })).filter(s => s.id);
        } catch (e) {
            continue;
        }
    }

    throw new Error('Search temporarily unavailable. Check your internet or try again.');
}

function renderSearchResults(results) {
    if (!results.length) {
        searchResultsEl.innerHTML = '<p class="empty-state">No results found. Try different keywords.</p>';
        return;
    }
    searchResultsEl.innerHTML = results.map((song, i) => createSongCard(song, i, 'search')).join('');
    attachSongCardListeners();
}

function createSongCard(song, index, source) {
    const isPlaying = state.currentSong && state.currentSong.id === song.id;
    return `
        <div class="song-card ${isPlaying ? 'playing' : ''}" data-index="${index}" data-source="${source}" data-id="${song.id}">
            <div class="song-icon">
                <i class="fas fa-music"></i>
            </div>
            <div class="song-info">
                <div class="song-title">${escapeHtml(song.title)}</div>
                <div class="song-artist">${escapeHtml(song.author || 'Unknown')}</div>
            </div>
            <span class="song-duration">${song.duration || ''}</span>
            <div class="song-actions">
                <button class="song-action-btn btn-play-song" title="Play">
                    <i class="fas fa-play"></i>
                </button>
                <button class="song-action-btn btn-queue-song" title="Add to Queue">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        </div>
    `;
}

function attachSongCardListeners() {
    document.querySelectorAll('.song-card').forEach(card => {
        const playBtn = card.querySelector('.btn-play-song');
        const queueBtn = card.querySelector('.btn-queue-song');

        playBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(card.dataset.index);
            const source = card.dataset.source;
            playSong(index, source);
        });

        queueBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(card.dataset.index);
            const source = card.dataset.source;
            addToQueue(index, source);
        });

        card.addEventListener('click', () => {
            const index = parseInt(card.dataset.index);
            const source = card.dataset.source;
            playSong(index, source);
        });
    });
}

// ===== PLAYBACK - DIRECT STREAM =====
async function playSong(index, source) {
    const songs = source === 'search' ? state.searchResults :
                  source === 'queue' ? state.queue :
                  source === 'history' ? state.history : [];
    const song = songs[index];
    if (!song) return;

    setStatus('Loading stream...', true);
    showToast(`Loading: ${song.title}`, 'info');

    try {
        // Get direct stream URL from Invidious
        const streamUrl = await getStreamUrl(song.id);
        if (streamUrl) {
            playAudio(streamUrl, song);
            showToast('Playing! 🎵', 'success');
        } else {
            throw new Error('Could not get stream URL');
        }
    } catch (err) {
        showToast(`Failed: ${err.message}`, 'error');
        setStatus('Playback failed');
    }
}

async function getStreamUrl(videoId) {
    // Try Invidious first for direct audio stream URL
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const url = `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!resp.ok) continue;
            const data = await resp.json();
            
            // Get adaptive formats (audio only) - highest quality first
            const adaptiveFormats = data.adaptiveFormats || [];
            const audioFormats = adaptiveFormats.filter(f => 
                f.type?.startsWith('audio/') || f.audioQuality
            );
            
            if (audioFormats.length > 0) {
                audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                return audioFormats[0].url;
            }
            
            // Fallback: try formatStreams
            const formatStreams = data.formatStreams || [];
            if (formatStreams.length > 0) {
                return formatStreams[0].url;
            }
        } catch (e) {
            continue;
        }
    }
    
    // Fallback: Try Piped for stream URL
    for (const instance of PIPED_INSTANCES) {
        try {
            const url = `${instance}/streams/${videoId}`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!resp.ok) continue;
            const data = await resp.json();
            
            if (data.audioStreams?.length > 0) {
                // Sort by bitrate, pick highest
                const streams = data.audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                return streams[0].url;
            }
        } catch (e) {
            continue;
        }
    }
    
    return null;
}

function playAudio(url, song) {
    // Stop current playback
    audio.pause();
    audio.src = '';
    
    // Set new source
    audio.src = url;
    audio.load();
    
    audio.play().then(() => {
        state.currentSong = song;
        state.isPlaying = true;
        state.currentStreamUrl = url;
        updateNowPlaying(song);
        updatePlayButton();
        addToHistory(song);
        setStatus('Playing');
        renderSearchResults(state.searchResults);
    }).catch(err => {
        showToast('Playback failed. Try another song.', 'error');
        setStatus('Playback error');
    });
}

// ===== QUEUE =====
function addToQueue(index, source) {
    const songs = source === 'search' ? state.searchResults : state.history;
    const song = songs[index];
    if (!song) return;

    state.queue.push(song);
    renderQueue();
    showToast(`Added to queue: ${song.title}`, 'success');
}

function renderQueue() {
    if (!state.queue.length) {
        queueList.innerHTML = '<p class="empty-queue">Search and play songs to build your queue</p>';
        return;
    }
    queueList.innerHTML = state.queue.map((song, i) => `
        <div class="queue-item ${i === state.queueIndex ? 'playing' : ''}" data-queue-index="${i}">
            <i class="fas fa-music" style="font-size:10px;color:var(--accent)"></i>
            <span class="qi-title">${escapeHtml(song.title)}</span>
        </div>
    `).join('');

    queueList.querySelectorAll('.queue-item').forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.queueIndex);
            state.queueIndex = idx;
            playSongFromQueue(idx);
        });
    });
}

function playSongFromQueue(index) {
    const song = state.queue[index];
    if (!song) return;
    state.queueIndex = index;
    playSong(index, 'queue');
}

// ===== PLAYER CONTROLS =====
btnPlay.addEventListener('click', () => {
    if (!audio.src) return;
    if (audio.paused) {
        audio.play();
        state.isPlaying = true;
    } else {
        audio.pause();
        state.isPlaying = false;
    }
    updatePlayButton();
});

btnPrev.addEventListener('click', () => {
    if (state.queue.length && state.queueIndex > 0) {
        state.queueIndex--;
        playSongFromQueue(state.queueIndex);
    } else {
        audio.currentTime = 0;
    }
});

btnNext.addEventListener('click', () => {
    if (state.queue.length && state.queueIndex < state.queue.length - 1) {
        state.queueIndex++;
        playSongFromQueue(state.queueIndex);
    }
});

btnShuffle.addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    btnShuffle.classList.toggle('active', state.shuffle);
    showToast(state.shuffle ? 'Shuffle ON' : 'Shuffle OFF', 'info');
});

btnRepeat.addEventListener('click', () => {
    state.repeat = !state.repeat;
    btnRepeat.classList.toggle('active', state.repeat);
    showToast(state.repeat ? 'Repeat ON' : 'Repeat OFF', 'info');
});

function updatePlayButton() {
    btnPlay.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

function updateNowPlaying(song) {
    nowPlayingInfo.innerHTML = `
        <span class="np-title">${escapeHtml(song.title)}</span>
        <span class="np-artist">${escapeHtml(song.author || 'Unknown')}</span>
    `;
}

// ===== PROGRESS BAR =====
audio.addEventListener('timeupdate', () => {
    if (audio.duration && isFinite(audio.duration)) {
        const pct = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = `${pct}%`;
        currentTimeEl.textContent = formatTime(audio.currentTime);
        totalTimeEl.textContent = formatTime(audio.duration);
    }
});

audio.addEventListener('ended', () => {
    if (state.repeat) {
        audio.currentTime = 0;
        audio.play();
    } else if (state.queue.length && state.queueIndex < state.queue.length - 1) {
        state.queueIndex++;
        playSongFromQueue(state.queueIndex);
    } else {
        state.isPlaying = false;
        updatePlayButton();
    }
});

audio.addEventListener('error', () => {
    showToast('Stream error. Try another song.', 'error');
    setStatus('Stream error');
});

progressBar.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
});

// ===== VOLUME =====
volumeSlider.addEventListener('input', () => {
    audio.volume = volumeSlider.value / 100;
});

// ===== HISTORY =====
function addToHistory(song) {
    state.history = state.history.filter(s => s.id !== song.id);
    state.history.unshift({ ...song, playedAt: Date.now() });
    if (state.history.length > 50) state.history.pop();
    localStorage.setItem('raagam_history', JSON.stringify(state.history));
    renderRecentSongs();
}

function renderRecentSongs() {
    const recent = state.history.slice(0, 10);
    if (!recent.length) {
        recentSongsEl.innerHTML = '<p class="empty-state">Your recently played songs will appear here</p>';
        return;
    }
    recentSongsEl.innerHTML = recent.map((song, i) => createSongCard(song, i, 'history')).join('');
    attachSongCardListeners();
}

function renderHistory() {
    if (!state.history.length) {
        historySongsEl.innerHTML = '<p class="empty-state">No history yet. Start listening!</p>';
        return;
    }
    historySongsEl.innerHTML = state.history.map((song, i) => createSongCard(song, i, 'history')).join('');
    attachSongCardListeners();
}

// ===== LIBRARY =====
function renderLibrary() {
    librarySongsEl.innerHTML = '<p class="empty-state">Library feature coming soon! For now, check your History tab.</p>';
}

// ===== LOADING OVERLAY =====
function cardShowLoading(index, source) {
    const cards = document.querySelectorAll(`.song-card[data-index="${index}"][data-source="${source}"]`);
    cards.forEach(card => {
        if (!card.querySelector('.loading-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="spinner"></div> Loading...';
            card.appendChild(overlay);
        }
    });
}

function cardRemoveLoading() {
    document.querySelectorAll('.loading-overlay').forEach(el => el.remove());
}

// ===== UTILITY FUNCTIONS =====
function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== INIT =====
function init() {
    try {
        const saved = localStorage.getItem('raagam_history');
        if (saved) state.history = JSON.parse(saved);
    } catch (e) {}

    renderRecentSongs();
    renderQueue();
    audio.volume = 0.8;

    setStatus('Ready');
    showToast('Welcome to Raagam! 🎵 Search any song to begin.', 'success');
}

init();
