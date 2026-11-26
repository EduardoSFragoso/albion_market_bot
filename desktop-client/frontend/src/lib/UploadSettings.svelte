<script>
  import { onMount } from 'svelte';
  import { DashboardService } from '../../bindings/github.com/ao-data/albiondata-client/internal/dashboard/index.js';
  import { t } from './i18n.js';

  const categories = [
    { key: 'MarketOrders', titleKey: 'settings.orders', detailKey: 'settings.ordersDescription' },
    { key: 'MarketHistories', titleKey: 'settings.history', detailKey: 'settings.historyDescription' },
    { key: 'GoldPrices', titleKey: 'settings.gold', detailKey: 'settings.goldDescription' },
    { key: 'WorldData', titleKey: 'settings.world', detailKey: 'settings.worldDescription' },
  ];

  let preferences = $state({ MarketOrders: true, MarketHistories: true, GoldPrices: true, WorldData: true });
  let loading = $state(true);
  let saving = $state(false);
  let message = $state('');
  let error = $state('');

  onMount(async () => {
    try {
      preferences = await DashboardService.GetUploadPreferences();
    } catch (cause) {
      error = $t('settings.loadError', { error: String(cause) });
    } finally {
      loading = false;
    }
  });

  async function setCategory(key, enabled) {
    const next = { ...preferences, [key]: enabled };
    saving = true;
    message = '';
    error = '';
    try {
      await DashboardService.SetUploadPreferences(next);
      preferences = next;
      message = $t('settings.saved');
    } catch (cause) {
      error = $t('settings.saveError', { error: String(cause) });
    } finally {
      saving = false;
    }
  }
</script>

<section class="settings">
  <header>
    <h1>{$t('settings.title')}</h1>
    <p>{$t('settings.description')}</p>
  </header>

  {#if loading}
    <p class="notice">{$t('settings.loading')}</p>
  {:else}
    <div class="choices">
      {#each categories as category}
        <label class="choice">
          <span class="copy">
            <strong>{$t(category.titleKey)}</strong>
            <small>{$t(category.detailKey)}</small>
          </span>
          <input
            type="checkbox"
            checked={preferences[category.key]}
            disabled={saving}
            onchange={(event) => setCategory(category.key, event.currentTarget.checked)}
          />
        </label>
      {/each}
    </div>
  {/if}

  <p class="local-note">{$t('settings.localNote')}</p>
  {#if message}<p class="notice success" role="status">{message}</p>{/if}
  {#if error}<p class="notice error" role="alert">{error}</p>{/if}
</section>

<style>
  .settings {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 1rem;
    overflow: auto;
    padding: 1.25rem;
  }
  h1 { margin: 0; font-size: 1.05rem; font-weight: 650; }
  header p, .local-note, .notice { margin: 0.35rem 0 0; color: var(--text-muted); font-size: 0.78rem; }
  .choices { display: grid; gap: 0.65rem; }
  .choice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-raised);
    padding: 0.85rem 1rem;
    cursor: pointer;
  }
  .copy { display: flex; flex-direction: column; gap: 0.25rem; }
  .copy strong { font-size: 0.84rem; font-weight: 600; }
  .copy small { color: var(--text-muted); font-size: 0.74rem; }
  input { width: 1rem; height: 1rem; accent-color: var(--blue); flex-shrink: 0; }
  input:disabled { cursor: wait; }
  .local-note { border-left: 2px solid var(--blue); padding-left: 0.65rem; }
  .success { color: var(--moss); }
  .error { color: var(--ember); }
</style>
