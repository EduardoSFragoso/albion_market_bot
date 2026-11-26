package preferences

import (
	"path/filepath"
	"testing"
)

func TestOpenMissingPreferencesPreservesCurrentUploadDefaults(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "settings", "uploads.json"))
	if err != nil {
		t.Fatal(err)
	}
	if got, want := store.Get(), DefaultUploadCategories(); got != want {
		t.Fatalf("Open() defaults = %+v, want %+v", got, want)
	}
}

func TestUploadPreferencesPersistAcrossOpen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings", "uploads.json")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	want := UploadCategories{MarketOrders: false, MarketHistories: true, GoldPrices: false, WorldData: true}
	if err := store.Set(want); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := reopened.Get(); got != want {
		t.Fatalf("reopened preferences = %+v, want %+v", got, want)
	}
}
