package dashboard

import (
	"sync"
	"time"
)

const maxActivityEvents = 100

// SessionStats summarizes decoded game traffic in the current or most recent
// capture session. Duration is frozen when capture becomes idle.
type SessionStats struct {
	StartedAt       string
	ElapsedSeconds  int64
	DecodedMessages int64
	CaptureRunning  bool
}

// ActivityEvent is a short, user-facing capture or data observation.
type ActivityEvent struct {
	Time    string
	Kind    string
	Message string
	Count   int64
}

var (
	sessionMu        sync.Mutex
	sessionStartedAt time.Time
	sessionEndedAt   time.Time
	sessionMessages  int64
	sessionRunning   bool

	activityFeedMu sync.Mutex
	activityFeed   []ActivityEvent
	activityEmit   func(ActivityEvent)
)

var activityTopicLabels = map[string]string{
	"marketorders.ingest":    "ordens de mercado",
	"markethistories.ingest": "histórico de mercado",
	"goldprices.ingest":      "preços do ouro",
	"mapdata.ingest":         "dados de mapa",
	"festivities.ingest":     "festividades",
	"banditevent.ingest":     "eventos de bandido",
}

func startSession(at time.Time) {
	sessionMu.Lock()
	sessionStartedAt = at
	sessionEndedAt = time.Time{}
	sessionMessages = 0
	sessionRunning = true
	sessionMu.Unlock()
	ResetCounters()
	AddActivityEvent("capture", "Captura do jogo detectada", 0)
}

func finishSession(at time.Time) {
	sessionMu.Lock()
	if sessionRunning {
		sessionEndedAt = at
		sessionRunning = false
	}
	sessionMu.Unlock()
	AddActivityEvent("capture", "Captura ficou inativa", 0)
}

// RecordDecodedMessage increments the count of successfully decoded game
// messages for the current capture session.
func RecordDecodedMessage() {
	sessionMu.Lock()
	if sessionRunning {
		sessionMessages++
	}
	sessionMu.Unlock()
}

// GetSessionStats returns the current session summary.
func GetSessionStats() SessionStats {
	now := time.Now()
	sessionMu.Lock()
	defer sessionMu.Unlock()
	stats := SessionStats{DecodedMessages: sessionMessages, CaptureRunning: sessionRunning}
	if sessionStartedAt.IsZero() {
		return stats
	}
	stats.StartedAt = sessionStartedAt.UTC().Format(time.RFC3339)
	end := sessionEndedAt
	if sessionRunning {
		end = now
	}
	stats.ElapsedSeconds = int64(end.Sub(sessionStartedAt).Seconds())
	return stats
}

// AddActivityEvent appends to a bounded recent activity feed and notifies the
// dashboard if it is open.
func AddActivityEvent(kind, message string, count int64) {
	event := ActivityEvent{Time: time.Now().Format("15:04:05"), Kind: kind, Message: message, Count: count}
	activityFeedMu.Lock()
	activityFeed = append(activityFeed, event)
	if len(activityFeed) > maxActivityEvents {
		activityFeed = activityFeed[len(activityFeed)-maxActivityEvents:]
	}
	emit := activityEmit
	activityFeedMu.Unlock()
	if emit != nil {
		emit(event)
	}
}

// RecordDataObserved adds a user-facing summary of a decoded data batch.
func RecordDataObserved(topic string, count int64) {
	if count <= 0 {
		return
	}
	label, ok := activityTopicLabels[topic]
	if !ok {
		return
	}
	AddActivityEvent("data", label+" observados", count)
}

func sessionServerName(id int) string {
	switch id {
	case 1:
		return "West"
	case 2:
		return "East"
	case 3:
		return "Europe"
	default:
		return "desconhecido"
	}
}

// OnActivityChange registers the callback invoked for each activity event.
func OnActivityChange(fn func(ActivityEvent)) {
	activityFeedMu.Lock()
	activityEmit = fn
	activityFeedMu.Unlock()
}

// GetRecentActivity returns the newest events first.
func GetRecentActivity() []ActivityEvent {
	activityFeedMu.Lock()
	defer activityFeedMu.Unlock()
	out := make([]ActivityEvent, len(activityFeed))
	for i, event := range activityFeed {
		out[len(activityFeed)-1-i] = event
	}
	return out
}

func resetSessionForTest() {
	sessionMu.Lock()
	sessionStartedAt = time.Time{}
	sessionEndedAt = time.Time{}
	sessionMessages = 0
	sessionRunning = false
	sessionMu.Unlock()
	activityFeedMu.Lock()
	activityFeed = nil
	activityEmit = nil
	activityFeedMu.Unlock()
}
