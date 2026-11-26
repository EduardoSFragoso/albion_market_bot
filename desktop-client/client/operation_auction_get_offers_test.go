package client

import (
	"bytes"
	"os"
	"strings"
	"testing"

	"github.com/ao-data/albiondata-client/log"
)

func TestDisabledMarketOrderUploadLogDescribesDecodedOrders(t *testing.T) {
	previousDisabled := ConfigGlobal.DisableUpload
	previousPublic := ConfigGlobal.PublicIngestBaseUrls
	previousPrivate := ConfigGlobal.PrivateIngestBaseUrls
	ConfigGlobal.DisableUpload = true
	ConfigGlobal.PublicIngestBaseUrls = ""
	ConfigGlobal.PrivateIngestBaseUrls = ""
	t.Cleanup(func() {
		ConfigGlobal.DisableUpload = previousDisabled
		ConfigGlobal.PublicIngestBaseUrls = previousPublic
		ConfigGlobal.PrivateIngestBaseUrls = previousPrivate
		log.SetOutput(os.Stderr)
	})

	var output bytes.Buffer
	log.SetOutput(&output)
	response := operationAuctionGetOffersResponse{
		MarketOrders: []string{`{"ItemTypeId":"T4_BAG","LocationId":"","UnitPriceSilver":100,"Amount":1,"AuctionType":"offer"}`},
	}
	response.Process(&albionState{LocationId: "0007", AODataServerID: 1})

	got := output.String()
	if !strings.Contains(got, "Decoded 1 live market sell orders") {
		t.Fatalf("log should describe captured data without claiming an upload; got %q", got)
	}
	if strings.Contains(got, "Sending 1 live market sell orders to ingest") {
		t.Fatalf("disabled upload log falsely claims the batch is being sent: %q", got)
	}
	if !strings.Contains(got, "Upload is disabled.") {
		t.Fatalf("expected disabled upload status in log; got %q", got)
	}
}
