<script>
  import { onDestroy } from 'svelte';
  import { Events } from '@wailsio/runtime';
  import { DashboardService } from '../../bindings/github.com/ao-data/albiondata-client/internal/dashboard/index.js';
  import { t } from './i18n.js';

  const labels = [
    ['marketorders.ingest', 'counter.orders'],
    ['goldprices.ingest', 'counter.gold'],
    ['markethistories.ingest', 'counter.history'],
    ['mapdata.ingest', 'counter.map'],
    ['festivities.ingest', 'counter.festivities'],
    ['banditevent.ingest', 'counter.bandit'],
  ];

  let counts = $state({});

  DashboardService.GetUploadCounts().then((c) => (counts = c));

  const unlisten = Events.On('counters:snapshot', (evt) => {
    counts = evt.data;
  });

  onDestroy(unlisten);
</script>

<section class="counters">
  <span class="section-label">{$t('counter.section')}</span>
  {#each labels as [topic, labelKey]}
    <div class="counter">
      <span class="label">{$t(labelKey)}</span>
      <span class="value">{counts[topic] ?? 0}</span>
    </div>
  {/each}
</section>

<style>
  .counters {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding-top: 1.15rem;
    border-top: 1px solid var(--border);
  }
  .counter {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .section-label {
    margin-bottom: 0.15rem;
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 600;
  }
  .label {
    font-size: 0.66rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .value {
    font-family: var(--font-mono);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--blue-bright);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
</style>
