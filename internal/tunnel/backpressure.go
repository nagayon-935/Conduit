package tunnel

import (
	"log/slog"
	"time"
)

// DrainOrDrop attempts to send data to ch within timeout.
// If the channel is full when the timeout expires, the data is dropped and false is returned.
// A true return value indicates the data was delivered.
func DrainOrDrop(ch chan []byte, data []byte, timeout time.Duration) (sent bool) {
	select {
	case ch <- data:
		return true
	default:
	}

	// Channel is currently full – wait up to timeout for space.
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case ch <- data:
		return true
	case <-timer.C:
		slog.Warn("backpressure: dropping data, channel full", "channel_cap", cap(ch), "data_len", len(data))
		return false
	}
}
