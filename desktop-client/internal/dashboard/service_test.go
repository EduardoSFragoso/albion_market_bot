// internal/dashboard/service_test.go
package dashboard

import (
	"path/filepath"
	"testing"

	"github.com/ao-data/albiondata-client/internal/preferences"
)

func TestDashboardService_DelegatesToPackageState(t *testing.T) {
	resetStatusForTest()
	resetCountersForTest()
	resetLogHookForTest()

	SetVersionInfo("9.9.9", "")
	IncrementCounter("marketorders.ingest")
	hook := NewLogHook()
	_ = hook

	svc := &DashboardService{}

	if got := svc.GetStatus(); got.Version != "9.9.9" {
		t.Fatalf("GetStatus().Version = %q, want %q", got.Version, "9.9.9")
	}
	if got := svc.GetUploadCounts(); got["marketorders.ingest"] != 1 {
		t.Fatalf("GetUploadCounts()[marketorders.ingest] = %d, want 1", got["marketorders.ingest"])
	}
	if got := svc.GetRecentLogs(); len(got) != 0 {
		t.Fatalf("GetRecentLogs() = %+v, want empty (no Fire calls in this test)", got)
	}
}

func TestDashboardService_SavesUploadPreferences(t *testing.T) {
	store, err := preferences.Open(filepath.Join(t.TempDir(), "uploads.json"))
	if err != nil {
		t.Fatal(err)
	}
	svc := &DashboardService{Preferences: store}
	want := preferences.UploadCategories{MarketOrders: false, MarketHistories: true, GoldPrices: false, WorldData: true}
	if err := svc.SetUploadPreferences(want); err != nil {
		t.Fatal(err)
	}
	if got := svc.GetUploadPreferences(); got != want {
		t.Fatalf("GetUploadPreferences() = %+v, want %+v", got, want)
	}
}

func TestDashboardService_ExposesSessionStatsAndActivity(t *testing.T) {
	resetStatusForTest()
	resetActivityForTest()
	SetCaptureRunning(true)
	RecordDecodedMessage()
	AddActivityEvent("data", "ordens de mercado observados", 5)

	svc := &DashboardService{}
	if got := svc.GetSessionStats(); got.DecodedMessages != 1 || !got.CaptureRunning {
		t.Fatalf("GetSessionStats() = %+v, want one decoded message and active capture", got)
	}
	feed := svc.GetRecentActivity()
	if len(feed) != 2 || feed[0].Message != "ordens de mercado observados" || feed[0].Count != 5 {
		t.Fatalf("GetRecentActivity() = %+v, want newest data event first", feed)
	}
}
