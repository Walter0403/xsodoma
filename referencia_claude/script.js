// Configuração da API
const API_BASE = 'https://www.eporner.com/api/v2/video/search/';
const POPUNDER_ATIVO = false; // Mude para true se quiser ativar
const POPUNDER_URL = ''; // Cole a URL da sua rede de popunder aqui

// Estado da aplicação
let currentPage = 1;
let currentQuery = '';
let currentSort = 'top-rated';
let perPage = 30;
let thumbSize = 'medium';
let collectedTags = new Set();

// Vocabulário base para sugestões
const baseVocabulary = [
    'loira', 'morena', 'ruiva', 'blonde', 'brunette', 'redhead',
    'anal', 'oral', 'teen', 'milf', 'latina', 'asian', 'ebony',
    'lesbian', 'threesome', 'gangbang', 'pov', 'big tits', 'big ass',
    'amateur', 'professional', 'hd', '4k', 'vr'
];

// Categorias organizadas
const CATEGORIAS = {
    'Cabelo': ['loira', 'morena', 'ruiva', 'castanha', 'platinada'],
    'Corpo': ['magra', 'fitness', 'curvy', 'bbw', 'alta', 'baixinha', 'seios grandes', 'bunda grande'],
    'Origem': ['latina', 'asiática', 'europeia', 'africana', 'brasileira', 'japonesa'],
    'Trans': ['trans', 'travesti', 'shemale', 'femboy'],
    'Estilo': ['amadora', 'profissional', 'caseira', 'vintage', 'público'],
    'Popular': ['milf', 'teen', 'mature', 'college', 'secretária', 'professora'],
    'Ato': ['anal', 'oral', 'vaginal', 'threesome', 'gangbang', 'solo', 'lésbica', 'orgia'],
    'Qualidade': ['hd', '4k', 'vr', '60fps']
};

// Elementos DOM
const videoGrid = document.getElementById('videoGrid');
const loading = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const pagination = document.getElementById('pagination');
const modal = document.getElementById('videoModal');
const videoPlayer = document.getElementById('videoPlayer');
const videoInfo = document.getElementById('videoInfo');
const relatedVideos = document.getElementById('relatedVideos');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const suggestionsList = document.getElementById('suggestions-list');
const categoriesBtn = document.getElementById('categoriesBtn');
const categoriesDrawer = document.getElementById('categoriesDrawer');
const closeDrawer = document.getElementById('closeDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const categoriesContent = document.getElementById('categoriesContent');

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadVideos();
    setupEventListeners();
    renderCategories();
    setupPopunder();
});

// Event Listeners
function setupEventListeners() {
    // Busca
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Autocompletar
    searchInput.addEventListener('input', handleAutocomplete);
    searchInput.addEventListener('keydown', handleSuggestionNavigation);
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) {
            closeSuggestions();
        }
    });

    // Filtros de navegação
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.currentTarget.id === 'categoriesBtn') return;

            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            const filter = e.currentTarget.dataset.filter;
            handleNavFilter(filter);
        });
    });

    // Filtros de seleção
    document.getElementById('sortBy').addEventListener('change', (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        loadVideos();
    });

    document.getElementById('perPage').addEventListener('change', (e) => {
        perPage = parseInt(e.target.value);
        currentPage = 1;
        loadVideos();
    });

    document.getElementById('thumbSize').addEventListener('change', (e) => {
        thumbSize = e.target.value;
        currentPage = 1;
        loadVideos();
    });

    // Modal
    document.getElementById('closeModal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Categorias drawer
    categoriesBtn.addEventListener('click', openCategoriesDrawer);
    closeDrawer.addEventListener('click', closeCategoriesDrawer);
    drawerOverlay.addEventListener('click', closeCategoriesDrawer);
}

// Busca
function handleSearch() {
    currentQuery = searchInput.value.trim();
    currentPage = 1;
    loadVideos();
    closeSuggestions();
}

// Autocompletar
function handleAutocomplete(e) {
    const query = e.target.value.trim().toLowerCase();

    if (query.length < 2) {
        closeSuggestions();
        return;
    }

    const allTags = [...baseVocabulary, ...collectedTags];
    const matches = allTags.filter(tag =>
        tag.toLowerCase().includes(query)
    ).slice(0, 8);

    if (matches.length === 0) {
        closeSuggestions();
        return;
    }

    renderSuggestions(matches, query);
}

