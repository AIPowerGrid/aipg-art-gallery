package cache

import (
	"sync"
	"time"
)

// Item represents a cached item with expiration
type Item struct {
	Value      interface{}
	Expiration int64
}

// Cache is a simple in-memory cache with TTL
type Cache struct {
	items map[string]Item
	mu    sync.RWMutex
}

// New creates a new cache and starts the cleanup goroutine
func New() *Cache {
	c := &Cache{
		items: make(map[string]Item),
	}
	go c.cleanup()
	return c
}

// Set stores a value with the given TTL
func (c *Cache) Set(key string, value interface{}, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	c.items[key] = Item{
		Value:      value,
		Expiration: time.Now().Add(ttl).UnixNano(),
	}
}

// Get retrieves a value from the cache
func (c *Cache) Get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	item, found := c.items[key]
	if !found {
		return nil, false
	}
	
	if time.Now().UnixNano() > item.Expiration {
		return nil, false
	}
	
	return item.Value, true
}

// Delete removes a key from the cache
func (c *Cache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.items, key)
}

// Clear removes all items from the cache
func (c *Cache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = make(map[string]Item)
}

// cleanup removes expired items every minute
func (c *Cache) cleanup() {
	ticker := time.NewTicker(time.Minute)
	for range ticker.C {
		c.mu.Lock()
		now := time.Now().UnixNano()
		for key, item := range c.items {
			if now > item.Expiration {
				delete(c.items, key)
			}
		}
		c.mu.Unlock()
	}
}

// Stats returns cache statistics
func (c *Cache) Stats() (int, int) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	total := len(c.items)
	expired := 0
	now := time.Now().UnixNano()
	for _, item := range c.items {
		if now > item.Expiration {
			expired++
		}
	}
	return total, total - expired
}
