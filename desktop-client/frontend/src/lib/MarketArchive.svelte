<script>
  import { onDestroy, onMount } from 'svelte';
  import { DashboardService } from '../../bindings/github.com/ao-data/albiondata-client/internal/dashboard/index.js';
  import {
    formatEnchantment,
    formatItemName,
    formatOrderType,
    formatQuality,
  } from './marketArchiveFormat.js';
  import { language, t } from './i18n.js';

  const pageSize = 200;
  let silverFormat = $derived(new Intl.NumberFormat($language === 'en' ? 'en-US' : 'pt-BR'));

  let search = $state('');
  let locationID = $state('');
  let region = $state('');
  let itemNames = $state({});
  let itemNamesLocale = $state('');
  let itemNamesRequest = 0;
  let loading = $state(false);
  let result = $state({ Orders: [], Total: 0, InvalidLines: 0, Path: '', Error: '' });
  let requestID = 0;
  let searchTimer;

  async function loadItemNames(locale) {
    const request = ++itemNamesRequest;
    const filename = locale === 'en' ? 'item-name-index.en.json' : 'item-name-index.pt.json';
    try {
      const response = await fetch(`/${filename}`);
      if (!response.ok) throw new Error(`Could not load ${filename}`);
      const names = await response.json();
      if (request === itemNamesRequest) {
        itemNames = names;
        itemNamesLocale = locale;
      }
    } catch {
      // Keep the archive usable with readable item IDs if names are unavailable.
      if (request === itemNamesRequest) {
        itemNames = {};
        itemNamesLocale = locale;
      }
    }
  }

  const unlistenLanguage = language.subscribe((locale) => void loadItemNames(locale));
  onMount(load);
  onDestroy(() => {
    clearTimeout(searchTimer);
    unlistenLanguage();
  });

  function scheduleLoad() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  }

  async function load() {
    const currentID = ++requestID;
    loading = true;
    try {
      const next = await DashboardService.GetMarketArchive(search, locationID, region, pageSize);
      if (currentID === requestID) result = next;
    } catch (error) {
      if (currentID === requestID) {
        result = { ...result, Error: String(error) };
      }
    } finally {
      if (currentID === requestID) loading = false;
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString($language === 'en' ? 'en-US' : 'pt-BR');
  }

  async function copyPath() {
    if (!result.Path) return;
    await navigator.clipboard.writeText(result.Path);
  }
</script>

<section class="archive">
  <header class="heading">
    <div>
      <h1>{$t('archive.title')}</h1>
      <p>{$t('archive.description')}</p>
    </div>
    <button class="refresh" onclick={load} disabled={loading}>
      {loading ? $t('archive.updating') : $t('archive.refresh')}
    </button>
  </header>

  <div class="filters">
    <label>
      <span>{$t('archive.searchLabel')}</span>
      <input bind:value={search} oninput={scheduleLoad} placeholder={$t('archive.searchPlaceholder')} />
    </label>
    <label>
      <span>{$t('archive.locationLabel')}</span>
      <input bind:value={locationID} oninput={scheduleLoad} placeholder={$t('archive.locationPlaceholder')} />
    </label>
    <label>
      <span>{$t('archive.regionLabel')}</span>
      <select bind:value={region} onchange={load}>
        <option value="">{$t('archive.all')}</option>
        <option value="West">West</option>
        <option value="East">East</option>
        <option value="Europe">Europe</option>
      </select>
    </label>
  </div>

  <div class="summary">
    <span><strong>{silverFormat.format(result.Total)}</strong> {$t('archive.recordsNoun')}</span>
    <span>{$t('archive.latest', { count: pageSize })}</span>
  </div>

  {#if result.Error}
    <div class="notice error">{$t('archive.readError', { error: result.Error })}</div>
  {:else if result.InvalidLines > 0}
    <div class="notice warning">{$t('archive.invalidLines', { count: result.InvalidLines })}</div>
  {/if}

  {#if result.Orders.length > 0}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{$t('archive.capturedAt')}</th>
            <th>{$t('archive.city')}</th>
            <th>{$t('archive.itemCode')}</th>
            <th>{$t('archive.type')}</th>
            <th>{$t('archive.quantity')}</th>
            <th>{$t('archive.unitPrice')}</th>
            <th>{$t('archive.quality')}</th>
            <th>{$t('archive.enchantment')}</th>
          </tr>
        </thead>
        <tbody>
          {#each result.Orders as entry (`${entry.ID}-${entry.CapturedAt}-${entry.ItemID}`)}
            <tr>
              <td>{formatDate(entry.CapturedAt)}</td>
              <td class="location">
                <span>{entry.LocationID || $t('archive.unknownLocation')}</span>
                <small>{entry.Region || $t('archive.unknownServer')}</small>
              </td>
              <td class="item">
                <span>{formatItemName(entry.ItemID, itemNamesLocale === $language ? itemNames : {})}</span>
                <small>{entry.ItemID}</small>
              </td>
              <td>{formatOrderType(entry.AuctionType, $t)}</td>
              <td>{silverFormat.format(entry.Amount)}</td>
              <td>{silverFormat.format(entry.Price)}</td>
              <td>{formatQuality(entry.QualityLevel, $t)}</td>
              <td>{formatEnchantment(entry.EnchantmentLevel, $t)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if !loading && !result.Error}
    <div class="empty">
      <strong>{$t('archive.emptyTitle')}</strong>
      <span>{$t('archive.emptyDescription')}</span>
    </div>
  {/if}

  <footer class="archive-path">
    <div>
      <span>{$t('archive.fileLabel')}</span>
      <code>{result.Path || $t('archive.unavailable')}</code>
    </div>
    <button onclick={copyPath} disabled={!result.Path}>{$t('archive.copyPath')}</button>
  </footer>
</section>

<style>
  .archive {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 1rem;
    overflow: auto;
    padding: 1.25rem;
  }
  .heading,
  .summary,
  .archive-path {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  h1 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 650;
  }
  p {
    margin: 0.35rem 0 0;
    color: var(--text-muted);
    font-size: 0.78rem;
  }
  button,
  input,
  select {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-raised);
    color: var(--text);
    font: inherit;
    font-size: 0.78rem;
  }
  button {
    cursor: pointer;
    padding: 0.45rem 0.65rem;
  }
  button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .refresh {
    flex-shrink: 0;
  }
  .filters {
    display: grid;
    grid-template-columns: minmax(12rem, 2fr) minmax(8rem, 1fr) minmax(7rem, 0.8fr);
    gap: 0.65rem;
  }
  .filters label,
  .archive-path > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.3rem;
  }
  .filters span,
  .archive-path span {
    color: var(--text-faint);
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 0.5rem 0.6rem;
  }
  .summary {
    color: var(--text-muted);
    font-size: 0.76rem;
  }
  .summary strong {
    color: var(--text);
    font-family: var(--font-mono);
  }
  .table-wrap {
    min-height: 0;
    flex: 1;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-sunken);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;
    white-space: nowrap;
  }
  th,
  td {
    border-bottom: 1px solid var(--border);
    padding: 0.55rem 0.65rem;
    text-align: left;
  }
  th {
    position: sticky;
    top: 0;
    background: var(--bg-raised);
    color: var(--text-muted);
    font-size: 0.65rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  td {
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
  td.item {
    color: var(--text);
    font-weight: 600;
    font-family: var(--font-body);
  }
  td.item span,
  td.location span {
    display: block;
  }
  td.item small,
  td.location small {
    display: block;
    margin-top: 0.2rem;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 400;
  }
  td.location {
    font-family: var(--font-body);
  }
  .empty,
  .notice {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-raised);
    color: var(--text-muted);
    padding: 1rem;
    font-size: 0.78rem;
  }
  .empty strong {
    color: var(--text);
  }
  .notice.error {
    border-color: var(--ember);
    color: var(--ember);
  }
  .notice.warning {
    border-color: var(--blue);
  }
  .archive-path {
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
  }
  code {
    overflow: hidden;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 680px) {
    .filters {
      grid-template-columns: 1fr 1fr;
    }
    .filters label:first-child {
      grid-column: 1 / -1;
    }
    .archive-path {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
