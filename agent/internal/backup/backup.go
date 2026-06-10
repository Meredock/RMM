package backup

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type Request struct {
	Source      string   `json:"source,omitempty"`
	Sources     []string `json:"sources,omitempty"`
	Destination string   `json:"destination,omitempty"`
	Name        string   `json:"name,omitempty"`
	Exclude     []string `json:"exclude,omitempty"`
	MaxBytes    int64    `json:"maxBytes,omitempty"`
}

type Result struct {
	Archive      string   `json:"archive"`
	Files        int      `json:"files"`
	Bytes        int64    `json:"bytes"`
	Skipped      int      `json:"skipped"`
	SkippedItems []string `json:"skippedItems,omitempty"`
	StartedAt    string   `json:"startedAt"`
	CompletedAt  string   `json:"completedAt"`
}

func RunJSON(payload string) (string, error) {
	var req Request
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", fmt.Errorf("invalid backup request JSON: %w", err)
	}

	result, err := Run(req)
	if err != nil {
		return "", err
	}

	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func Run(req Request) (*Result, error) {
	started := time.Now()
	sources := normalizeSources(req)
	if len(sources) == 0 {
		return nil, errors.New("backup requires source or sources")
	}

	destination := req.Destination
	if strings.TrimSpace(destination) == "" {
		destination = defaultDestination()
	}
	if err := os.MkdirAll(destination, 0755); err != nil {
		return nil, fmt.Errorf("create backup destination: %w", err)
	}

	name := safeArchiveName(req.Name)
	if name == "" {
		name = "backup-" + started.Format("20060102-150405")
	}
	archivePath := filepath.Join(destination, name+".zip")

	archiveFile, err := os.Create(archivePath)
	if err != nil {
		return nil, fmt.Errorf("create backup archive: %w", err)
	}
	defer archiveFile.Close()

	writer := zip.NewWriter(archiveFile)
	result := &Result{
		Archive:   archivePath,
		StartedAt: started.Format(time.RFC3339),
	}

	for _, source := range sources {
		if err := addSource(writer, source, archivePath, req, result); err != nil {
			writer.Close()
			return nil, err
		}
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("finalize backup archive: %w", err)
	}

	result.CompletedAt = time.Now().Format(time.RFC3339)
	return result, nil
}

func normalizeSources(req Request) []string {
	var sources []string
	if strings.TrimSpace(req.Source) != "" {
		sources = append(sources, req.Source)
	}
	for _, source := range req.Sources {
		if strings.TrimSpace(source) != "" {
			sources = append(sources, source)
		}
	}
	return sources
}

func addSource(writer *zip.Writer, source, archivePath string, req Request, result *Result) error {
	sourceAbs, err := filepath.Abs(source)
	if err != nil {
		return fmt.Errorf("resolve source %q: %w", source, err)
	}

	info, err := os.Stat(sourceAbs)
	if err != nil {
		return fmt.Errorf("stat source %q: %w", source, err)
	}

	parent := filepath.Dir(sourceAbs)
	if !info.IsDir() {
		parent = filepath.Dir(sourceAbs)
	}

	return filepath.WalkDir(sourceAbs, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			recordSkipped(result, path, walkErr)
			if entry != nil && entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		if shouldExclude(path, req.Exclude) || samePath(path, archivePath) {
			recordSkipped(result, path, nil)
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			recordSkipped(result, path, err)
			return nil
		}

		if info.IsDir() {
			return nil
		}
		if !info.Mode().IsRegular() {
			recordSkipped(result, path, nil)
			return nil
		}
		if req.MaxBytes > 0 && result.Bytes+info.Size() > req.MaxBytes {
			recordSkipped(result, path, errors.New("maxBytes exceeded"))
			return nil
		}

		return addFile(writer, path, parent, info, result)
	})
}

func addFile(writer *zip.Writer, path, parent string, info fs.FileInfo, result *Result) error {
	rel, err := filepath.Rel(parent, path)
	if err != nil {
		return fmt.Errorf("make archive path for %q: %w", path, err)
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return fmt.Errorf("create zip header for %q: %w", path, err)
	}
	header.Name = filepath.ToSlash(rel)
	header.Method = zip.Deflate

	fileWriter, err := writer.CreateHeader(header)
	if err != nil {
		return fmt.Errorf("add file to backup %q: %w", path, err)
	}

	file, err := os.Open(path)
	if err != nil {
		recordSkipped(result, path, err)
		return nil
	}
	defer file.Close()

	written, err := io.Copy(fileWriter, file)
	if err != nil {
		return fmt.Errorf("write backup file %q: %w", path, err)
	}

	result.Files++
	result.Bytes += written
	return nil
}

func shouldExclude(path string, patterns []string) bool {
	cleanPath := filepath.Clean(path)
	base := filepath.Base(cleanPath)
	for _, pattern := range patterns {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			continue
		}
		if matched, _ := filepath.Match(pattern, base); matched {
			return true
		}
		if matched, _ := filepath.Match(filepath.Clean(pattern), cleanPath); matched {
			return true
		}
		if strings.Contains(cleanPath, filepath.Clean(pattern)) {
			return true
		}
	}
	return false
}

func recordSkipped(result *Result, path string, err error) {
	result.Skipped++
	if len(result.SkippedItems) >= 25 {
		return
	}
	if err != nil {
		result.SkippedItems = append(result.SkippedItems, fmt.Sprintf("%s: %v", path, err))
		return
	}
	result.SkippedItems = append(result.SkippedItems, path)
}

func safeArchiveName(name string) string {
	name = strings.TrimSpace(name)
	name = strings.TrimSuffix(name, ".zip")
	if name == "" {
		return ""
	}

	replacer := strings.NewReplacer(
		"/", "-", "\\", "-", ":", "-", "*", "-", "?", "-",
		"\"", "-", "<", "-", ">", "-", "|", "-",
	)
	return strings.Trim(replacer.Replace(name), ". ")
}

func samePath(a, b string) bool {
	aAbs, aErr := filepath.Abs(a)
	bAbs, bErr := filepath.Abs(b)
	if aErr != nil || bErr != nil {
		return false
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(aAbs, bAbs)
	}
	return aAbs == bAbs
}

func defaultDestination() string {
	if runtime.GOOS == "windows" {
		base := os.Getenv("PROGRAMDATA")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "RMMAgent", "backups")
	}
	return "/var/lib/rmm-agent/backups"
}
