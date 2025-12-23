package r2

import (
	"context"
	"fmt"
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

// GenerateMediaURL returns a URL for accessing the media
func (c *Client) GenerateMediaURL(ctx context.Context, procgenID string, mediaType string) (string, error) {
	// Determine the file extension based on media type
	ext := ".webp"
	if mediaType == "video" {
		ext = ".mp4"
	}
	objectKey := procgenID + ext

	// Generate a presigned URL (valid for 30 minutes)
	return c.GenerateDownloadURL(ctx, objectKey, 30*time.Minute)
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