function renderSuggestions(matches, query) {
    suggestionsList.innerHTML = matches.map((match, index) => {
        const highlighted = match.replace(
            new RegExp(escapeRegex(query), 'gi'),
            '<mark>$&</mark>'
        );
        return `<li class="suggestion-item" data-index="${index}" role="option">${highlighted}</li>`;
    }).join('');

    suggestionsList.classList.add('active');
    searchInput.setAttribute('aria-expanded', 'true');

    // Clique nas sugestões
    suggestionsList.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            searchInput.value = item.textContent;
            handleSearch();
        });
    });
}

function handleSuggestionNavigation(e) {
    if (!suggestionsList.classList.contains('active')) return;

    const items = suggestionsList.querySelectorAll('.suggestion-item');
    const activeItem = suggestionsList.querySelector('.suggestion-item.active');
    let activeIndex = activeItem ? parseInt(activeItem.dataset.index) : -1;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        searchInput.value = items[activeIndex].textContent;
        handleSearch();
        return;
    } else if (e.key === 'Escape') {
        closeSuggestions();
        return;
    } else {
        return;
    }

    items.forEach((item, index) => {
        item.classList.toggle('active', index === activeIndex);
    });

    if (activeIndex >= 0) {
        searchInput.setAttribute('aria-activedescendant', `suggestion-${activeIndex}`);
    }
}

function closeSuggestions() {
    suggestionsList.classList.remove('active');
    searchInput.setAttribute('aria-expanded', 'false');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Filtros de navegação
function handleNavFilter(filter) {
    switch(filter) {
        case 'all':
            currentQuery = '';
            currentSort = 'top-rated';
            break;
        case 'hd':
            currentQuery = 'hd';
            break;
        case 'new':
            currentSort = 'most-recent';
            break;
    }
    currentPage = 1;
    loadVideos();
}

// Categorias
function renderCategories() {
    categoriesContent.innerHTML = Object.entries(CATEGORIAS).map(([grupo, items]) => `
        <div class="category-group">
            <h3>${grupo}</h3>
            <div class="category-items">
                ${items.map(cat => `
                    <button class="category-tag" data-category="${cat}">
                        ${cat}
                    </button>
                `).join('')}
            </div>
        </div>
    `).join('');

    // Event listeners para categorias
    categoriesContent.querySelectorAll('.category-tag').forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.dataset.category;
            searchInput.value = category;
            handleSearch();
            closeCategoriesDrawer();
        });
    });
}

