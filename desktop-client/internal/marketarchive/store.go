// Package marketarchive keeps a local, append-only copy of market orders
// observed by the AODP client. The JSONL format stays readable and portable.
package marketarchive

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	maxPageSize      = 200
	maxRecordSize    = 1 << 20
	DefaultRetention = 30 * 24 * time.Hour
)

// marketOrder mirrors the public order payload used to decode AODP batches.
type marketOrder struct {
	ID               int    `json:"Id"`
	ItemID           string `json:"ItemTypeId"`
	GroupTypeID      string `json:"ItemGroupTypeId"`
	LocationID       string `json:"LocationId"`
	QualityLevel     int    `json:"QualityLevel"`
	EnchantmentLevel int    `json:"EnchantmentLevel"`
	Price            int    `json:"UnitPriceSilver"`
	Amount           int    `json:"Amount"`
	AuctionType      string `json:"AuctionType"`
	Expires          string `json:"Expires"`
}

// Entry is the stable local archive schema and the model shown in the UI.
type Entry struct {
	CapturedAt       time.Time
	Region           string
	ID               int
	ItemID           string
	GroupTypeID      string
	LocationID       string
	QualityLevel     int
	EnchantmentLevel int
	Price            int
	Amount           int
	AuctionType      string
	Expires          string
}

// Result contains the newest matching records and the total number of matches.
type Result struct {
	Orders       []Entry
	Total        int64
	InvalidLines int64
	Path         string
	Error        string
}

// Store serializes reads and writes to one local JSONL archive.
type Store struct {
	path string
	mu   sync.RWMutex
	now  func() time.Time
}

type uploadPayload struct {
	Orders []marketOrder `json:"Orders"`
}

// New creates a store at path. The file and parent directory are created on
// the first successful append.
func New(path string) (*Store, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("market archive path is empty")
	}
	return &Store{path: path, now: time.Now}, nil
}

// OpenDefault places persistent data in the user's local application data
// directory, not in the repository or the game installation.
func OpenDefault() (*Store, error) {
	root, err := os.UserCacheDir()
	if err != nil {
		return nil, err
	}
	return New(filepath.Join(root, "AlbionMarketPersonal", "market-orders.jsonl"))
}

func (s *Store) Path() string {
	return s.path
}

// AppendPayload stores each market order from the same JSON payload sent to
// AODP. A malformed payload is rejected as a whole, avoiding partial batches.
func (s *Store) AppendPayload(payload []byte, region string) error {
	var upload uploadPayload
	if err := json.Unmarshal(payload, &upload); err != nil {
		return err
	}
	if len(upload.Orders) == 0 {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}

	capturedAt := s.now().UTC()
	var batch bytes.Buffer
	encoder := json.NewEncoder(&batch)
	for _, order := range upload.Orders {
		if err := encoder.Encode(Entry{
			CapturedAt:       capturedAt,
			Region:           region,
			ID:               order.ID,
			ItemID:           order.ItemID,
			GroupTypeID:      order.GroupTypeID,
			LocationID:       order.LocationID,
			QualityLevel:     order.QualityLevel,
			EnchantmentLevel: order.EnchantmentLevel,
			Price:            order.Price,
			Amount:           order.Amount,
			AuctionType:      order.AuctionType,
			Expires:          order.Expires,
		}); err != nil {
			return err
		}
	}

	file, err := os.OpenFile(s.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	writeErr := writeAll(file, batch.Bytes())
	if writeErr == nil {
		writeErr = file.Sync()
	}
	closeErr := file.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}

// PruneOlderThan removes valid records captured before the retention cutoff.
// Malformed lines are kept so cleanup never discards data it cannot interpret.
func (s *Store) PruneOlderThan(retention time.Duration) (int64, error) {
	if retention <= 0 {
		return 0, errors.New("market archive retention must be positive")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	source, err := os.Open(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}

	temp, err := os.CreateTemp(filepath.Dir(s.path), ".market-orders-prune-*")
	if err != nil {
		source.Close()
		return 0, err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)

	cutoff := s.now().UTC().Add(-retention)
	var removed int64
	scanner := bufio.NewScanner(source)
	scanner.Buffer(make([]byte, 64*1024), maxRecordSize)
	for scanner.Scan() {
		line := scanner.Bytes()
		var entry Entry
		if json.Unmarshal(line, &entry) == nil && entry.CapturedAt.Before(cutoff) {
			removed++
			continue
		}
		if err := writeAll(temp, append(append([]byte(nil), line...), '\n')); err != nil {
			source.Close()
			temp.Close()
			return 0, err
		}
	}
	if err := scanner.Err(); err != nil {
		source.Close()
		temp.Close()
		return 0, err
	}
	if err := source.Close(); err != nil {
		temp.Close()
		return 0, err
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return 0, err
	}
	if err := temp.Close(); err != nil {
		return 0, err
	}
	if removed == 0 {
		return 0, nil
	}
	if err := os.Rename(tempPath, s.path); err != nil {
		return 0, err
	}
	return removed, nil
}

// Query scans the archive without retaining the whole dump in memory. It
// returns at most the newest maxPageSize matching rows in reverse chronology.
func (s *Store) Query(search, locationID, region string, limit int) (Result, error) {
	if limit < 1 || limit > maxPageSize {
		limit = maxPageSize
	}
	search = strings.ToLower(strings.TrimSpace(search))
	locationID = strings.ToLower(strings.TrimSpace(locationID))
	region = strings.ToLower(strings.TrimSpace(region))

	s.mu.RLock()
	defer s.mu.RUnlock()

	result := Result{Orders: make([]Entry, 0, limit), Path: s.path}
	file, err := os.Open(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	defer file.Close()

	window := make([]Entry, limit)
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), maxRecordSize)
	for scanner.Scan() {
		var entry Entry
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			result.InvalidLines++
			continue
		}
		if !matches(entry, search, locationID, region) {
			continue
		}
		window[result.Total%int64(limit)] = entry
		result.Total++
	}
	if err := scanner.Err(); err != nil {
		return result, err
	}

	count := result.Total
	if count > int64(limit) {
		count = int64(limit)
	}
	for i := int64(0); i < count; i++ {
		index := (result.Total - 1 - i) % int64(limit)
		result.Orders = append(result.Orders, window[index])
	}
	return result, nil
}

func matches(entry Entry, search, locationID, region string) bool {
	if locationID != "" && !strings.EqualFold(entry.LocationID, locationID) {
		return false
	}
	if region != "" && !strings.EqualFold(entry.Region, region) {
		return false
	}
	if search == "" {
		return true
	}
	return strings.Contains(strings.ToLower(entry.ItemID), search) ||
		strings.Contains(strings.ToLower(entry.GroupTypeID), search) ||
		strings.Contains(strings.ToLower(entry.LocationID), search) ||
		strings.Contains(strings.ToLower(entry.AuctionType), search)
}

func writeAll(file *os.File, data []byte) error {
	for len(data) > 0 {
		written, err := file.Write(data)
		if err != nil {
			return err
		}
		if written == 0 {
			return errors.New("market archive write made no progress")
		}
		data = data[written:]
	}
	return nil
}
