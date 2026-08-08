package gallery

import (
	"fmt"
	"testing"
	"time"
)

type uuidUserRow struct {
	id string
}

func (r uuidUserRow) Scan(dest ...any) error {
	if len(dest) != 8 {
		return fmt.Errorf("expected 8 destinations, got %d", len(dest))
	}

	id, ok := dest[0].(*string)
	if !ok {
		return fmt.Errorf("user id destination is %T, want *string", dest[0])
	}
	*id = r.id
	*(dest[1].(**string)) = nil
	*(dest[2].(**string)) = nil
	*(dest[3].(**string)) = nil
	*(dest[4].(**string)) = nil
	*(dest[5].(**string)) = nil
	now := time.Unix(1, 0).UTC()
	*(dest[6].(*time.Time)) = now
	*(dest[7].(*time.Time)) = now
	return nil
}

func TestScanUserAcceptsUUIDID(t *testing.T) {
	const id = "c54e0d3c-1d2b-4e4a-a60f-356930820752"
	user, err := scanUser(uuidUserRow{id: id})
	if err != nil {
		t.Fatalf("scanUser() error = %v", err)
	}
	if user.ID != id {
		t.Fatalf("user.ID = %q, want %q", user.ID, id)
	}
}
