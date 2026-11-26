package client

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/ao-data/albiondata-client/internal/dashboard"
	"github.com/ao-data/albiondata-client/internal/marketarchive"
	"github.com/ao-data/albiondata-client/internal/preferences"
	"github.com/ao-data/albiondata-client/lib"
)

func TestPublicUploadCategoriesAreAllSentByDefault(t *testing.T) {
	var mu sync.Mutex
	got := make(map[string]bool)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		got[r.URL.Path] = true
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	previousPublic := ConfigGlobal.PublicIngestBaseUrls
	previousPrivate := ConfigGlobal.PrivateIngestBaseUrls
	previousDisabled := ConfigGlobal.DisableUpload
	previousWebsockets := ConfigGlobal.EnableWebsockets
	ConfigGlobal.PublicIngestBaseUrls = server.URL
	ConfigGlobal.PrivateIngestBaseUrls = ""
	ConfigGlobal.DisableUpload = false
	ConfigGlobal.EnableWebsockets = false
	t.Cleanup(func() {
		ConfigGlobal.PublicIngestBaseUrls = previousPublic
		ConfigGlobal.PrivateIngestBaseUrls = previousPrivate
		ConfigGlobal.DisableUpload = previousDisabled
		ConfigGlobal.EnableWebsockets = previousWebsockets
	})

	topics := []string{
		lib.NatsMarketOrdersIngest,
		lib.NatsMarketHistoriesIngest,
		lib.NatsGoldPricesIngest,
		lib.NatsMapDataIngest,
		lib.NatsFestivitiesIngest,
		lib.NatsBanditEvent,
	}
	for _, topic := range topics {
		sendMsgToPublicUploaders(struct{}{}, topic, &albionState{AODataServerID: 1}, "test", 1)
	}

	mu.Lock()
	defer mu.Unlock()
	for _, topic := range topics {
		if !got["/"+topic] {
			t.Errorf("default behavior did not send topic %q", topic)
		}
	}
}

