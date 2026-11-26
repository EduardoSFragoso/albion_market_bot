<script>
  import { onDestroy } from 'svelte';
  import { Events } from '@wailsio/runtime';
  import { DashboardService } from '../../bindings/github.com/ao-data/albiondata-client/internal/dashboard/index.js';
  import { t } from './i18n.js';

  let version = $state('');

  DashboardService.GetStatus().then((s) => (version = s.Version));

  const unlisten = Events.On('status:changed', (evt) => {
    version = evt.data.Version;
  });

  onDestroy(unlisten);

</script>

<footer class="footer">
  <span class="footer-label">{$t('footer.label')}</span>
  <span class="version">v{version || 'dev'}</span>
</footer>

<style>
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 1.25rem;
    background: var(--bg-raised);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .footer-label {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .version {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-faint);
  }
</style>
