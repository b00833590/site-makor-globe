import { fetchQuoteHistory as defaultFetchQuoteHistory } from '../data/quoteClient.js';
import { companySymbol, companyPresentationDateISO, buildChartSVG } from './companyChart.js';

function formatPresentationDateLabel(sinceISO) {
  return new Date(`${sinceISO}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn = defaultFetchQuoteHistory }) {
  let requestToken = 0;

  function close() {
    modalEl.classList.remove('open');
    bodyEl.replaceChildren();
  }

  function showMessage(text) {
    bodyEl.replaceChildren();
    const message = document.createElement('p');
    message.className = 'chart-modal-message';
    message.textContent = text;
    bodyEl.appendChild(message);
  }

  async function open(item, portfolioEntries) {
    const token = ++requestToken;
    titleEl.textContent = item.name;
    bodyEl.replaceChildren();
    modalEl.classList.add('open');

    const symbol = companySymbol(item);
    const sinceISO = companyPresentationDateISO(item, portfolioEntries);

    if (!symbol || !sinceISO) {
      showMessage('Données insuffisantes pour afficher le graphique.');
      return;
    }

    const sub = document.createElement('div');
    sub.className = 'chart-modal-sub';
    sub.textContent = `Évolution depuis la présentation — ${formatPresentationDateLabel(sinceISO)} (${symbol})`;
    bodyEl.appendChild(sub);

    const wrap = document.createElement('div');
    wrap.className = 'chart-svg-wrap';
    const loading = document.createElement('div');
    loading.className = 'chart-loading';
    loading.textContent = 'Chargement de l\'historique des cours...';
    wrap.appendChild(loading);
    bodyEl.appendChild(wrap);

    const data = await fetchQuoteHistoryFn(symbol, sinceISO);
    if (token !== requestToken) return; // superseded by a newer open() call since this fetch started

    if (!data || !data.points || data.points.length < 2) {
      wrap.replaceChildren();
      const error = document.createElement('div');
      error.className = 'chart-error';
      error.textContent = `Historique indisponible pour le moment. Le symbole (${symbol}) est peut-être incorrect, ou la source de cours est temporairement inaccessible.`;
      wrap.appendChild(error);
      return;
    }

    const first = data.points[0].close;
    const last = data.points[data.points.length - 1].close;
    const changePct = ((last - first) / first) * 100;
    const sign = changePct >= 0 ? '+' : '';

    const priceRow = document.createElement('div');
    priceRow.className = 'chart-price-row';
    const price = document.createElement('div');
    price.className = 'chart-price';
    price.textContent = last.toFixed(2);
    const change = document.createElement('div');
    change.className = `chart-price-change ${changePct >= 0 ? 'positive' : 'negative'}`;
    change.textContent = `${sign}${changePct.toFixed(2)}% depuis la présentation`;
    priceRow.append(price, change);

    wrap.replaceChildren();
    wrap.appendChild(priceRow);
    const svg = buildChartSVG(data.points);
    if (svg) wrap.appendChild(svg);
  }

  return { open, close };
}
