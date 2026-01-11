package r2

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Client wraps the S3-compatible R2 client
type Client struct {
	transientClient   *s3.Client
	transientPresign  *s3.PresignClient
	sharedClient      *s3.Client
	sharedPresign     *s3.PresignClient
	transientBucket   string
	permanentBucket   string
}

// NewClient creates a new R2 client with both transient and shared access
func NewClient(endpoint, transientBucket, permanentBucket, accessKeyID, accessKeySecret, sharedKeyID, sharedKeySecret string) (*Client, error) {
	client := &Client{
		transientBucket: transientBucket,
		permanentBucket: permanentBucket,
	}

	// Create transient client (for regular media access)
	if accessKeyID != "" && accessKeySecret != "" {
		cfg, err := config.LoadDefaultConfig(context.Background(),
			config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
				accessKeyID,
				accessKeySecret,
				"",
			)),
			config.WithRegion("auto"),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to load transient AWS config: %w", err)
		}

		client.transientClient = s3.NewFromConfig(cfg, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
		})
		client.transientPresign = s3.NewPresignClient(client.transientClient)
	}

	// Create shared client (for permanent/shared media access)
	if sharedKeyID != "" && sharedKeySecret != "" {
		cfg, err := config.LoadDefaultConfig(context.Background(),
			config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
				sharedKeyID,
				sharedKeySecret,
				"",
			)),
			config.WithRegion("auto"),
		)
		if err != nil {
			return nil, fmt.Errorf("failed to load shared AWS config: %w", err)
		}

		client.sharedClient = s3.NewFromConfig(cfg, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
		})
		client.sharedPresign = s3.NewPresignClient(client.sharedClient)
	}

	if client.transientClient == nil && client.sharedClient == nil {
		return nil, fmt.Errorf("no R2 credentials configured")
	}

	return client, nil
}

// GenerateDownloadURL generates a presigned URL for downloading an object
// Tries shared bucket first (for permanent/shared content), then transient
func (c *Client) GenerateDownloadURL(ctx context.Context, objectKey string, expiresIn time.Duration) (string, error) {
	// Try shared/permanent bucket first (shared content persists longer)
	if c.sharedPresign != nil {
		request, err := c.sharedPresign.PresignGetObject(ctx, &s3.GetObjectInput{
			Bucket: aws.String(c.permanentBucket),
			Key:    aws.String(objectKey),
		}, s3.WithPresignExpires(expiresIn))
		if err == nil {
			return request.URL, nil
		}
	}

	// Fall back to transient bucket
	if c.transientPresign != nil {
		request, err := c.transientPresign.PresignGetObject(ctx, &s3.GetObjectInput{
			Bucket: aws.String(c.transientBucket),
			Key:    aws.String(objectKey),
		}, s3.WithPresignExpires(expiresIn))
		if err == nil {
			return request.URL, nil
		}
		return "", fmt.Errorf("failed to presign GetObject: %w", err)
	}

	return "", fmt.Errorf("no R2 client available")
}

// GenerateMediaURL returns a CDN URL for accessing the media
// Always returns CDN URL since presigned URLs have permission issues
func (c *Client) GenerateMediaURL(ctx context.Context, procgenID string, mediaType string) (string, error) {
	// All media files (images and videos) use .webp extension
	// Videos are stored as MP4 with .webp extension for CDN compatibility
	filename := procgenID + ".webp"
	
	// Always return CDN URL - presigned URLs have permission issues
	// The CDN handles Content-Type headers correctly for video playback
	return "https://images.aipg.art/" + filename, nil
}

// ConvertToCDNURL converts any R2 URL to the CDN format
// Extracts the filename from the URL and returns https://images.aipg.art/{filename}
func ConvertToCDNURL(mediaURL string) string {
	// Return empty string if input is empty
	if mediaURL == "" {
		return ""
	}
	
	// If already a CDN URL, return as-is
	if strings.HasPrefix(mediaURL, "https://images.aipg.art/") {
		return mediaURL
	}
	
	// Skip data URLs (base64 encoded images)
	if strings.HasPrefix(mediaURL, "data:") {
		return mediaURL
	}
	
	// Extract filename from R2 URL
	// R2 URLs typically look like: https://...r2.cloudflarestorage.com/bucket/{filename}?...
	// Or: https://.../{filename}.webp?...
	u, err := url.Parse(mediaURL)
	if err != nil {
		// If parsing fails, try to extract filename manually
		parts := strings.Split(mediaURL, "/")
		if len(parts) > 0 {
			filename := parts[len(parts)-1]
			// Remove query params if present
			if idx := strings.Index(filename, "?"); idx != -1 {
				filename = filename[:idx]
			}
			// If no extension, add .webp
			if !strings.Contains(filename, ".") {
				filename = filename + ".webp"
			}
			return "https://images.aipg.art/" + filename
		}
		return mediaURL // Fallback to original URL
	}
	
	// Extract filename from path
	path := strings.Trim(u.Path, "/")
	if path == "" {
		// If path is empty, try to extract from the last part of the host or use the original URL
		return mediaURL
	}
	
	parts := strings.Split(path, "/")
	if len(parts) > 0 {
		filename := parts[len(parts)-1]
		// Skip if filename is empty
		if filename == "" {
			return mediaURL
		}
		// If filename has no extension, add .webp
		if !strings.Contains(filename, ".") {
			filename = filename + ".webp"
		}
		return "https://images.aipg.art/" + filename
	}
	
	return mediaURL // Fallback to original URL
}

// ObjectExists checks if an object exists in either bucket
func (c *Client) ObjectExists(ctx context.Context, objectKey string) (bool, error) {
	// Check shared bucket first
	if c.sharedClient != nil {
		_, err := c.sharedClient.HeadObject(ctx, &s3.HeadObjectInput{
			Bucket: aws.String(c.permanentBucket),
			Key:    aws.String(objectKey),
		})
		if err == nil {
			return true, nil
		}
	}

	// Check transient bucket
	if c.transientClient != nil {
		_, err := c.transientClient.HeadObject(ctx, &s3.HeadObjectInput{
			Bucket: aws.String(c.transientBucket),
			Key:    aws.String(objectKey),
		})
		if err == nil {
			return true, nil
		}
	}

	return false, nil
}

// DeleteObject deletes an object from the transient bucket
func (c *Client) DeleteObject(ctx context.Context, objectKey string) error {
	if c.transientClient == nil {
		return fmt.Errorf("no transient R2 client available")
	}
	_, err := c.transientClient.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.transientBucket),
		Key:    aws.String(objectKey),
	})
	return err
}

// IsConfigured returns true if at least one R2 client is available
func (c *Client) IsConfigured() bool {
	return c.transientClient != nil || c.sharedClient != nil
}

