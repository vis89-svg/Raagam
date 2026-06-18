// 🎵 Raagam Music Player - Main JavaScript
// Search via Invidious → Download via yt-dlp (GitHub Actions) → Play from cache

// ===== CONFIG =====
const GITHUB_USER = 'vis89-svg';
const GITHUB_REPO = 'Raagam';
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main`;
const API_BASE = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}`;
const DISPATCH_URL = `${API_BASE}/dispatches`;

// ⚠️ This token is safe to expose - scoped to THIS repo only
// It can only trigger Actions and push to this specific repo
const GITHUB_TOKEN = 'ghp_REPLACE_WITH_YOUR_NEW_TOKEN';

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
    cachedSongs: [],
    polling: false
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

// ===== TOAST =====
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
    setTimeout(() => toast.remove(), 4000);
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
        if (view === 'library') renderLibrary();
    });
});

// ===== QUICK SEARCH =====
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

    setStatus('Searching YouTube...', true);
    showToast(`Searching for "${query}"...`, 'info');

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelector('[data-view="search"]').classList.add('active');
    document.getElementById('view-search').classList.add('active');

    searchResultsEl.innerHTML = '<div class="empty-state"><div class="spinner"></div> Searching YouTube...</div>';

    try {
        const results = await searchYouTube(query);
        state.searchResults = results;
        renderSearchResults(results);
        setStatus(`Found ${results.length} songs`);
        showToast(`Found ${results.length} songs! Click to play.`, 'success');
    } catch (err) {
        searchResultsEl.innerHTML = `<p class="empty-state">❌ ${err.message}</p>`;
        setStatus('Search failed');
        showToast('Search failed. Check internet and try again.', 'error');
    }
}

