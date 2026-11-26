// Package preferences persists choices that affect local app behavior.
package preferences

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

// UploadCategories controls public AODP topics. WorldData groups map,
// festivities, and bandit event updates.
type UploadCategories struct {
	MarketOrders    bool
	MarketHistories bool
	GoldPrices      bool
	WorldData       bool
}

// DefaultUploadCategories preserves the client's current behavior.
func DefaultUploadCategories() UploadCategories {
	return UploadCategories{
		MarketOrders:    true,
		MarketHistories: true,
		GoldPrices:      true,
		WorldData:       true,
	}
}

// Store keeps upload choices in a local JSON file outside the repository.
type Store struct {
	path string
	mu   sync.RWMutex
	data UploadCategories
}

func OpenDefault() (*Store, error) {
	root, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	return Open(filepath.Join(root, "AlbionMarketPersonal", "upload-preferences.json"))
}

func Open(path string) (*Store, error) {
	if path == "" {
		return nil, errors.New("upload preferences path is empty")
	}
	store := &Store{path: path, data: DefaultUploadCategories()}
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	if err := json.NewDecoder(file).Decode(&store.data); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) Get() UploadCategories {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data
}

// Set persists choices before publishing them to the live uploader.
func (s *Store) Set(value UploadCategories) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(s.path), ".upload-preferences-*")
	if err != nil {
		return err
	}
	tempPath := file.Name()
	defer os.Remove(tempPath)
	if err := file.Chmod(0o600); err != nil {
		file.Close()
		return err
	}
	if err := json.NewEncoder(file).Encode(value); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(tempPath, s.path); err != nil {
		return err
	}
	s.data = value
	return nil
}
