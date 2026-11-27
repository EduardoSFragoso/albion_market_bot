package marketarchive

import (
	"encoding/csv"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestQueryFilteredMatchesItemCityAndInclusiveDateRange(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "market-orders.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	store.now = func() time.Time { return time.Date(2026, 11, 27, 12, 0, 0, 0, time.UTC) }

	appendOrders(t, store,
		marketOrder{ID: 1, ItemID: "T4_BAG", LocationID: "Thetford Market", AuctionType: "offer"},
		marketOrder{ID: 2, ItemID: "T4_BAG@1", LocationID: "Thetford Market", AuctionType: "request"},
		marketOrder{ID: 3, ItemID: "T4_BAG", LocationID: "Martlock Market", AuctionType: "offer"},
	)
	store.mu.Lock()
	entries := readEntries(t, store.path)
	entries[0].CapturedAt = time.Date(2026, 11, 25, 23, 59, 0, 0, time.UTC)
	entries[1].CapturedAt = time.Date(2026, 11, 26, 0, 0, 0, 0, time.UTC)
	entries[2].CapturedAt = time.Date(2026, 11, 27, 0, 0, 0, 0, time.UTC)
	writeEntries(t, store.path, entries)
	store.mu.Unlock()

	from := time.Date(2026, 11, 26, 0, 0, 0, 0, time.UTC)
	before := time.Date(2026, 11, 27, 0, 0, 0, 0, time.UTC)
	result, err := store.QueryFiltered(QueryFilter{
		ItemID:   "bag",
		Location: "thetford",
		From:     &from,
		Before:   &before,
	}, 200)
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 1 || len(result.Orders) != 1 || result.Orders[0].ID != 2 {
		t.Fatalf("QueryFiltered() = total %d rows %+v, want only order 2", result.Total, result.Orders)
	}
}

func TestExportCSVWritesEveryFilteredRowAndEscapesSpreadsheetFormula(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "market-orders.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	capturedAt := time.Date(2026, 11, 27, 10, 30, 0, 0, time.UTC)
	store.now = func() time.Time { return capturedAt }

	orders := make([]marketOrder, 0, 251)
	for i := 1; i <= 250; i++ {
		orders = append(orders, marketOrder{
			ID: i, ItemID: "T4_BAG", LocationID: "Thetford, Market", AuctionType: "offer",
			Price: i * 100, Amount: 2, QualityLevel: 1,
		})
	}
	orders = append(orders,
		marketOrder{ID: 251, ItemID: "=T4_BAG", LocationID: "Thetford, Market", AuctionType: "offer"},
		marketOrder{ID: 252, ItemID: "T4_BAG", LocationID: "Martlock", AuctionType: "offer"},
		marketOrder{ID: 253, ItemID: "T5_CAPE", LocationID: "Thetford, Market", AuctionType: "offer"},
	)
	appendOrders(t, store, orders...)

	from := capturedAt.Add(-time.Hour)
	before := capturedAt.Add(time.Hour)
	destination := filepath.Join(t.TempDir(), "orders.csv")
	exported, err := store.ExportCSV(destination, QueryFilter{
		ItemID:   "bag",
		Location: "Thetford",
		From:     &from,
		Before:   &before,
	})
	if err != nil {
		t.Fatal(err)
	}
	if exported.Exported != 251 {
		t.Fatalf("ExportCSV() exported %d rows, want 251", exported.Exported)
	}
	if exported.Path != destination {
		t.Fatalf("ExportCSV() path = %q, want %q", exported.Path, destination)
	}

	data, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	data = bytesWithoutUTF8BOM(data)
	reader := csv.NewReader(strings.NewReader(string(data)))
	header, err := reader.Read()
	if err != nil {
		t.Fatal(err)
	}
	if got, want := strings.Join(header, ","), "captured_at_utc,region,city,item_id,item_group_id,auction_type,quantity,unit_price_silver,quality,enchantment,expires"; got != want {
		t.Fatalf("CSV header = %q, want %q", got, want)
	}
	rows := 0
	formulaEscaped := false
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		rows++
		if row[0] != "2026-11-27T10:30:00Z" || row[2] != "Thetford, Market" {
			t.Fatalf("CSV row did not preserve timestamp/quoted city: %#v", row)
		}
		if row[3] == "'=T4_BAG" {
			formulaEscaped = true
		}
	}
	if rows != 251 {
		t.Fatalf("CSV contains %d rows, want 251", rows)
	}
	if !formulaEscaped {
		t.Fatal("CSV left a formula-like item ID unescaped")
	}
}

func TestExportCSVRejectsArchivePathAndNonCSVExtension(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "market-orders.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.ExportCSV(store.Path(), QueryFilter{}); err == nil {
		t.Fatal("ExportCSV() allowed overwriting the source archive")
	}
	if _, err := store.ExportCSV(filepath.Join(t.TempDir(), "orders.jsonl"), QueryFilter{}); err == nil {
		t.Fatal("ExportCSV() accepted a non-CSV path")
	}
}

func TestExportCSVCreatesHeaderForMissingArchive(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "not-created-yet.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	destination := filepath.Join(t.TempDir(), "empty.csv")
	if err := os.WriteFile(destination, []byte("old export"), 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := store.ExportCSV(destination, QueryFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Exported != 0 {
		t.Fatalf("ExportCSV() exported %d rows, want 0", result.Exported)
	}
	if _, err := os.Stat(destination); err != nil {
		t.Fatalf("ExportCSV() did not create an empty export with its header: %v", err)
	}
	data, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := csv.NewReader(strings.NewReader(string(bytesWithoutUTF8BOM(data)))).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0][0] != "captured_at_utc" {
		t.Fatalf("empty CSV rows = %#v, want only the header", rows)
	}
}

func appendOrders(t *testing.T, store *Store, orders ...marketOrder) {
	t.Helper()
	payload, err := json.Marshal(uploadPayload{Orders: orders})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.AppendPayload(payload, "West"); err != nil {
		t.Fatal(err)
	}
}

func readEntries(t *testing.T, path string) []Entry {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	entries := make([]Entry, 0, len(lines))
	for _, line := range lines {
		var entry Entry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatal(err)
		}
		entries = append(entries, entry)
	}
	return entries
}

func writeEntries(t *testing.T, path string, entries []Entry) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	encoder := json.NewEncoder(file)
	for _, entry := range entries {
		if err := encoder.Encode(entry); err != nil {
			file.Close()
			t.Fatal(err)
		}
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func bytesWithoutUTF8BOM(data []byte) []byte {
	if len(data) >= 3 && data[0] == 0xef && data[1] == 0xbb && data[2] == 0xbf {
		return data[3:]
	}
	return data
}
