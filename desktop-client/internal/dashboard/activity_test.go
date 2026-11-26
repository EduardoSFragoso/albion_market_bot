// internal/dashboard/activity_test.go
package dashboard

import (
	"sync"
	"testing"
	"time"
)

// Force the staleness ticker to a fast, fixed tick rate for the whole
// test binary. StaleCheckInterval is baked into time.NewTicker at the
// moment the ticker goroutine is first started (via sync.Once), so it
// must be set before any test's first RecordActivity() call - setting it
// per-test would be a no-op for every test after the first one in
// execution order. CaptureStaleAfter is read fresh on every tick, so it's
// safe to override per-test.
func init() {
	StaleCheckInterval = 5 * time.Millisecond
}

func TestRecordActivity_SetsCaptureRunningAndEmitsOnce(t *testing.T) {
	resetStatusForTest()
	resetActivityForTest()
	setCaptureStaleAfterForTest(time.Hour) // keep this test's goroutine from going stale mid-test
	t.Cleanup(func() { setCaptureStaleAfterForTest(time.Hour) })

	var mu sync.Mutex
	var got []Status
	OnStatusChange(func(s Status) {
		mu.Lock()
		got = append(got, s)
		mu.Unlock()
	})

	RecordActivity()
	RecordActivity()

	mu.Lock()
	defer mu.Unlock()
	if len(got) != 1 {
		t.Fatalf("expected 1 emit for the false->true transition, got %d: %+v", len(got), got)
	}
	if !got[0].CaptureRunning {
		t.Fatalf("expected CaptureRunning=true, got %+v", got[0])
	}
}

func TestRecordActivity_GoesStaleAfterTimeout(t *testing.T) {
	resetStatusForTest()
	resetActivityForTest()
	setCaptureStaleAfterForTest(20 * time.Millisecond)
	t.Cleanup(func() { setCaptureStaleAfterForTest(time.Hour) })

	var mu sync.Mutex
	var got []Status
	OnStatusChange(func(s Status) {
		mu.Lock()
		got = append(got, s)
		mu.Unlock()
	})

	RecordActivity()
	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if len(got) < 2 {
		t.Fatalf("expected at least 2 emits (true then false), got %d: %+v", len(got), got)
	}
	last := got[len(got)-1]
	if last.CaptureRunning {
		t.Fatalf("expected CaptureRunning=false after the staleness timeout, got %+v", last)
	}
}

func TestRecordActivity_GoingStaleKeepsFinishedSessionCounters(t *testing.T) {
	resetStatusForTest()
	resetActivityForTest()
	resetCountersForTest()
	setCaptureStaleAfterForTest(20 * time.Millisecond)
	t.Cleanup(func() { setCaptureStaleAfterForTest(time.Hour) })

	SetServer(1, "https://example.invalid")
	SetEncryptionStatus(EncryptionClear)

	RecordActivity()
	IncrementCounter("marketorders.ingest")
	time.Sleep(100 * time.Millisecond)

	if GetStatus().CaptureRunning {
		t.Fatalf("expected capture to have gone stale")
	}
	if counts := GetUploadCounts(); counts["marketorders.ingest"] != 1 {
		t.Fatalf("expected completed session counters to remain visible, got %+v", counts)
	}
	got := GetStatus()
	if got.ServerID != 0 || got.IngestBaseURL != "" {
		t.Fatalf("expected server cleared after going stale, got ServerID=%d IngestBaseURL=%q", got.ServerID, got.IngestBaseURL)
	}
	if got.EncryptionStatus != EncryptionUnknown {
		t.Fatalf("expected encryption status cleared after going stale, got %q", got.EncryptionStatus)
	}
}

func TestRecordActivity_NewSessionResetsPreviousSessionCounters(t *testing.T) {
	resetStatusForTest()
	resetActivityForTest()
	resetCountersForTest()
	setCaptureStaleAfterForTest(20 * time.Millisecond)
	t.Cleanup(func() { setCaptureStaleAfterForTest(time.Hour) })

	RecordActivity()
	IncrementCounterBy("marketorders.ingest", 7)
	time.Sleep(100 * time.Millisecond)
	if counts := GetUploadCounts(); counts["marketorders.ingest"] != 7 {
		t.Fatalf("finished session counters = %+v, want 7", counts)
	}

	RecordActivity()
	if counts := GetUploadCounts(); len(counts) != 0 {
		t.Fatalf("new session counters = %+v, want empty before new sends", counts)
	}
}

func TestRecordActivity_StillRunningDoesNotClearCountersOrServer(t *testing.T) {
	resetStatusForTest()
	resetActivityForTest()
	resetCountersForTest()
	setCaptureStaleAfterForTest(time.Hour) // never goes stale during this test
	t.Cleanup(func() { setCaptureStaleAfterForTest(time.Hour) })

	SetServer(1, "https://example.invalid")
	SetEncryptionStatus(EncryptionClear)

	RecordActivity()
	IncrementCounter("marketorders.ingest")

	if counts := GetUploadCounts(); counts["marketorders.ingest"] != 1 {
		t.Fatalf("expected counter to survive while still running, got %+v", counts)
	}
	got := GetStatus()
	if got.ServerID != 1 {
		t.Fatalf("expected server to survive while still running, got ServerID=%d", got.ServerID)
	}
	if got.EncryptionStatus != EncryptionClear {
		t.Fatalf("expected encryption status to survive while still running, got %q", got.EncryptionStatus)
	}
}

func TestSessionStatsAndFeedSummarizeDecodedActivity(t *testing.T) {
	resetStatusForTest()
	resetActivityForTest()
	setCaptureStaleAfterForTest(time.Hour)
	t.Cleanup(func() { setCaptureStaleAfterForTest(time.Hour) })

	RecordActivity()
	RecordActivity()
	RecordDataObserved("marketorders.ingest", 50)

	stats := GetSessionStats()
	if !stats.CaptureRunning || stats.DecodedMessages != 2 || stats.StartedAt == "" {
		t.Fatalf("GetSessionStats() = %+v, want active session with two decoded messages", stats)
	}
	feed := GetRecentActivity()
	if len(feed) != 2 || feed[0].Message != "ordens de mercado observados" || feed[0].Count != 50 {
		t.Fatalf("GetRecentActivity() = %+v, want data observation then capture start", feed)
	}

	SetCaptureRunning(false)
	finished := GetSessionStats()
	if finished.CaptureRunning || finished.DecodedMessages != 2 || finished.ElapsedSeconds < 0 {
		t.Fatalf("finished session stats = %+v, want frozen completed session", finished)
	}
}