func TestDisabledMarketOrderUploadStillKeepsLocalArchive(t *testing.T) {
	requests := make(chan string, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests <- r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	store, err := marketarchive.New(t.TempDir() + "/market-orders.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	previousArchive := currentMarketArchiveStore()
	SetMarketArchiveStore(store)
	t.Cleanup(func() { SetMarketArchiveStore(previousArchive) })

	prefs, err := preferences.Open(t.TempDir() + "/upload-preferences.json")
	if err != nil {
		t.Fatal(err)
	}
	wantPrefs := preferences.DefaultUploadCategories()
	wantPrefs.MarketOrders = false
	if err := prefs.Set(wantPrefs); err != nil {
		t.Fatal(err)
	}
	previousPrefs := currentUploadPreferencesStore()
	SetUploadPreferencesStore(prefs)
	t.Cleanup(func() { SetUploadPreferencesStore(previousPrefs) })

	previousPublic := ConfigGlobal.PublicIngestBaseUrls
	previousPrivate := ConfigGlobal.PrivateIngestBaseUrls
	previousDisabled := ConfigGlobal.DisableUpload
	previousWebsockets := ConfigGlobal.EnableWebsockets
	ConfigGlobal.PublicIngestBaseUrls = server.URL
	ConfigGlobal.PrivateIngestBaseUrls = ""
	ConfigGlobal.DisableUpload = false
	ConfigGlobal.EnableWebsockets = false
	t.Cleanup(func() {
		ConfigGlobal.PublicIngestBaseUrls = previousPublic
		ConfigGlobal.PrivateIngestBaseUrls = previousPrivate
		ConfigGlobal.DisableUpload = previousDisabled
		ConfigGlobal.EnableWebsockets = previousWebsockets
	})

	upload := lib.MarketUpload{Orders: []*lib.MarketOrder{{ItemID: "T4_BAG", LocationID: "1001", AuctionType: "offer", Price: 1200, Amount: 1}}}
	beforeOrders := dashboard.GetUploadCounts()[lib.NatsMarketOrdersIngest]
	sendMsgToPublicUploaders(upload, lib.NatsMarketOrdersIngest, &albionState{AODataServerID: 1}, "disabled-test", 1)
	result, err := store.Query("T4_BAG", "1001", "West", 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 1 {
		t.Fatalf("local archive has %d orders, want 1 with market upload disabled", result.Total)
	}
	if after := dashboard.GetUploadCounts()[lib.NatsMarketOrdersIngest]; after != beforeOrders {
		t.Fatalf("disabled market upload counter = %d, want unchanged %d", after, beforeOrders)
	}
	select {
	case path := <-requests:
		t.Fatalf("disabled market order category was uploaded to %s", path)
	default:
	}

	sendMsgToPublicUploaders(struct{}{}, lib.NatsGoldPricesIngest, &albionState{AODataServerID: 1}, "enabled-test", 1)
	select {
	case path := <-requests:
		if path != "/"+lib.NatsGoldPricesIngest {
			t.Fatalf("enabled gold category uploaded to %s", path)
		}
	default:
		t.Fatal("enabled gold category was not uploaded")
	}
}

func currentUploadPreferencesStore() *preferences.Store {
	uploadPrefsMu.RLock()
	defer uploadPrefsMu.RUnlock()
	return uploadPrefs
}

// TestCreateUploaders_ReusesUploaderForSameTarget guards against the
// memory leak where every upload call constructed brand new uploaders
// (a fresh NATS connection that was never closed, a fresh http.Transport
// whose idle connections were never reclaimed) instead of reusing one
// per ingest target.
func TestCreateUploaders_ReusesUploaderForSameTarget(t *testing.T) {
	target := "https://example.com/TestCreateUploaders_ReusesUploaderForSameTarget"

	first := createUploaders([]string{target})
	second := createUploaders([]string{target})

	if len(first) != 1 || len(second) != 1 {
		t.Fatalf("got %d and %d uploaders, want 1 and 1", len(first), len(second))
	}
	if first[0] != second[0] {
		t.Fatal("createUploaders returned a different uploader instance for the same target")
	}
}

func TestSendMsgToPublicUploaders_IncrementsCounterByRecordCount(t *testing.T) {
	// No configured ingest targets: createUploaders returns nothing for
	// both public and private, so this exercises the counter increment
	// without making any network calls.
	ConfigGlobal.PublicIngestBaseUrls = ""
	ConfigGlobal.PrivateIngestBaseUrls = ""

	before := dashboard.GetUploadCounts()["marketorders.ingest"]

	sendMsgToPublicUploaders(struct{}{}, lib.NatsMarketOrdersIngest, &albionState{}, "test-id", 50)

	after := dashboard.GetUploadCounts()["marketorders.ingest"]
	if after != before+50 {
		t.Fatalf("marketorders.ingest counter = %d, want %d", after, before+50)
	}
}

func TestSendMsgToPublicUploaders_ArchivesMarketOrders(t *testing.T) {
	store, err := marketarchive.New(t.TempDir() + "/market-orders.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	previousStore := currentMarketArchiveStore()
	SetMarketArchiveStore(store)
	t.Cleanup(func() { SetMarketArchiveStore(previousStore) })

	previousPublic := ConfigGlobal.PublicIngestBaseUrls
	previousPrivate := ConfigGlobal.PrivateIngestBaseUrls
	ConfigGlobal.PublicIngestBaseUrls = ""
	ConfigGlobal.PrivateIngestBaseUrls = ""
	t.Cleanup(func() {
		ConfigGlobal.PublicIngestBaseUrls = previousPublic
		ConfigGlobal.PrivateIngestBaseUrls = previousPrivate
	})

	upload := lib.MarketUpload{Orders: []*lib.MarketOrder{{
		ItemID:      "T4_BAG",
		LocationID:  "1001",
		AuctionType: "offer",
		Price:       1200,
		Amount:      4,
	}}}
	sendMsgToPublicUploaders(upload, lib.NatsMarketOrdersIngest, &albionState{AODataServerID: 1}, "test-id", 1)

	result, err := store.Query("T4_BAG", "1001", "West", 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 1 || len(result.Orders) != 1 {
		t.Fatalf("local archive contains %d matches, want 1", result.Total)
	}
}
