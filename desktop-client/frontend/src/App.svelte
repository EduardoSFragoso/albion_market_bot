<script>
  import Sidebar from './lib/Sidebar.svelte';
  import MarketArchive from './lib/MarketArchive.svelte';
  import LogTail from './lib/LogTail.svelte';
  import UploadSettings from './lib/UploadSettings.svelte';
  import SessionDashboard from './lib/SessionDashboard.svelte';
  import Footer from './lib/Footer.svelte';
  import { language, setLanguage, t } from './lib/i18n.js';

  let activeView = $state('archive');

  function toggleLanguage() {
    setLanguage($language === 'pt-BR' ? 'en' : 'pt-BR');
  }
</script>

<main>
  <div class="body">
    <Sidebar />
    <div class="content">
      <nav class="views" aria-label={$t('app.navLabel')}>
        <button class:active={activeView === 'archive'} onclick={() => (activeView = 'archive')}>
          {$t('nav.archive')}
        </button>
        <button class:active={activeView === 'session'} onclick={() => (activeView = 'session')}>
          {$t('nav.session')}
        </button>
        <button class:active={activeView === 'logs'} onclick={() => (activeView = 'logs')}>
          {$t('nav.logs')}
        </button>
        <button class:active={activeView === 'settings'} onclick={() => (activeView = 'settings')}>
          {$t('nav.uploads')}
        </button>
        <button class="language" onclick={toggleLanguage} title={$t('app.language')} aria-label={$t('app.language')}>
          {$language === 'pt-BR' ? 'PT' : 'EN'}
        </button>
      </nav>
      {#if activeView === 'archive'}
        <MarketArchive />
      {:else if activeView === 'session'}
        <SessionDashboard />
      {:else if activeView === 'logs'}
        <LogTail />
      {:else}
        <UploadSettings />
      {/if}
    </div>
  </div>
  <Footer />
</main>

<style>
  :global(:root) {
    /* charcoal surfaces */
    --bg: #14171c;
    --bg-raised: #1c2128;
    --bg-sunken: #0d0f13;
    --border: rgba(231, 234, 239, 0.08);
    --border-strong: rgba(231, 234, 239, 0.16);

    /* cool text */
    --text: #e7eaef;
    --text-muted: #8d94a3;
    --text-faint: #5a6070;

    /* single accent: electric blue */
    --blue: #2f8cff;
    --blue-bright: #5fb4ff;
    --blue-soft: rgba(47, 140, 255, 0.14);

    /* status */
    --ready: var(--text-muted);
    --ready-soft: rgba(141, 148, 163, 0.12);
    --ember: #c1543f;
    --ember-soft: rgba(193, 84, 63, 0.16);
    --moss: #6d9c5f;
    --moss-soft: rgba(109, 156, 95, 0.16);

    --radius: 7px;
    --radius-sm: 5px;

    --font-display: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
    --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
  }
  :global(html, body) {
    margin: 0;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
  }
  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    background: var(--bg);
  }
  .views {
    display: flex;
    gap: 0.5rem;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-raised);
  }
  .views button {
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font: inherit;
    font-size: 0.82rem;
    padding: 0.45rem 0.7rem;
  }
  .views button:hover,
  .views button.active {
    background: var(--blue-soft);
    border-color: rgba(47, 140, 255, 0.25);
    color: var(--blue-bright);
  }
  .views button.language {
    margin-left: auto;
    border-color: var(--border-strong);
    color: var(--text);
  }
</style>
