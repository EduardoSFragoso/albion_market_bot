package marketarchive

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAppendPayloadAndQueryKeepNewestMatches(t *testing.T) {
	path := filepath.Join(t.TempDir(), "archive", "market-orders.jsonl")
	store, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	fixedTime := time.Date(2026, time.November, 26, 12, 34, 56, 0, time.UTC)
	store.now = func() time.Time { return fixedTime }

	payload := []byte(`{"Orders":[` +
		`{"Id":1,"ItemTypeId":"T4_BAG","LocationId":"1001","AuctionType":"offer","UnitPriceSilver":1200,"Amount":4},` +
		`{"Id":2,"ItemTypeId":"T4_BAG@1","LocationId":"1002","AuctionType":"offer","UnitPriceSilver":2300,"Amount":2},` +
		`{"Id":3,"ItemTypeId":"T5_BAG","LocationId":"1001","AuctionType":"request","UnitPriceSilver":3400,"Amount":1}` +
		`]}`)
	if err := store.AppendPayload(payload, "West"); err != nil {
		t.Fatal(err)
	}

	result, err := store.Query("bag", "1001", "west", 1)
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 2 || len(result.Orders) != 1 {
		t.Fatalf("Query() returned total=%d rows=%d, want total=2 rows=1", result.Total, len(result.Orders))
	}
	if got := result.Orders[0]; got.ItemID != "T5_BAG" || got.Region != "West" || !got.CapturedAt.Equal(fixedTime) {
		t.Fatalf("Query() newest entry = %+v, want T5_BAG captured in West at %s", got, fixedTime)
	}

	all, err := store.Query("", "", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	wantOrder := []string{"T5_BAG", "T4_BAG@1", "T4_BAG"}
	if len(all.Orders) != len(wantOrder) {
		t.Fatalf("Query() returned %d rows, want %d", len(all.Orders), len(wantOrder))
	}
	for i, itemID := range wantOrder {
		if got := all.Orders[i].ItemID; got != itemID {
			t.Errorf("Query() row %d item = %q, want %q", i, got, itemID)
		}
	}
}

func TestAppendPayloadRejectsMalformedBatchWithoutCreatingArchive(t *testing.T) {
	path := filepath.Join(t.TempDir(), "market-orders.jsonl")
	store, err := New(path)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.AppendPayload([]byte(`{"Orders":[`), "West"); err == nil {
		t.Fatal("AppendPayload() accepted malformed JSON")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("archive exists after malformed input; stat error = %v", err)
	}
}

func TestQueryMissingArchiveReturnsEmptyResult(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "missing.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	result, err := store.Query("", "", "", 25)
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 0 || len(result.Orders) != 0 {
		t.Fatalf("Query() = %+v, want an empty result", result)
	}
}

func TestPruneOlderThanRemovesExpiredOrdersAndKeepsUnreadableLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "archive", "market-orders.jsonl")
	store, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, time.November, 26, 12, 0, 0, 0, time.UTC)
	store.now = func() time.Time { return now }
	if err := store.AppendPayload([]byte(`{"Orders":[{"Id":1,"ItemTypeId":"OLD"}]}`), "West"); err != nil {
		t.Fatal(err)
	}
	now = now.Add(DefaultRetention + time.Hour)
	if err := store.AppendPayload([]byte(`{"Orders":[{"Id":2,"ItemTypeId":"NEW"}]}`), "West"); err != nil {
		t.Fatal(err)
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.WriteString("not-json\n"); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	removed, err := store.PruneOlderThan(DefaultRetention)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("PruneOlderThan() removed %d rows, want 1", removed)
	}
	result, err := store.Query("", "", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 1 || result.Orders[0].ItemID != "NEW" || result.InvalidLines != 1 {
		t.Fatalf("Query() after prune = %+v, want NEW and one preserved invalid line", result)
	}
}

func TestPruneOlderThanMissingArchiveAndInvalidRetention(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "missing.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if removed, err := store.PruneOlderThan(DefaultRetention); err != nil || removed != 0 {
		t.Fatalf("PruneOlderThan() missing archive = %d, %v; want 0, nil", removed, err)
	}
	if _, err := store.PruneOlderThan(0); err == nil {
		t.Fatal("PruneOlderThan() accepted zero retention")
	}
}
