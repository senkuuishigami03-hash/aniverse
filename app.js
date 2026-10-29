const ANILIST_API = "https://graphql.anilist.co";
const SHIKIMORI_API = "https://shikimori.one/api";

const results = document.getElementById("results");
const searchInput = document.getElementById("search");

const details = document.createElement("main");
details.className = "details";
details.hidden = true;
document.body.appendChild(details);

const descriptionCache = new Map();

let searchTimer;
let searchController;
let activeDetailsId = null;

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function getTitle(anime) {
  return (
    anime.title?.english ||
    anime.title?.romaji ||
    anime.title?.native ||
    "Без названия"
  );
}

function showMessage(container, message) {
  container.replaceChildren(
    createElement("p", "muted", message)
  );
}

function getMeta(anime) {
  const episodes = Number.isInteger(anime.episodes)
    ? `${anime.episodes} эп.`
    : "Число серий уточняется";

  const score = anime.averageScore == null
    ? "Без оценки"
    : `${anime.averageScore}%`;

  return `${episodes} • ${score}`;
}

async function loadAnime(searchText = "") {
  if (searchController) {
    searchController.abort();
  }

  const controller = new AbortController();
  searchController = controller;

  showMessage(results, "Загружаем аниме…");

  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 24) {
        media(
          search: $search
          type: ANIME
          sort: POPULARITY_DESC
          isAdult: false
        ) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          coverImage {
            large
          }
          episodes
          averageScore
          status
        }
      }
    }
  `;

  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20000);

  try {
    const response = await fetch(ANILIST_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        query: query,
        variables: {
          search: searchText.trim() || null
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Сервис ответил с кодом ${response.status}`);
    }

    const data = await response.json();

    if (data.errors?.length) {
      throw new Error(data.errors[0].message);
    }

    const animeList = data.data?.Page?.media;

    if (!Array.isArray(animeList)) {
      throw new Error("Сервис вернул неожиданный ответ");
    }

    if (searchController !== controller) {
      return;
    }

    renderAnime(animeList);
  } catch (error) {
    if (searchController !== controller) {
      return;
    }

    if (error.name === "AbortError" && !timedOut) {
      return;
    }

    console.error(error);

    const message = timedOut
      ? "Сервис долго не отвечает. Попробуй ещё раз."
      : `Не удалось загрузить аниме. ${error.message}`;

    showMessage(results, message);

    const retry = createElement(
      "button",
      "episode",
      "Попробовать снова"
    );

    retry.addEventListener("click", () => {
      loadAnime(searchInput.value);
    });

    results.appendChild(retry);
  } finally {
    clearTimeout(timeout);
  }
}

