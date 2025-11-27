package crypto

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

// TLSManager handles TLS certificate generation and loading
type TLSManager struct {
	certFile string
	keyFile  string
}

// NewTLSManager creates a new TLS manager
func NewTLSManager(certFile, keyFile string) *TLSManager {
	return &TLSManager{
		certFile: certFile,
		keyFile:  keyFile,
	}
}

// GenerateSelfSignedCert generates a self-signed certificate
func (m *TLSManager) GenerateSelfSignedCert(hosts []string) error {
	// Create directory if it doesn't exist
	certDir := filepath.Dir(m.certFile)
	if certDir != "" && certDir != "." {
		if err := os.MkdirAll(certDir, 0755); err != nil {
			return fmt.Errorf("failed to create cert directory: %w", err)
		}
	}

	// Generate private key
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return fmt.Errorf("failed to generate private key: %w", err)
	}

	// Generate serial number
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return fmt.Errorf("failed to generate serial number: %w", err)
	}

	// Create certificate template
	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"Bywise Network"},
			CommonName:   "Bywise Node",
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().AddDate(10, 0, 0), // Valid for 10 years
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
	}

	// Add hosts to certificate
	for _, host := range hosts {
		if ip := net.ParseIP(host); ip != nil {
			template.IPAddresses = append(template.IPAddresses, ip)
		} else {
			template.DNSNames = append(template.DNSNames, host)
		}
	}

	// Add localhost by default
	template.IPAddresses = append(template.IPAddresses, net.ParseIP("127.0.0.1"))
	template.IPAddresses = append(template.IPAddresses, net.ParseIP("::1"))
	template.DNSNames = append(template.DNSNames, "localhost")

	// Create certificate
	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &privateKey.PublicKey, privateKey)
	if err != nil {
		return fmt.Errorf("failed to create certificate: %w", err)
	}

	// Save certificate
	certFile, err := os.Create(m.certFile)
	if err != nil {
		return fmt.Errorf("failed to create cert file: %w", err)
	}
	defer certFile.Close()

	if err := pem.Encode(certFile, &pem.Block{Type: "CERTIFICATE", Bytes: certDER}); err != nil {
		return fmt.Errorf("failed to encode certificate: %w", err)
	}

	// Save private key
	keyFile, err := os.Create(m.keyFile)
	if err != nil {
		return fmt.Errorf("failed to create key file: %w", err)
	}
	defer keyFile.Close()

	keyBytes, err := x509.MarshalECPrivateKey(privateKey)
	if err != nil {
		return fmt.Errorf("failed to marshal private key: %w", err)
	}

	if err := pem.Encode(keyFile, &pem.Block{Type: "EC PRIVATE KEY", Bytes: keyBytes}); err != nil {
		return fmt.Errorf("failed to encode private key: %w", err)
	}

	// Set restrictive permissions on key file
	if err := os.Chmod(m.keyFile, 0600); err != nil {
		return fmt.Errorf("failed to set key file permissions: %w", err)
	}

	return nil
}

// LoadOrGenerateTLS loads existing TLS certificates or generates new ones
func (m *TLSManager) LoadOrGenerateTLS(hosts []string, autoGenerate bool) (*tls.Config, error) {
	// Check if certificates exist
	certExists := fileExists(m.certFile)
	keyExists := fileExists(m.keyFile)

	if !certExists || !keyExists {
		if !autoGenerate {
			return nil, fmt.Errorf("certificate files not found and auto-generate is disabled")
		}

		// Generate new certificates
		if err := m.GenerateSelfSignedCert(hosts); err != nil {
			return nil, fmt.Errorf("failed to generate certificates: %w", err)
		}
	}

	// Load certificates
	cert, err := tls.LoadX509KeyPair(m.certFile, m.keyFile)
	if err != nil {
		return nil, fmt.Errorf("failed to load certificates: %w", err)
	}

	// Create TLS config for server
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
		CipherSuites: []uint16{
			tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
		},
	}

	return tlsConfig, nil
}

// GetClientTLSConfig returns a TLS config for client connections
func GetClientTLSConfig() *tls.Config {
	return &tls.Config{
		InsecureSkipVerify: true, // Accept self-signed certificates
		MinVersion:         tls.VersionTLS12,
	}
}

// fileExists checks if a file exists
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// GenerateToken generates a random token for peer authentication
func GenerateToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate token: %w", err)
	}
	return fmt.Sprintf("%x", bytes), nil
}

// GenerateNodeID generates a unique node identifier
func GenerateNodeID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate node ID: %w", err)
	}
	return fmt.Sprintf("node-%x", bytes), nil
}
