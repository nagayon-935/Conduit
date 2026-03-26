package tunnel

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nagayon-935/conduit/internal/session"
)

// PumpConfig controls timing knobs for the pump goroutines.
type PumpConfig struct {
	WriteTimeout        time.Duration // maximum time to block on a WebSocket write
	BackpressureTimeout time.Duration // maximum time DrainOrDrop waits before dropping
}

// DefaultPumpConfig returns sensible production defaults.
func DefaultPumpConfig() PumpConfig {
	return PumpConfig{
		WriteTimeout:        10 * time.Second,
		BackpressureTimeout: 50 * time.Millisecond,
	}
}

// wsMessage is the JSON envelope used for control frames exchanged over WebSocket.
type wsMessage struct {
	Type    string `json:"type"`
	Cols    uint32 `json:"cols,omitempty"`
	Rows    uint32 `json:"rows,omitempty"`
	Message string `json:"message,omitempty"`
}

// StartPumps launches the readPump and writePump goroutines for sess.
// readPump: SSH stdout → sess.ToClient → WebSocket write
// writePump: WebSocket read → sess.FromClient → SSH stdin
func StartPumps(ctx context.Context, sess *session.Session, cfg PumpConfig) {
	go readPump(ctx, sess, cfg)
	go writePump(ctx, sess, cfg)
	go sshToClientPump(ctx, sess, cfg)
}

// sshToClientPump reads SSH stdout and pushes bytes into sess.ToClient.
func sshToClientPump(ctx context.Context, sess *session.Session, cfg PumpConfig) {
	buf := make([]byte, 32*1024)
	for {
		n, err := sess.Stdout.Read(buf)
		if n > 0 {
			data := make([]byte, n)
			copy(data, buf[:n])
			DrainOrDrop(sess.ToClient, data, cfg.BackpressureTimeout)
		}
		if err != nil {
			if err != io.EOF {
				slog.Error("sshToClientPump: read error", "error", err)
			}
			// SSH session ended – signal session to close.
			sess.Close()
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-sess.Done():
			return
		default:
		}
	}
}

// readPump reads from sess.ToClient and writes to the WebSocket.
func readPump(ctx context.Context, sess *session.Session, cfg PumpConfig) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-sess.Done():
			return
		case data, ok := <-sess.ToClient:
			if !ok {
				return
			}
			ws := sess.GetWebSocket()
			if ws == nil {
				// No WebSocket attached right now – discard; data is already lost.
				continue
			}
			_ = ws.SetWriteDeadline(time.Now().Add(cfg.WriteTimeout))
			if err := ws.WriteMessage(websocket.BinaryMessage, data); err != nil {
				slog.Warn("readPump: WebSocket write error", "error", err)
				sess.DetachWebSocket()
			}
		}
	}
}

// writePump reads WebSocket messages and routes them appropriately.
// Control messages (JSON with "type") are handled inline; raw input goes to SSH stdin via sess.FromClient.
func writePump(ctx context.Context, sess *session.Session, cfg PumpConfig) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-sess.Done():
			return
		default:
		}

		ws := sess.GetWebSocket()
		if ws == nil {
			// Wait a moment before retrying so we don't spin.
			select {
			case <-ctx.Done():
				return
			case <-sess.Done():
				return
			case <-time.After(200 * time.Millisecond):
			}
			continue
		}

		msgType, msg, err := ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Warn("writePump: WebSocket closed unexpectedly", "error", err)
			}
			sess.DetachWebSocket()
			continue
		}

		// Text messages are always JSON control frames.
		if msgType == websocket.TextMessage {
			handleControlMessage(sess, msg, cfg)
			continue
		}

		// Binary messages are raw terminal input, forwarded directly to SSH stdin.
		DrainOrDrop(sess.FromClient, msg, cfg.BackpressureTimeout)
	}
}

// handleControlMessage parses a JSON control frame and acts on it.
func handleControlMessage(sess *session.Session, msg []byte, cfg PumpConfig) {
	var frame wsMessage
	if err := json.Unmarshal(msg, &frame); err != nil {
		// Not JSON – treat as terminal input.
		DrainOrDrop(sess.FromClient, msg, cfg.BackpressureTimeout)
		return
	}

	switch frame.Type {
	case "ping":
		pong, _ := json.Marshal(wsMessage{Type: "pong"})
		ws := sess.GetWebSocket()
		if ws != nil {
			_ = ws.SetWriteDeadline(time.Now().Add(cfg.WriteTimeout))
			if err := ws.WriteMessage(websocket.TextMessage, pong); err != nil {
				slog.Warn("handleControlMessage: pong write error", "error", err)
				sess.DetachWebSocket()
			}
		}
	case "resize":
		ws := WindowSize{Cols: frame.Cols, Rows: frame.Rows}
		if err := ResizePTY(sess.SSHSession, ws); err != nil {
			slog.Warn("handleControlMessage: resize PTY error", "error", err)
		}
	default:
		slog.Warn("handleControlMessage: unknown message type", "type", frame.Type)
	}
}

// stdinForwarder reads from sess.FromClient and writes to SSH stdin.
// This goroutine is started once per session by the terminal handler.
func StartStdinForwarder(ctx context.Context, sess *session.Session) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-sess.Done():
				return
			case data, ok := <-sess.FromClient:
				if !ok {
					return
				}
				if _, err := sess.Stdin.Write(data); err != nil {
					slog.Error("stdinForwarder: write to SSH stdin failed", "error", err)
					sess.Close()
					return
				}
			}
		}
	}()
}
