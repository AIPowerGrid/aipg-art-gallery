// SPDX-License-Identifier: AGPL-3.0-or-later
package aipg

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOwnershipResponseBoundsAndIdentity(t *testing.T) {
	const current = "11111111-1111-4111-8111-111111111111"
	const old = "22222222-2222-4222-8222-222222222222"
	for _, test := range []struct {
		name, body string
		status     int
		ok         bool
	}{
		{"valid", fmt.Sprintf(`{"account_id":%q,"account_aliases":[%q]}`, current, old), 200, true},
		{"wrong account", fmt.Sprintf(`{"account_id":%q,"account_aliases":[]}`, old), 200, false},
		{"duplicate alias", fmt.Sprintf(`{"account_id":%q,"account_aliases":[%q,%q]}`, current, old, old), 200, false},
		{"canonical repeated", fmt.Sprintf(`{"account_id":%q,"account_aliases":[%q]}`, current, current), 200, false},
		{"invalid alias", fmt.Sprintf(`{"account_id":%q,"account_aliases":["wallet:fake"]}`, current), 200, false},
		{"truncated", `{"account_id":`, 200, false},
		{"oversize", strings.Repeat(" ", 16385), 200, false},
		{"missing endpoint", "private error", 404, false},
		{"db outage", "private error", 503, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/account/ownership" || r.Method != "GET" || r.Header.Get("apikey") != "service" || r.Header.Get("X-Grid-User-Token") != "delegation" {
					t.Error("ownership request lost its binding")
				}
				w.WriteHeader(test.status)
				_, _ = w.Write([]byte(test.body))
			}))
			defer core.Close()
			result, err := NewClient(core.URL, "test").FetchOwnership(context.Background(), "service", "delegation", current)
			if test.ok {
				if err != nil || !result.Contains(old) || result.Contains("stranger") {
					t.Fatalf("invalid ownership: %v", err)
				}
			} else if err == nil || strings.Contains(err.Error(), "private") {
				t.Fatalf("unsafe failure: %v", err)
			}
		})
	}
}

func TestOwnershipDoesNotFollowRedirects(t *testing.T) {
	hits := 0
	foreign := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits++ }))
	defer foreign.Close()
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, foreign.URL, 307) }))
	defer core.Close()
	_, err := NewClient(core.URL, "test").FetchOwnership(context.Background(), "service", "delegation", "11111111-1111-4111-8111-111111111111")
	if err == nil || hits != 0 {
		t.Fatal("followed ownership redirect")
	}
}