function openCategoriesDrawer() {
    categoriesDrawer.classList.add('open');
    drawerOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCategoriesDrawer() {
    categoriesDrawer.classList.remove('open');
    drawerOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

// Carregamento de vídeos
async function loadVideos() {
    try {
        loading.style.display = 'block';
        errorDiv.style.display = 'none';
        videoGrid.innerHTML = '';

        const url = buildApiUrl();
        const response = await fetch(url);

        if (!response.ok) throw new Error('Erro ao carregar vídeos');

        const data = await response.json();

        if (!data.videos || data.videos.length === 0) {
            throw new Error('Nenhum vídeo encontrado');
        }

        // Coletar tags dos resultados
        data.videos.forEach(video => {
            if (video.keywords) {
                video.keywords.split(',').forEach(tag => {
                    collectedTags.add(tag.trim().toLowerCase());
                });
            }
        });

        renderVideos(data.videos);
        renderPagination(data.count);

        loading.style.display = 'none';

    } catch (error) {
        loading.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = error.message;
    }
}

function buildApiUrl() {
    let url = `${API_BASE}?per_page=${perPage}&page=${currentPage}&thumbsize=${thumbSize}&order=${currentSort}`;

    if (currentQuery) {
        url += `&query=${encodeURIComponent(currentQuery)}`;
    }

    return url;
}

// Renderização de vídeos
function renderVideos(videos) {
    videoGrid.innerHTML = videos.map((video, index) => {
        // Inserir anúncio após 6º vídeo
        const adHtml = index === 5 ? '<div class="ad-container ad-inline"><span class="ad-label">Publicidade</span><div class="ad-slot" style="width: 300px; min-height: 250px;"></div></div>' : '';

        return `
            ${adHtml}
            <div class="video-card" data-video-id="${video.id}">
                <div class="video-thumbnail">
                    <img src="${video.default_thumb.src}" alt="${video.title}" loading="lazy">
                    <div class="video-duration">${formatDuration(video.length_sec)}</div>
                    <div class="video-rating">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                        ${video.rate}%
                    </div>
                    ${video.hd ? '<div class="video-quality">HD</div>' : ''}
                </div>
                <div class="video-info-card">
                    <h3 class="video-title">${video.title}</h3>
                    <div class="video-meta">
                        <span>${formatViews(video.views)} views</span>
                        <span>${formatDate(video.added)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Event listeners para cards
    document.querySelectorAll('.video-card').forEach(card => {
        card.addEventListener('click', () => {
            const videoId = card.dataset.videoId;
            openVideoModal(videoId);
        });
    });
}

// Modal de vídeo
async function openVideoModal(videoId) {
    try {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        const url = `https://www.eporner.com/api/v2/video/id/?id=${videoId}`;
        const response = await fetch(url);

        if (!response.ok) throw new Error('Erro ao carregar vídeo');

        const data = await response.json();

        // Player embed
        videoPlayer.innerHTML = `<iframe src="${data.embed}" allowfullscreen></iframe>`;

        // Informações
        videoInfo.innerHTML = `
            <h2>${data.title}</h2>
            <div class="video-stats">
                <span>${formatViews(data.views)} visualizações</span>
                <span>${data.rate}% gostaram</span>
                <span>${formatDuration(data.length_sec)}</span>
                <span>${data.added}</span>
            </div>
            <div class="video-tags">
                ${data.keywords.split(',').map(tag =>
                    `<span class="tag">${tag.trim()}</span>`
                ).join('')}
            </div>
        `;

        // Vídeos relacionados
        loadRelatedVideos(data.keywords);

    } catch (error) {
        console.error('Erro ao abrir vídeo:', error);
        closeModal();
    }
}

async function loadRelatedVideos(keywords) {
    try {
        const query = keywords.split(',')[0].trim();
        const url = `${API_BASE}?per_page=12&page=1&thumbsize=medium&order=top-rated&query=${encodeURIComponent(query)}`;

        const response = await fetch(url);
        const data = await response.json();

        relatedVideos.innerHTML = data.videos.slice(0, 8).map(video => `
            <div class="video-card" data-video-id="${video.id}">
                <div class="video-thumbnail">
                    <img src="${video.default_thumb.src}" alt="${video.title}" loading="lazy">
                    <div class="video-duration">${formatDuration(video.length_sec)}</div>
                    <div class="video-rating">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                        ${video.rate}%
                    </div>
                </div>
                <div class="video-info-card">
                    <h3 class="video-title">${video.title}</h3>
                </div>
            </div>
        `).join('');

        // Event listeners
        relatedVideos.querySelectorAll('.video-card').forEach(card => {
            card.addEventListener('click', () => {
                const videoId = card.dataset.videoId;
                openVideoModal(videoId);
            });
        });

    } catch (error) {
        console.error('Erro ao carregar relacionados:', error);
    }
}

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    videoPlayer.innerHTML = '';
}

// Paginação
function renderPagination(totalCount) {
    const totalPages = Math.ceil(totalCount / perPage);

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let paginationHtml = `
        <button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            Anterior
        </button>
    `;

    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHtml += `
            <button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">
                ${i}
            </button>
        `;
    }

    paginationHtml += `
        <button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            Próximo
        </button>
    `;

    pagination.innerHTML = paginationHtml;
}

function changePage(page) {
    currentPage = page;
    loadVideos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Popunder
function setupPopunder() {
    if (!POPUNDER_ATIVO || !POPUNDER_URL) return;

    // Não executar em mobile
    if (window.innerWidth < 768) return;

    // Uma vez por sessão
    if (sessionStorage.getItem('popunder_shown')) return;

    // Somente em clique real na grade
    videoGrid.addEventListener('click', () => {
        if (!sessionStorage.getItem('popunder_shown')) {
            try {
                window.open(POPUNDER_URL, '_blank');
                sessionStorage.setItem('popunder_shown', 'true');
            } catch (error) {
                console.log('Popunder bloqueado');
            }
        }
    }, { once: true });
}

// Utilitários
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatViews(views) {
    if (views >= 1000000) {
        return (views / 1000000).toFixed(1) + 'M';
    } else if (views >= 1000) {
        return (views / 1000).toFixed(1) + 'K';
    }
    return views.toString();
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `${diffDays} dias atrás`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} meses atrás`;
    return `${Math.floor(diffDays / 365)} anos atrás`;
}
