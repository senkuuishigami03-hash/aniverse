const ANILIST_API = "https://graphql.anilist.co";
const SHIKIMORI_API = "https://shikimori.one/api";

const results = document.getElementById("results");
const search = document.getElementById("search");

let currentAnime = null;

async function loadAnime(searchText = "") {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 24) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
          id
          title { romaji english russian }
          coverImage { large }
          episodes
          averageScore
          genres
          description
        }
      }
    }
  `;

  const response = await fetch(ANILIST_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { search: searchText || null }
    })
  });

  const data = await response.json();
  render(data.data.Page.media);
}

function render(animeList) {
  results.innerHTML = "";

  animeList.forEach(anime => {
    const title =
      anime.title.russian ||
      anime.title.english ||
      anime.title.romaji;

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <img src="${anime.coverImage.large}" alt="${title}">
      <div class="card-info">
        <div class="card-title">${title}</div>
        <div class="card-meta">
          ${anime.episodes ?? "?"} эп. • ${anime.averageScore ?? "—"}%
        </div>
      </div>
    `;

    card.addEventListener("click", () => openAnime(anime));
    results.appendChild(card);
  });
}

async function openAnime(anime) {
  currentAnime = anime;

  const russianDescription = await getRussianDescription(anime);

  document.body.innerHTML = `
    <header class="topbar">
      <button id="back">← Назад</button>
    </header>

    <main class="details">
      <div class="details-hero">
        <img src="${anime.coverImage.large}" alt="">
        <div>
          <h2>${anime.title.russian || anime.title.english || anime.title.romaji}</h2>
          <p class="muted">
            ${anime.episodes ?? "?"} эпизодов • ${anime.averageScore ?? "—"}%
          </p>
          <div class="genres">
            ${anime.genres.map(genre => `<span>${genre}</span>`).join("")}
          </div>
        </div>
      </div>

      <section class="description">
        <h3>Описание</h3>
        <p>${russianDescription || "Описание пока недоступно."}</p>
      </section>

      <section>
        <h3>Серии</h3>
        <div id="episodes" class="episodes"></div>
      </section>
    </main>
  `;

  renderEpisodes(anime.episodes ?? 12);

  document.getElementById("back").addEventListener("click", () => {
    location.reload();
  });
}

async function getRussianDescription(anime) {
  try {
    const searchTitle =
      anime.title.romaji ||
      anime.title.english ||
      anime.title.russian;

    const searchResponse = await fetch(
      `${SHIKIMORI_API}/animes?search=${encodeURIComponent(searchTitle)}&limit=1`
    );

    const found = await searchResponse.json();

    if (!found.length) return null;

    const detailResponse = await fetch(
      `${SHIKIMORI_API}/animes/${found[0].id}`
    );

    const detail = await detailResponse.json();

    return detail.description
      ? detail.description.replace(/<[^>]*>/g, "")
      : null;
  } catch (error) {
    return null;
  }
}

function renderEpisodes(count) {
  const container = document.getElementById("episodes");
  container.innerHTML = "";

  for (let i = 1; i <= count; i++) {
    const button = document.createElement("button");
    button.className = "episode";
    button.textContent = `Серия ${i}`;

    button.addEventListener("click", () => {
      alert(`Здесь откроется плеер для серии ${i}.`);
    });

    container.appendChild(button);
  }
}

let timer;
search.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(() => loadAnime(search.value), 500);
});

loadAnime();
