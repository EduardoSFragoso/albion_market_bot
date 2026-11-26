package client

import "testing"

func TestSetupDebugEventsRejectsIDsOutsideUint16Range(t *testing.T) {
	config := config{
		DebugEventsString:          "1,65535,65536,-1",
		DebugEventsBlacklistString: "1,2,65536,-1",
	}

	config.setupDebugEvents()

	want := map[int]bool{1: false, 2: false, 65535: true}
	if len(config.DebugEvents) != len(want) {
		t.Fatalf("got %v; want only valid uint16 event IDs %v", config.DebugEvents, want)
	}
	for id, wantValue := range want {
		if got, ok := config.DebugEvents[id]; !ok || got != wantValue {
			t.Errorf("DebugEvents[%d] = %t, %t; want %t, true", id, got, ok, wantValue)
		}
	}
}

func TestSetupDebugOperationsRejectsIDsOutsideUint16Range(t *testing.T) {
	config := config{
		DebugOperationsString:          "1,65535,65536,-1",
		DebugOperationsBlacklistString: "1,2,65536,-1",
	}

	config.setupDebugOperations()

	want := map[int]bool{1: false, 2: false, 65535: true}
	if len(config.DebugOperations) != len(want) {
		t.Fatalf("got %v; want only valid uint16 operation IDs %v", config.DebugOperations, want)
	}
	for id, wantValue := range want {
		if got, ok := config.DebugOperations[id]; !ok || got != wantValue {
			t.Errorf("DebugOperations[%d] = %t, %t; want %t, true", id, got, ok, wantValue)
		}
	}
}
