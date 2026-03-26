.PHONY: build run dev tidy test lint

# CGO_ENABLED=0 avoids a macOS dyld LC_UUID linker bug with CGO.
export CGO_ENABLED=0

build:
	go build -o bin/conduit ./cmd/server

run: build
	./bin/conduit

dev:
	go run ./cmd/server

tidy:
	go mod tidy

test:
	go test -race -count=1 ./...

lint:
	go vet ./...
