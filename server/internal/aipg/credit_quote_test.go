package aipg

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreditQuoteUsesDelegatedIdentityAndParsesCoreTruth(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/account/credits/quote" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("apikey"); got != "service-key" {
			t.Fatalf("apikey = %q", got)
		}
		if got := r.Header.Get("X-Grid-User-Token"); got != "user-token" {
			t.Fatalf("user token = %q", got)
		}
		var request CreditQuoteRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if request.Model != "Krea 2 Turbo" || request.Modality != "image" || request.N != 2 {
			t.Fatalf("unexpected quote request: %+v", request)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"account_id":"account-1",
			"promotional":{"remaining_micro":0,"remaining_usd":0,"active":false},
			"free":{"remaining_micro":0,"remaining_usd":0,"active":false},
			"paid":{"balance_micro":20000,"balance_usd":0.02},
			"total_spendable_micro":20000,
			"total_spendable_usd":0.02,
			"total_preview_micro":20000,
			"total_preview_usd":0.02,
			"charging_enabled":true,
			"charging_mode":"allowlist",
			"estimate":{
				"model":"Krea 2 Turbo",
				"modality":"image",
				"priced":true,
				"reason":null,
				"cost_micro":10000,
				"cost_usd":0.01,
				"balance_sufficient":true,
				"from_promotional_micro":0,
				"from_daily_micro":0,
				"from_paid_micro":10000,
				"shortfall_micro":0,
				"n":2,
				"seconds":null
			}
		}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "gallery-test")
	quote, err := client.CreditQuote(
		context.Background(),
		"service-key",
		"user-token",
		CreditQuoteRequest{Model: "Krea 2 Turbo", Modality: "image", N: 2},
	)
	if err != nil {
		t.Fatal(err)
	}
	if quote.AccountID != "account-1" || quote.Estimate.CostMicro == nil ||
		*quote.Estimate.CostMicro != 10_000 || !quote.Estimate.BalanceSufficient {
		t.Fatalf("unexpected quote: %+v", quote)
	}
}
