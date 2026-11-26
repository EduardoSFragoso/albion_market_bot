// internal/dashboard/service.go
package dashboard

import (
	"errors"

	"github.com/ao-data/albiondata-client/internal/marketarchive"
	"github.com/ao-data/albiondata-client/internal/preferences"
)

// DashboardService is bound to the Wails frontend (see application.NewService
// in albiondata-client.go). Its methods back-fill the dashboard window's
// state when it's shown; ongoing updates arrive via the "status:changed",
// "counters:snapshot", and "log:line" events instead.
type DashboardService struct {
	Archive     *marketarchive.Store
	Preferences *preferences.Store
}

// GetUploadPreferences returns the saved public upload categories.
func (s *DashboardService) GetUploadPreferences() preferences.UploadCategories {
	if s.Preferences == nil {
		return preferences.DefaultUploadCategories()
	}
	return s.Preferences.Get()
}

// SetUploadPreferences saves the public upload categories for future packets.
func (s *DashboardService) SetUploadPreferences(value preferences.UploadCategories) error {
	if s.Preferences == nil {
		return errors.New("upload preferences are unavailable")
	}
	return s.Preferences.Set(value)
}

// GetStatus returns the current status snapshot.
func (s *DashboardService) GetStatus() Status {
	return GetStatus()
}

// GetUploadCounts returns the current upload counters by topic.
func (s *DashboardService) GetUploadCounts() map[string]int64 {
	return GetUploadCounts()
}

// GetRecentLogs returns the currently buffered recent log lines.
func (s *DashboardService) GetRecentLogs() []LogLine {
	return GetRecentLogs()
}

// GetSessionStats returns the current or most recent capture session summary.
func (s *DashboardService) GetSessionStats() SessionStats {
	return GetSessionStats()
}

// GetRecentActivity returns a bounded capture activity feed, newest first.
func (s *DashboardService) GetRecentActivity() []ActivityEvent {
	return GetRecentActivity()
}

// GetMarketArchive returns a bounded view of locally captured market orders.
func (s *DashboardService) GetMarketArchive(search, locationID, region string, limit int) marketarchive.Result {
	if s.Archive == nil {
		return marketarchive.Result{Error: "Local market archive is unavailable."}
	}

	result, err := s.Archive.Query(search, locationID, region, limit)
	if err != nil {
		return marketarchive.Result{Path: s.Archive.Path(), Error: err.Error()}
	}
	return result
}
