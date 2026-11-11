package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// minSecretLen is the shortest accepted secret path. The path IS the credential.
const minSecretLen = 20

var clientIDRe = regexp.MustCompile(`^[A-Za-z0-9_\-.]+$`)

// Route maps one secret URL path to one audioloader user.
type Route struct {
	Path     string // normalized: leading "/", no trailing "/"
	ClientID string
}

type Config struct {
	Listen        string
	Upstream      string
	MPDPort       string
	Routes        []Route
	ReadOnly      bool
	Timeout       time.Duration
	Cookie        string // optional upstream auth
	Authorization string // optional upstream auth, full header value
}

func normalizePath(p string) string {
	return "/" + strings.Trim(strings.TrimSpace(p), "/")
}

func envOr(get func(string) string, key, def string) string {
	if v := get(key); v != "" {
		return v
	}
	return def
}

func parseBool(s string) bool {
	switch strings.ToLower(s) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

func addRoute(routes []Route, path, clientID string) ([]Route, error) {
	path = normalizePath(path)
	if len(strings.TrimPrefix(path, "/")) < minSecretLen {
		return nil, fmt.Errorf("MCP path for client %q is shorter than %d characters; use a long unpredictable string", clientID, minSecretLen)
	}
	if !clientIDRe.MatchString(clientID) {
		return nil, fmt.Errorf("invalid client id %q (allowed: letters, digits, _ - .)", clientID)
	}
	for _, r := range routes {
		if r.Path == path {
			return nil, errors.New("the same MCP path is used for two clients")
		}
	}
	return append(routes, Route{Path: path, ClientID: clientID}), nil
}

// LoadConfig reads configuration from the environment.
//
//	AL_MCP_LISTEN            listen address (default 127.0.0.1:3401)
//	AL_MCP_PORT              shortcut: listen on 127.0.0.1:<port>
//	AL_MCP_UPSTREAM          audioloader base URL (default http://127.0.0.1:3400)
//	AL_MCP_MPD_PORT          mpd_port sent upstream (default 6600)
//	AL_MCP_PATH + AL_MCP_CLIENT_ID   single user
//	AL_MCP_ROUTES            "path1=client1,path2=client2"
//	AL_MCP_ROUTES_FILE       file with one "path client_id" per line (# comments)
//	AL_MCP_READONLY          true: only read tools
//	AL_MCP_UPSTREAM_COOKIE / _BEARER / _BASIC_USER / _BASIC_PASSWORD   optional upstream auth
func LoadConfig(get func(string) string, readFile func(string) ([]byte, error)) (*Config, error) {
	c := &Config{
		Listen:   envOr(get, "AL_MCP_LISTEN", "127.0.0.1:"+envOr(get, "AL_MCP_PORT", "3401")),
		Upstream: strings.TrimRight(envOr(get, "AL_MCP_UPSTREAM", "http://127.0.0.1:3400"), "/"),
		MPDPort:  envOr(get, "AL_MCP_MPD_PORT", "6600"),
		ReadOnly: parseBool(get("AL_MCP_READONLY")),
		Cookie:   get("AL_MCP_UPSTREAM_COOKIE"),
		Timeout:  10 * time.Second,
	}
	if ms, err := strconv.Atoi(get("AL_MCP_TIMEOUT_MS")); err == nil && ms > 0 {
		c.Timeout = time.Duration(ms) * time.Millisecond
	}

	bearer, user, pass := get("AL_MCP_UPSTREAM_BEARER"), get("AL_MCP_UPSTREAM_BASIC_USER"), get("AL_MCP_UPSTREAM_BASIC_PASSWORD")
	switch {
	case bearer != "" && (user != "" || pass != ""):
		return nil, errors.New("set either AL_MCP_UPSTREAM_BEARER or AL_MCP_UPSTREAM_BASIC_USER/PASSWORD, not both")
	case pass != "" && user == "":
		return nil, errors.New("AL_MCP_UPSTREAM_BASIC_PASSWORD needs AL_MCP_UPSTREAM_BASIC_USER")
	case bearer != "":
		c.Authorization = "Bearer " + bearer
	case user != "":
		c.Authorization = "Basic " + base64.StdEncoding.EncodeToString([]byte(user+":"+pass))
	}

	var err error
	if p := get("AL_MCP_PATH"); p != "" {
		if c.Routes, err = addRoute(c.Routes, p, envOr(get, "AL_MCP_CLIENT_ID", "guest")); err != nil {
			return nil, err
		}
	}
	if spec := get("AL_MCP_ROUTES"); spec != "" {
		for _, item := range strings.Split(spec, ",") {
			i := strings.LastIndex(item, "=")
			if i < 0 {
				return nil, fmt.Errorf("AL_MCP_ROUTES entry must look like path=client_id")
			}
			if c.Routes, err = addRoute(c.Routes, item[:i], strings.TrimSpace(item[i+1:])); err != nil {
				return nil, err
			}
		}
	}
	if f := get("AL_MCP_ROUTES_FILE"); f != "" {
		data, rerr := readFile(f)
		if rerr != nil {
			return nil, fmt.Errorf("reading AL_MCP_ROUTES_FILE: %w", rerr)
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) != 2 {
				return nil, errors.New(`AL_MCP_ROUTES_FILE lines must be "path client_id"`)
			}
			if c.Routes, err = addRoute(c.Routes, fields[0], fields[1]); err != nil {
				return nil, err
			}
		}
	}
	if len(c.Routes) == 0 {
		return nil, errors.New("no routes configured: set AL_MCP_PATH (+AL_MCP_CLIENT_ID), AL_MCP_ROUTES or AL_MCP_ROUTES_FILE")
	}
	return c, nil
}

func osGetenv(k string) string { return os.Getenv(k) }
