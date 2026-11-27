package client

import (
	"path/filepath"
	"testing"
)

func TestLogFilePathUsesExecutableDirectory(t *testing.T) {
	executablePath := filepath.Join(t.TempDir(), "portable", "albion-market-archive.exe")
	want := filepath.Join(filepath.Dir(executablePath), logFileName)

	if got := logFilePath(executablePath); got != want {
		t.Fatalf("logFilePath() = %q, want %q", got, want)
	}
}
