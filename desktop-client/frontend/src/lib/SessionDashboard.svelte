<script>
  import { onDestroy, onMount } from 'svelte';
  import { Events } from '@wailsio/runtime';
  import { DashboardService } from '../../bindings/github.com/ao-data/albiondata-client/internal/dashboard/index.js';
  import { language, t } from './i18n.js';

  let numberFormat = $derived(new Intl.NumberFormat($language === 'en' ? 'en-US' : 'pt-BR'));
  const labels = [
    ['marketorders.ingest', 'counter.orders'],
    ['markethistories.ingest', 'counter.history'],
    ['goldprices.ingest', 'counter.gold'],
    ['mapdata.ingest', 'counter.map'],
    ['festivities.ingest', 'counter.festivities'],
    ['banditevent.ingest', 'counter.bandit'],
  ];
  const activityMessageKeys = {
    'Captura do jogo detectada': 'activity.captureDetected',
    'Captura ficou inativa': 'activity.captureIdle',
    'A captura parou por erro': 'activity.captureError',
    'ordens de mercado observados': 'activity.ordersObserved',
    'histórico de mercado observados': 'activity.historyObserved',
    'preços do ouro observados': 'activity.goldObserved',
    'dados de mapa observados': 'activity.mapObserved',
    'festividades observados': 'activity.festivitiesObserved',
    'eventos de bandido observados': 'activity.banditObserved',
  };

  let stats = $state({ StartedAt: '', ElapsedSeconds: 0, DecodedMessages: 0, CaptureRunning: false });
  let counts = $state({});
  let activity = $state([]);
  let loadError = $state('');
  let refreshTimer;

  async function refresh() {
    try {
      [stats, counts, activity] = await Promise.all([
        DashboardService.GetSessionStats(),
        DashboardService.GetUploadCounts(),
        DashboardService.GetRecentActivity(),
      ]);
    } catch (error) {
      loadError = $t('session.refreshError', { error: String(error) });
    }
  }

  onMount(() => {
    refresh();
    refreshTimer = setInterval(refresh, 1000);
  });
  const unlistenActivity = Events.On('activity:line', (event) => {
    activity = [event.data, ...activity].slice(0, 100);
  });
  const unlistenCounts = Events.On('counters:snapshot', (event) => {
    counts = event.data;
  });

  onDestroy(() => {
    clearInterval(refreshTimer);
    unlistenActivity();
    unlistenCounts();
  });

  function formatDuration(seconds) {
    const value = Math.max(0, seconds || 0);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const rest = value % 60;
    return hours > 0
      ? $t('duration.hoursMinutes', { hours, minutes })
      : minutes > 0
        ? $t('duration.minutesSeconds', { minutes, seconds: rest })
        : $t('duration.seconds', { seconds: rest });
  }

  function formatStart(value) {
    if (!value) return $t('session.awaiting');
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString($language === 'en' ? 'en-US' : 'pt-BR');
  }

  function formatActivityMessage(event) {
    const key = activityMessageKeys[event.Message];
    if (key) return $t(key);

    const serverPrefix = 'Servidor detectado: ';
    if (event.Message.startsWith(serverPrefix)) {
      return $t('activity.serverDetected', { server: event.Message.slice(serverPrefix.length) });
    }
    return event.Message;
  }
</script>

<section class="session">
  <header>
    <div>
      <h1>{$t('session.title')}</h1>
      <p>{stats.CaptureRunning ? $t('session.activeNow') : stats.StartedAt ? $t('session.last') : $t('session.noActivity')}</p>
    </div>
    <span class="badge" class:active={stats.CaptureRunning}>{stats.CaptureRunning ? $t('session.capturing') : $t('session.inactive')}</span>
  </header>

  <div class="summary">
    <article><span>{$t('session.duration')}</span><strong>{formatDuration(stats.ElapsedSeconds)}</strong></article>
    <article><span>{$t('session.messagesRead')}</span><strong>{numberFormat.format(stats.DecodedMessages)}</strong></article>
    <article><span>{$t('session.started')}</span><strong class="start-time">{formatStart(stats.StartedAt)}</strong></article>
  </div>

  {#if loadError}<p class="error" role="alert">{loadError}</p>{/if}

  <section class="counts">
    <h2>{$t('session.records')}</h2>
    <div class="count-grid">
      {#each labels as [topic, labelKey]}
        <article><span>{$t(labelKey)}</span><strong>{numberFormat.format(counts[topic] ?? 0)}</strong></article>
      {/each}
    </div>
  </section>

  <section class="feed">
    <h2>{$t('session.activity')}</h2>
    {#if activity.length}
      <ol>
        {#each activity as event, index (`${event.Time}-${event.Kind}-${index}`)}
          <li class={event.Kind}>
            <time>{event.Time}</time>
            {#if event.Count}<strong>{numberFormat.format(event.Count)}</strong>{/if}
            <span>{formatActivityMessage(event)}</span>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="empty">{$t('session.empty')}</p>
    {/if}
  </section>
</section>

<style>
  .session { display:flex; flex:1; min-height:0; flex-direction:column; gap:1rem; overflow:auto; padding:1.25rem; }
  header { display:flex; justify-content:space-between; align-items:center; gap:1rem; }
  h1 { margin:0; font-size:1.05rem; font-weight:650; }
  h2 { margin:0 0 0.7rem; font-size:0.82rem; font-weight:650; }
  p { margin:0.3rem 0 0; color:var(--text-muted); font-size:0.76rem; }
  .badge { border-radius:999px; background:var(--ready-soft); color:var(--ready); padding:0.3rem 0.65rem; font-size:0.74rem; }
  .badge.active { background:var(--blue-soft); color:var(--blue-bright); }
  .summary, .count-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(9rem, 1fr)); gap:0.65rem; }
  article { display:flex; min-width:0; flex-direction:column; gap:0.35rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--bg-raised); padding:0.75rem; }
  article span { color:var(--text-muted); font-size:0.72rem; }
  article strong { font-family:var(--font-mono); font-size:1rem; font-variant-numeric:tabular-nums; }
  .start-time { font-family:var(--font-body); font-size:0.76rem; font-weight:500; }
  .counts, .feed { border:1px solid var(--border); border-radius:var(--radius); background:var(--bg-raised); padding:0.85rem; }
  .count-grid article { background:var(--bg-sunken); }
  .feed { display:flex; min-height:10rem; flex:1; flex-direction:column; }
  ol { display:flex; flex-direction:column; gap:0.5rem; overflow:auto; margin:0; padding:0; list-style:none; }
  li { display:grid; grid-template-columns:4.5rem auto 1fr; align-items:baseline; gap:0.6rem; font-size:0.78rem; }
  time { color:var(--text-faint); font-family:var(--font-mono); font-size:0.72rem; }
  li strong { color:var(--blue-bright); font-family:var(--font-mono); }
  li.error span { color:var(--ember); }
  .empty { padding:1rem 0; }
  .error { color:var(--ember); }
  @media (max-width: 700px) { li { grid-template-columns:4.5rem auto; } li span { grid-column:2; } }
</style>
