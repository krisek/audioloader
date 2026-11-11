package main

import (
	"context"
	"crypto/subtle"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// NewHandler returns the HTTP handler. Each configured secret path serves one MCP endpoint
// bound to one audioloader user; every other path answers a bare 404, revealing nothing.
func NewHandler(cfg *Config) http.Handler {
	type endpoint struct {
		path    string
		handler http.Handler
	}
	var endpoints []endpoint
	for _, r := range cfg.Routes {
		api := NewClient(cfg, r.ClientID)
		server := NewServer(cfg, api)
		h := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{
			Stateless:    true, // no session state, nothing accumulates per agent
			JSONResponse: true,
		})
		endpoints = append(endpoints, endpoint{path: r.Path, handler: h})
	}

	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		// Compare against every route in constant time so timing doesn't leak the secret.
		var match http.Handler
		for _, e := range endpoints {
			if subtle.ConstantTimeCompare([]byte(strings.TrimRight(req.URL.Path, "/")), []byte(e.path)) == 1 {
				match = e.handler
			}
		}
		if match == nil {
			http.NotFound(w, req)
			return
		}
		match.ServeHTTP(w, req)
	})
}

func run() error {
	cfg, err := LoadConfig(osGetenv, os.ReadFile)
	if err != nil {
		return err
	}
	srv := &http.Server{
		Addr:              cfg.Listen,
		Handler:           NewHandler(cfg),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(shutdown)
	}()

	// Never log the paths: they are the credentials.
	log.Printf("audioloader-mcp: listening on %s, upstream %s, %d user(s)%s",
		cfg.Listen, cfg.Upstream, len(cfg.Routes), map[bool]string{true: ", read-only", false: ""}[cfg.ReadOnly])
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func main() {
	if err := run(); err != nil {
		log.Fatalf("audioloader-mcp: %v", err)
	}
}
