package session

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// SafeConn wraps a *websocket.Conn with a mutex to serialize writes.
// gorilla/websocket supports one concurrent reader and one concurrent writer,
// but NOT multiple concurrent writers. SafeConn enforces this constraint.
type SafeConn struct {
	*websocket.Conn
	mu sync.Mutex
}

// NewSafeConn wraps a raw *websocket.Conn.
func NewSafeConn(ws *websocket.Conn) *SafeConn {
	return &SafeConn{Conn: ws}
}

// WriteMessage acquires the write lock before writing.
func (c *SafeConn) WriteMessage(messageType int, data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Conn.WriteMessage(messageType, data)
}

// WriteJSON acquires the write lock before writing JSON.
func (c *SafeConn) WriteJSON(v any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Conn.WriteJSON(v)
}

// WriteWithDeadline sets a write deadline and writes a message under one lock.
func (c *SafeConn) WriteWithDeadline(deadline time.Time, messageType int, data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.Conn.SetWriteDeadline(deadline)
	return c.Conn.WriteMessage(messageType, data)
}
