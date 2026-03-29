package config

// Secret is a string type that redacts its value in all log/fmt output.
// Call .Value() only at the boundary where the raw string is needed
// (e.g. when passing to an SDK that requires a plain string).
type Secret string

// String returns a redacted placeholder so the token is never logged via %s or %v.
func (s Secret) String() string { return "[REDACTED]" }

// GoString returns a redacted placeholder for %#v formatting.
func (s Secret) GoString() string { return `config.Secret("[REDACTED]")` }

// MarshalJSON returns a redacted placeholder so the token is never serialised.
func (s Secret) MarshalJSON() ([]byte, error) { return []byte(`"[REDACTED]"`), nil }

// Value returns the raw secret string for use at trust boundaries.
func (s Secret) Value() string { return string(s) }