function renderAnime(animeList) {
  results.replaceChildren();

  if (!animeList.length) {
    showMessage(
      results,
      "Ничего не найдено. Попробуй название латиницей."
    );
    return;
  }

  animeList.forEach((anime) => {
    const card = createElement("article", "card");
    const title = getTitle(anime);

    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Открыть: ${title}`);
    card.style.cursor = "pointer";

    if (anime.coverImage?.large) {
      const image = createElement("img");

      image.src = anime.coverImage.large;
      image.alt = title;
      image.loading = "lazy";

      card.appendChild(image);
    }

    const info = createElement("div", "card-info");

    info.append(
      createElement("div", "card-title", title),
      createElement("div", "card-meta", getMeta(anime))
    );

    card.appendChild(info);

    card.addEventListener("click", () => {
      openAnime(anime);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openAnime(anime);
      }
    });

    results.appendChild(card);
  });
}

function cleanDescription(value) {
  if (!value) {
    return "";
  }

  const parsed = new DOMParser().parseFromString(
    value,
    "text/html"
  );

  parsed.querySelectorAll("script, style").forEach((element) => {
    element.remove();
  });

  parsed.querySelectorAll("br").forEach((element) => {
    element.replaceWith(" ");
  });

  return (parsed.body.textContent || "").trim();
}

async function getRussianDetails(anime) {
  if (!anime.idMal) {
    return null;
  }

  if (descriptionCache.has(anime.idMal)) {
    return descriptionCache.get(anime.idMal);
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    const response = await fetch(
      `${SHIKIMORI_API}/animes/${anime.idMal}`,
      {
        headers: {
          "Accept": "application/json"
        },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error("Сервис русского описания недоступен");
    }

    const data = await response.json();

    const russian = {
      title: data.russian || "",
      description: cleanDescription(
        data.description_html || data.description
      )
    };

    descriptionCache.set(anime.idMal, russian);

    return russian;
  } catch (error) {
    console.warn("Русское описание не загрузилось:", error);

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function openAnime(anime) {
  const requestToken = {};
  activeDetailsId = requestToken;

  const topbar = document.querySelector(".topbar");

  if (topbar) {
    topbar.hidden = true;
  }

  results.hidden = true;
  results.style.display = "none";

  details.hidden = false;
  details.replaceChildren();

  const back = createElement("button", "", "← Назад");
  back.id = "back";
  back.style.marginBottom = "20px";

  back.addEventListener("click", closeAnime);

  const hero = createElement("div", "details-hero");

  if (anime.coverImage?.large) {
    const image = createElement("img");

    image.src = anime.coverImage.large;
    image.alt = getTitle(anime);

    hero.appendChild(image);
  }

  const information = createElement("div");
  const heading = createElement("h2", "", getTitle(anime));

  information.append(
    heading,
    createElement("p", "muted", getMeta(anime))
  );

  const language = createElement(
    "p",
    "muted",
    "Формат просмотра: японская озвучка · русские субтитры"
  );

  language.style.marginTop = "12px";
  information.appendChild(language);

  hero.appendChild(information);

  const descriptionSection = createElement(
    "section",
    "description"
  );

  const descriptionText = createElement(
    "p",
    "",
    "Загружаем описание на русском…"
  );

  descriptionText.style.whiteSpace = "pre-line";

  descriptionSection.append(
    createElement("h3", "", "Описание"),
    descriptionText
  );

  const episodesSection = createElement("section");

  episodesSection.appendChild(
    createElement("h3", "", "Серии")
  );

  const notice = createElement(
    "p",
    "muted",
    "Ниже — номера эпизодов из каталога, а не готовые видео. Видеофайлы пока не подключены."
  );

  notice.style.marginBottom = "14px";
  episodesSection.appendChild(notice);

  const episodeButtons = createElement("div", "episodes");

  episodesSection.appendChild(episodeButtons);

  details.append(
    back,
    hero,
    descriptionSection,
    episodesSection
  );

  renderEpisodes(anime, episodeButtons);

  window.scrollTo(0, 0);

  const russian = await getRussianDetails(anime);

  if (activeDetailsId !== requestToken) {
    return;
  }

  if (russian?.title) {
    heading.textContent = russian.title;
  }

  descriptionText.textContent =
    russian?.description ||
    "Описание на русском пока недоступно: сервис не ответил или русский текст отсутствует.";
}

function closeAnime() {
  activeDetailsId = null;

  details.hidden = true;
  details.replaceChildren();

  const topbar = document.querySelector(".topbar");

  if (topbar) {
    topbar.hidden = false;
  }

  results.hidden = false;
  results.style.removeProperty("display");
}

function renderEpisodes(anime, container) {
  const count = anime.episodes;

  if (!Number.isInteger(count) || count < 1) {
    showMessage(
      container,
      "Количество серий пока не указано."
    );
    return;
  }

  let displayed = 0;

  const more = createElement(
    "button",
    "episode",
    "Показать ещё серии"
  );

  function appendBatch() {
    more.remove();

    const last = Math.min(displayed + 60, count);
    const fragment = document.createDocumentFragment();

    for (
      let episode = displayed + 1;
      episode <= last;
      episode++
    ) {
      const button = createElement(
        "button",
        "episode",
        `Серия ${episode}`
      );

      button.addEventListener("click", () => {
        alert(
          `Серия ${episode}. Плеер пока не подключён. Следующий этап — добавить выбор видео и русских субтитров.`
        );
      });

      fragment.appendChild(button);
    }

    container.appendChild(fragment);
    displayed = last;

    if (displayed < count) {
      container.appendChild(more);
    }
  }

  more.addEventListener("click", appendBatch);
  appendBatch();
}

if (results && searchInput) {
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);

    if (searchController) {
      searchController.abort();
      searchController = null;
    }

    searchTimer = setTimeout(() => {
      loadAnime(searchInput.value);
    }, 600);
  });

  loadAnime();
} else {
  const warning = createElement(
    "p",
    "",
    "Не найдены элементы страницы. В index.html должны быть поле с id="search" и блок с id="results"."
  );

  warning.style.padding = "20px";
  warning.style.color = "#fca5a5";

  document.body.appendChild(warning);
  }
