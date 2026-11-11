package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// Client talks to the audioloader HTTP API on behalf of one user.
type Client struct {
	base     string
	mpdPort  string
	clientID string
	http     *http.Client
	cookie   string
	auth     string
}

func NewClient(cfg *Config, clientID string) *Client {
	return &Client{
		base:     cfg.Upstream,
		mpdPort:  cfg.MPDPort,
		clientID: clientID,
		cookie:   cfg.Cookie,
		auth:     cfg.Authorization,
		http: &http.Client{
			Timeout: cfg.Timeout,
			// A redirect means an auth layer rejected us; surface it instead of following.
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
}

// Get calls GET /<endpoint> and returns the raw body (possibly empty).
// withClient adds this user's client_id.
func (c *Client) Get(ctx context.Context, endpoint string, params url.Values, withClient bool) ([]byte, error) {
	q := url.Values{}
	q.Set("mpd_port", c.mpdPort)
	for k, vs := range params {
		for _, v := range vs {
			if v != "" {
				q.Set(k, v)
			}
		}
	}
	if withClient {
		q.Set("client_id", c.clientID)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/"+endpoint+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if c.cookie != "" {
		req.Header.Set("Cookie", c.cookie)
	}
	if c.auth != "" {
		req.Header.Set("Authorization", c.auth)
	}

	res, err := c.http.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, fmt.Errorf("/%s: audioloader did not answer in time", endpoint)
		}
		return nil, fmt.Errorf("/%s: cannot reach audioloader (%v)", endpoint, errors.Unwrap(err))
	}
	defer res.Body.Close()
	switch {
	case res.StatusCode >= 300 && res.StatusCode < 400:
		return nil, fmt.Errorf("/%s: redirected (HTTP %d); the upstream wants authentication (AL_MCP_UPSTREAM_*)", endpoint, res.StatusCode)
	case res.StatusCode == 401 || res.StatusCode == 403:
		return nil, fmt.Errorf("/%s: HTTP %d; the upstream wants authentication (AL_MCP_UPSTREAM_*)", endpoint, res.StatusCode)
	case res.StatusCode != 200:
		return nil, fmt.Errorf("/%s: HTTP %d", endpoint, res.StatusCode)
	}
	return io.ReadAll(io.LimitReader(res.Body, 8<<20))
}
