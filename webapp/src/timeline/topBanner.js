function matchesQuery(company, query) {
  const q = query.toLowerCase();
  return company.name.toLowerCase().includes(q) || (company.yahooSymbol || '').toLowerCase().includes(q);
}

export function initTopBanner({ searchInputEl, searchResultsEl, getAllCompanies, onSelectCompany }) {
  function closeResults() {
    searchResultsEl.replaceChildren();
    searchResultsEl.style.display = 'none';
  }

  function renderResults(query) {
    if (!query.trim()) {
      closeResults();
      return;
    }
    const matches = getAllCompanies().filter(c => matchesQuery(c, query)).slice(0, 8);
    searchResultsEl.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'top-banner-search-empty';
      empty.textContent = 'Aucune entreprise trouvée';
      searchResultsEl.appendChild(empty);
    } else {
      matches.forEach((company, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'top-banner-search-result' + (i === 0 ? ' highlighted' : '');
        btn.textContent = company.name;
        if (company.yahooSymbol) {
          const symbol = document.createElement('span');
          symbol.className = 'top-banner-search-result-symbol';
          symbol.textContent = `(${company.yahooSymbol})`;
          btn.appendChild(symbol);
        }
        btn.addEventListener('click', () => {
          closeResults();
          searchInputEl.value = '';
          onSelectCompany(company);
        });
        searchResultsEl.appendChild(btn);
      });
    }
    searchResultsEl.style.display = 'block';
  }

  searchInputEl.addEventListener('input', () => renderResults(searchInputEl.value));

  searchInputEl.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      const first = searchResultsEl.querySelector('.top-banner-search-result');
      if (first) first.click();
    } else if (event.key === 'Escape') {
      closeResults();
      searchInputEl.blur();
    }
  });

  document.addEventListener('click', event => {
    if (!searchResultsEl.contains(event.target) && event.target !== searchInputEl) closeResults();
  });

  closeResults();
}
