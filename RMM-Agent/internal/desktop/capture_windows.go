//go:build windows

package desktop

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	"runtime"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32dll = windows.NewLazySystemDLL("user32.dll")
	gdi32dll  = windows.NewLazySystemDLL("gdi32.dll")

	procGetDC            = user32dll.NewProc("GetDC")
	procReleaseDC        = user32dll.NewProc("ReleaseDC")
	procGetSystemMetrics = user32dll.NewProc("GetSystemMetrics")

	procSetProcessDpiAwarenessContext = user32dll.NewProc("SetProcessDpiAwarenessContext")
	procSetProcessDPIAware            = user32dll.NewProc("SetProcessDPIAware")
	procOpenInputDesktop              = user32dll.NewProc("OpenInputDesktop")
	procSetThreadDesktop              = user32dll.NewProc("SetThreadDesktop")

	procCreateCompatibleDC     = gdi32dll.NewProc("CreateCompatibleDC")
	procCreateCompatibleBitmap = gdi32dll.NewProc("CreateCompatibleBitmap")
	procSelectObject           = gdi32dll.NewProc("SelectObject")
	procBitBlt                 = gdi32dll.NewProc("BitBlt")
	procGetDIBits              = gdi32dll.NewProc("GetDIBits")
	procDeleteObject           = gdi32dll.NewProc("DeleteObject")
	procDeleteDC               = gdi32dll.NewProc("DeleteDC")

	dpiOnce sync.Once
)

// dpiAwarePerMonitorV2 is DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 ((HANDLE)-4).
const dpiAwarePerMonitorV2 = ^uintptr(3)

// setDPIAware makes this process DPI-aware so screen metrics, GDI capture, and
// SetCursorPos all operate in true physical pixels. Without it, on a scaled
// display (e.g. 150%) GetSystemMetrics reports a smaller logical size while
// BitBlt reads physical pixels — capturing only the top-left corner (the
// "zoomed in" symptom) and throwing cursor coordinates out of alignment.
func setDPIAware() {
	dpiOnce.Do(func() {
		if procSetProcessDpiAwarenessContext.Find() == nil {
			if ret, _, _ := procSetProcessDpiAwarenessContext.Call(dpiAwarePerMonitorV2); ret != 0 {
				return
			}
		}
		// Fallback for Windows < 10 1703: system-DPI aware.
		procSetProcessDPIAware.Call()
	})
}

const genericAll = 0x10000000

// lockToInputDesktop locks the calling goroutine to its OS thread and attaches
// that thread to the active input desktop. Go schedules goroutines across OS
// threads that may not be attached to the input desktop; binding is required for
// both screen capture (else GDI returns a black frame) and input injection (else
// SetCursorPos/keybd_event silently no-op). The lock is intentionally never
// released so the thread stays bound for the goroutine's life.
func lockToInputDesktop() {
	runtime.LockOSThread()
	if h, _, _ := procOpenInputDesktop.Call(0, 0, genericAll); h != 0 {
		procSetThreadDesktop.Call(h)
	}
}

// bitmapInfoHeader mirrors BITMAPINFOHEADER (40 bytes, matches Win32 exactly).
type bitmapInfoHeader struct {
	size          uint32
	width         int32
	height        int32
	planes        uint16
	bitCount      uint16
	compression   uint32
	sizeImage     uint32
	xPelsPerMeter int32
	yPelsPerMeter int32
	clrUsed       uint32
	clrImportant  uint32
}

func captureScreen() (string, int, int, error) {
	setDPIAware()

	sw, _, _ := procGetSystemMetrics.Call(0) // SM_CXSCREEN
	sh, _, _ := procGetSystemMetrics.Call(1) // SM_CYSCREEN
	w, h := int(sw), int(sh)

	screenDC, _, _ := procGetDC.Call(0)
	if screenDC == 0 {
		return "", 0, 0, fmt.Errorf("GetDC failed")
	}
	defer procReleaseDC.Call(0, screenDC)

	memDC, _, _ := procCreateCompatibleDC.Call(screenDC)
	if memDC == 0 {
		return "", 0, 0, fmt.Errorf("CreateCompatibleDC failed")
	}
	defer procDeleteDC.Call(memDC)

	bmp, _, _ := procCreateCompatibleBitmap.Call(screenDC, sw, sh)
	if bmp == 0 {
		return "", 0, 0, fmt.Errorf("CreateCompatibleBitmap failed")
	}
	defer procDeleteObject.Call(bmp)

	// Select bitmap into memDC, capture screen, then deselect before GetDIBits.
	prevBmp, _, _ := procSelectObject.Call(memDC, bmp)
	procBitBlt.Call(memDC, 0, 0, sw, sh, screenDC, 0, 0, 0x00CC0020) // SRCCOPY
	procSelectObject.Call(memDC, prevBmp)

	bi := bitmapInfoHeader{
		size:     uint32(unsafe.Sizeof(bitmapInfoHeader{})),
		width:    int32(w),
		height:   -int32(h), // negative = top-down DIB
		planes:   1,
		bitCount: 32,
	}
	pixels := make([]byte, w*h*4)
	procGetDIBits.Call(
		screenDC, bmp, 0, sh,
		uintptr(unsafe.Pointer(&pixels[0])),
		uintptr(unsafe.Pointer(&bi)),
		0, // DIB_RGB_COLORS
	)

	// GDI returns BGRA; convert to RGBA for image/jpeg.
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for i := 0; i < len(pixels); i += 4 {
		img.Pix[i+0] = pixels[i+2] // R
		img.Pix[i+1] = pixels[i+1] // G
		img.Pix[i+2] = pixels[i+0] // B
		img.Pix[i+3] = 255
	}

	return encodeRGBA(img)
}

// maxCaptureWidth caps the streamed frame width. High-res screens (e.g.
// 2880px) produce huge JPEGs that saturate the link and make remote desktop
// laggy; downscaling to this keeps the stream responsive.
const maxCaptureWidth = 1366

// encodeRGBA downscales (if needed) then JPEG-encodes a frame to base64, also
// returning the encoded dimensions so the client maps input coordinates to the
// scaled image.
func encodeRGBA(src *image.RGBA) (string, int, int, error) {
	img := downscaleRGBA(src, maxCaptureWidth)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 40}); err != nil {
		return "", 0, 0, err
	}
	b := img.Bounds()
	return base64.StdEncoding.EncodeToString(buf.Bytes()), b.Dx(), b.Dy(), nil
}

// downscaleRGBA nearest-neighbour scales src down so its width is at most maxW
// (cheap — the goal is to reduce load, not add it). Returns src unchanged if it
// already fits.
func downscaleRGBA(src *image.RGBA, maxW int) *image.RGBA {
	w := src.Rect.Dx()
	h := src.Rect.Dy()
	if maxW <= 0 || w <= maxW {
		return src
	}
	nw := maxW
	nh := h * maxW / w
	if nh < 1 {
		nh = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	for y := 0; y < nh; y++ {
		sy := y * h / nh
		rowStart := src.PixOffset(src.Rect.Min.X, src.Rect.Min.Y+sy)
		srow := src.Pix[rowStart:]
		drow := dst.Pix[y*dst.Stride:]
		for x := 0; x < nw; x++ {
			si := (x * w / nw) * 4
			copy(drow[x*4:x*4+4], srow[si:si+4])
		}
	}
	return dst
}
