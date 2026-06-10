package backup

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

func TestRunCreatesZipArchive(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	destination := filepath.Join(root, "backups")
	mustWrite(t, filepath.Join(source, "docs", "one.txt"), "one")
	mustWrite(t, filepath.Join(source, "two.log"), "two")

	result, err := Run(Request{
		Source:      source,
		Destination: destination,
		Name:        "daily",
	})
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}

	if result.Files != 2 {
		t.Fatalf("Files = %d, want 2", result.Files)
	}
	if _, err := os.Stat(result.Archive); err != nil {
		t.Fatalf("archive was not created: %v", err)
	}

	names := zipNames(t, result.Archive)
	for _, want := range []string{"source/docs/one.txt", "source/two.log"} {
		if !contains(names, want) {
			t.Fatalf("archive names = %v, missing %q", names, want)
		}
	}
}

func TestRunExcludesMatchingItems(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	mustWrite(t, filepath.Join(source, "keep.txt"), "keep")
	mustWrite(t, filepath.Join(source, "skip.tmp"), "skip")

	result, err := Run(Request{
		Source:      source,
		Destination: filepath.Join(root, "backups"),
		Name:        "filtered",
		Exclude:     []string{"*.tmp"},
	})
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}

	names := zipNames(t, result.Archive)
	if contains(names, "source/skip.tmp") {
		t.Fatalf("excluded file was archived: %v", names)
	}
	if !contains(names, "source/keep.txt") {
		t.Fatalf("expected file was not archived: %v", names)
	}
}

func TestRunHonorsMaxBytes(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	mustWrite(t, filepath.Join(source, "one.txt"), "12345")
	mustWrite(t, filepath.Join(source, "two.txt"), "12345")

	result, err := Run(Request{
		Source:      source,
		Destination: filepath.Join(root, "backups"),
		Name:        "limited",
		MaxBytes:    5,
	})
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}

	if result.Files != 1 {
		t.Fatalf("Files = %d, want 1", result.Files)
	}
	if result.Skipped != 1 {
		t.Fatalf("Skipped = %d, want 1", result.Skipped)
	}
}

func mustWrite(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(contents), 0644); err != nil {
		t.Fatalf("write file: %v", err)
	}
}

func zipNames(t *testing.T, path string) []string {
	t.Helper()
	reader, err := zip.OpenReader(path)
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	defer reader.Close()

	names := make([]string, 0, len(reader.File))
	for _, file := range reader.File {
		names = append(names, file.Name)
	}
	return names
}

func contains(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}
