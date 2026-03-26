package tunnel

import (
	"fmt"

	"golang.org/x/crypto/ssh"
)

// WindowSize represents a terminal window dimension update.
type WindowSize struct {
	Cols uint32 `json:"cols"`
	Rows uint32 `json:"rows"`
}

// ResizePTY sends a window-change request to the SSH session with the given dimensions.
func ResizePTY(sshSess *ssh.Session, ws WindowSize) error {
	if ws.Cols == 0 || ws.Rows == 0 {
		return fmt.Errorf("pty: invalid window size cols=%d rows=%d", ws.Cols, ws.Rows)
	}
	if err := sshSess.WindowChange(int(ws.Rows), int(ws.Cols)); err != nil {
		return fmt.Errorf("pty: window-change request failed: %w", err)
	}
	return nil
}