async function searchYouTube(query) {
    // Use Netlify Function as CORS proxy to Invidious
    const searchUrl = `/.netlify/functions/search?q=${encodeURIComponent(query)}`;
    
    try {
        const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `Search failed (${resp.status})`);
        }
        const data = await resp.json();
        if (!data || !data.length) {
            throw new Error('No results found. Try different keywords.');
        }
        return data.map(item => ({
            id: item.id,
            title: item.title,
            author: item.author,
            duration: item.duration || '',
            query: query
        }));
    } catch (e) {
        if (e.name === 'AbortError' || e.name === 'TimeoutError') {
            throw new Error('Search timed out. Check your internet.');
        }
        throw e;
    }
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
            <div class="song-icon"><i class="fas fa-music"></i></div>
            <div class="song-info">
                <div class="song-title">${escapeHtml(song.title)}</div>
                <div class="song-artist">${escapeHtml(song.author)}</div>
            </div>
            <span class="song-duration">${song.duration || ''}</span>
            <div class="song-actions">
                <button class="song-action-btn btn-play-song" title="Play"><i class="fas fa-play"></i></button>
                <button class="song-action-btn btn-queue-song" title="Add to Queue"><i class="fas fa-plus"></i></button>
            </div>
        </div>
    `;
}

function attachSongCardListeners() {
    document.querySelectorAll('.song-card').forEach(card => {
        card.querySelector('.btn-play-song')?.addEventListener('click', (e) => {
            e.stopPropagation();
            playSong(parseInt(card.dataset.index), card.dataset.source);
        });
        card.querySelector('.btn-queue-song')?.addEventListener('click', (e) => {
            e.stopPropagation();
            addToQueue(parseInt(card.dataset.index), card.dataset.source);
        });
        card.addEventListener('click', () => {
            playSong(parseInt(card.dataset.index), card.dataset.source);
        });
    });
}

// ===== PLAYBACK =====
async function playSong(index, source) {
    const songs = source === 'search' ? state.searchResults :
                  source === 'queue' ? state.queue :
                  source === 'history' ? state.history : [];
    const song = songs[index];
    if (!song) return;

    setStatus('Loading...', true);
    showToast(`Loading: ${song.title.substring(0, 40)}...`, 'info');

    // Check if already cached on GitHub
    const cachedUrl = `${RAW_BASE}/cache/${song.id}.mp3`;

    try {
        const cacheCheck = await fetch(cachedUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        if (cacheCheck.ok) {
            playAudio(cachedUrl, song);
            showToast('Playing from cache! 🎵', 'success');
            return;
        }
    } catch (e) {
        // Not cached, continue to download
    }

    // Not cached — trigger GitHub Action to download via yt-dlp
    showToast('Downloading from YouTube (first time takes ~30 sec)...', 'warning');
    setCardLoading(index, source, true);

    try {
        await triggerDownload(song);
        showToast('Download started! Waiting for file...', 'info');

        // Poll for the file to appear (up to 90 seconds)
        const fileUrl = await pollForFile(song.id, 90);
        setCardLoading(index, source, false);

        if (fileUrl) {
            playAudio(fileUrl, song);
            showToast('Playing! 🎵', 'success');
        } else {
            showToast('Download timed out. Try again — GitHub Actions might be busy.', 'error');
            setStatus('Download timeout');
        }
    } catch (err) {
        setCardLoading(index, source, false);
        showToast(`Failed: ${err.message}`, 'error');
        setStatus('Download failed');
    }
}

function setCardLoading(index, source, loading) {
    const cards = document.querySelectorAll(`.song-card[data-index="${index}"][data-source="${source}"]`);
    cards.forEach(card => {
        let overlay = card.querySelector('.loading-overlay');
        if (loading && !overlay) {
            overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="spinner"></div> Downloading...';
            card.appendChild(overlay);
        } else if (!loading && overlay) {
            overlay.remove();
        }
    });
}

// ===== GITHUB ACTIONS: TRIGGER DOWNLOAD =====
async function triggerDownload(song) {
    const resp = await fetch(DISPATCH_URL, {
        method: 'POST',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            event_type: 'download-song',
            client_payload: {
                video_id: song.id,
                title: song.title,
                author: song.author,
                query: song.query || ''
            }
        })
    });

    if (resp.status !== 200 && resp.status !== 204) {
        const err = await resp.text();
        throw new Error(`Trigger failed (${resp.status}): ${err.substring(0, 100)}`);
    }
}

async function pollForFile(videoId, maxSeconds) {
    const url = `${RAW_BASE}/cache/${videoId}.mp3`;
    for (let i = 0; i < maxSeconds; i++) {
        await sleep(1000);
        try {
            const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
            if (resp.ok) return url;
        } catch (e) {
            // Keep polling
        }
        // Update status every 10 seconds
        if (i > 0 && i % 10 === 0) {
            setStatus(`Downloading... ${i}s`);
            showToast(`Still downloading... (${i}s elapsed)`, 'info');
        }
    }
    return null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== AUDIO PLAYBACK =====
function playAudio(url, song) {
    audio.pause();
    audio.src = '';
    audio.src = url;
    audio.load();
    audio.play().then(() => {
        state.currentSong = song;
        state.isPlaying = true;
        updateNowPlaying(song);
        updatePlayButton();
        addToHistory(song);
        setStatus('Playing');
        renderSearchResults(state.searchResults);
    }).catch(err => {
        showToast('Playback failed. Try again.', 'error');
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
    showToast(`Added to queue: ${song.title.substring(0, 30)}...`, 'success');
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
            state.queueIndex = parseInt(item.dataset.queueIndex);
            playSongFromQueue(state.queueIndex);
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
    if (audio.paused) { audio.play(); state.isPlaying = true; }
    else { audio.pause(); state.isPlaying = false; }
    updatePlayButton();
});

btnPrev.addEventListener('click', () => {
    if (state.queue.length && state.queueIndex > 0) {
        state.queueIndex--;
        playSongFromQueue(state.queueIndex);
    } else { audio.currentTime = 0; }
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
        <span class="np-artist">${escapeHtml(song.author)}</span>
    `;
}

// ===== PROGRESS =====
audio.addEventListener('timeupdate', () => {
    if (audio.duration && isFinite(audio.duration)) {
        progressFill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
        currentTimeEl.textContent = formatTime(audio.currentTime);
        totalTimeEl.textContent = formatTime(audio.duration);
    }
});

audio.addEventListener('ended', () => {
    if (state.repeat) { audio.currentTime = 0; audio.play(); }
    else if (state.queue.length && state.queueIndex < state.queue.length - 1) {
        state.queueIndex++;
        playSongFromQueue(state.queueIndex);
    } else { state.isPlaying = false; updatePlayButton(); }
});

audio.addEventListener('error', () => {
    showToast('Stream error. Try another song.', 'error');
    setStatus('Stream error');
});

progressBar.addEventListener('click', (e) => {
    if (!audio.duration) return;
    audio.currentTime = ((e.clientX - progressBar.getBoundingClientRect().left) / progressBar.width) * audio.duration;
});

volumeSlider.addEventListener('input', () => { audio.volume = volumeSlider.value / 100; });

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

function renderLibrary() {
    librarySongsEl.innerHTML = '<p class="empty-state">Songs are cached temporarily. Play something to build your cache!</p>';
}

// ===== UTILS =====
function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds) {
    if (!seconds) return '';
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
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
