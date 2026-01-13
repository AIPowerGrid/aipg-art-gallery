package gallery

// GalleryStore defines the interface for gallery storage operations
type GalleryStore interface {
	Add(item GalleryItem) error
	Get(jobID string) *GalleryItem
	List(typeFilter string, limit, offset int, searchQuery string) ListResult
	ListByWallet(wallet string, limit int) []GalleryItem
	Delete(jobID string) error
	SetPublic(jobID string, isPublic bool) error
	Count() int
}

// FileStoreAdapter wraps the file-based Store to implement GalleryStore interface
type FileStoreAdapter struct {
	Store *Store
}

func (a *FileStoreAdapter) Add(item GalleryItem) error {
	a.Store.Add(item)
	return nil
}

func (a *FileStoreAdapter) Get(jobID string) *GalleryItem {
	return a.Store.Get(jobID)
}

func (a *FileStoreAdapter) List(typeFilter string, limit, offset int, searchQuery string) ListResult {
	return a.Store.List(typeFilter, limit, offset, searchQuery)
}

func (a *FileStoreAdapter) ListByWallet(wallet string, limit int) []GalleryItem {
	return a.Store.ListByWallet(wallet, limit)
}

func (a *FileStoreAdapter) Delete(jobID string) error {
	return a.Store.Delete(jobID)
}

func (a *FileStoreAdapter) SetPublic(jobID string, isPublic bool) error {
	// File store doesn't support this operation
	return nil
}

func (a *FileStoreAdapter) Count() int {
	return a.Store.List("", 1, 0, "").Total
}
